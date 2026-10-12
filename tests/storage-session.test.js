import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { buildSummary, computeTotals } from '../src/lib/excel/aggregate.js';
import { categorizeFile } from '../src/lib/excel/categorize.js';
import { MONTH_KEYS, PLANTS, dailySheetName } from '../src/constants.js';
import { createStorage, createMemoryBackend, createRegistry, STORAGE_UNAVAILABLE_MESSAGE, migrate, SCHEMA_VERSION } from '../src/lib/storage/index.js';
import { createStorageSession } from '../src/features/storage-session/controller.js';
import { planEdits } from '../src/features/storage-session/restore.js';
import { collectEdits, describeSession } from '../src/features/storage-session/session.js';
import { formatDate } from '../src/utils/format.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;

const newStorage = (opts = {}) => createStorage({ backend: createMemoryBackend(), prefsBackend: createMemoryBackend(), ...opts });
const files = () => SOURCE_FILES.map((p) => new File([fixture(p)], path.basename(p)));

// A synchronous stand-in for useConsolidator built from the same pure lib functions
// (the real hook is covered by the e2e flow). Mirrors processAll / updateRowValues semantics.
function fakeApp() {
  let seq = 0;
  const state = { template: null, sourceFiles: [], processedData: null, summaryData: null, changeLog: [], productionMonth: null, notice: null, error: null };
  const actions = {
    setTemplateFile: async (f) => { state.template = { name: f.name, size: f.size, buffer: await f.arrayBuffer() }; },
    addSourceFiles: (fs_) => Array.from(fs_).forEach((file) => state.sourceFiles.push({ id: `f${++seq}`, name: file.name, size: file.size, category: categorizeFile(file.name), file, status: 'ready', rowCount: 0, meta: null })),
    processAll: async () => {
      const data = Object.fromEntries(PLANTS.map((p) => [dailySheetName(p), []]));
      for (const f of state.sourceFiles) {
        const { rows, meta } = readSourceBuffer(await f.file.arrayBuffer());
        rows.forEach((row, i) => Object.assign(row, { id: `${f.id}-${i}`, plant: f.category, fileName: f.name }) && data[dailySheetName(f.category)].push(row));
        Object.assign(f, { status: 'done', rowCount: rows.length, meta });
        state.productionMonth = meta.productionMonth;
      }
      const { summary } = buildSummary(data);
      Object.assign(state, { processedData: data, summaryData: summary });
      return { processedData: data, summary, productionMonth: state.productionMonth, files: state.sourceFiles };
    },
    updateRowValues: (sheet, rowId, patch) => {
      const rows = state.processedData[sheet];
      const i = rows.findIndex((r) => r.id === rowId);
      if (i < 0) return false;
      const row = { ...rows[i], edited: true };
      let changed = false;
      MONTH_KEYS.forEach((k) => { if (patch[k] !== undefined && patch[k] !== row[k]) { row[k] = patch[k]; changed = true; } });
      if (!changed) return false;
      const next = { ...state.processedData, [sheet]: rows.map((r, j) => (j === i ? row : r)) };
      Object.assign(state, { processedData: next, summaryData: buildSummary(next).summary });
      state.changeLog.push({ action: 'edit', partNumber: row.partNumber });
      return true;
    },
    log: (e) => state.changeLog.push(...[].concat(e)),
    setNotice: (m) => { state.notice = m; },
    setError: (m) => { state.error = m; },
  };
  return { state, actions, ctx: () => ({ state, actions }) };
}

const editFirstRow = (app) => {
  const sheet = dailySheetName('BP');
  const row = app.state.processedData[sheet][0];
  app.actions.updateRowValues(sheet, row.id, { n: row.n + 111 });
  return row;
};

const controller = (storage = newStorage(), extra = {}) => createStorageSession({ storage, ...extra });

describe('storage-session: save -> restore', () => {
  it('round-trips files, edits and changelog; totals match; second save replaces the first', async () => {
    const storage = newStorage();
    const c = controller(storage);
    await c.init();
    await c.setPrefs({ saveSession: true });

    const a = fakeApp();
    a.actions.addSourceFiles(files());
    await a.actions.processAll();
    const edited = editFirstRow(a);
    const before = computeTotals(a.state.summaryData);

    expect((await c.saveSession(a.state)).ok).toBe(true);
    await c.saveSession(a.state); // second save
    const sessionRecords = await storage.list('session');
    expect(sessionRecords.map((r) => r.key).sort()).toEqual(['session.data', 'session.meta']); // still just one session

    const original = await files()[0].arrayBuffer();
    const b = fakeApp();
    const out = await c.restoreSession(b.ctx);
    expect(out.ok).toBe(true);
    expect(out.edits).toHaveLength(1);
    expect(out.edits[0]).toMatchObject({ plant: 'BP', partNumber: edited.partNumber, n: edited.n + 111 });
    expect(out.fileMeta.map((f) => f.name)).toEqual(a.state.sourceFiles.map((f) => f.name));
    expect(out.changeLog).toEqual(a.state.changeLog);
    expect(b.state.sourceFiles[0].file.size).toBe(original.byteLength);
    const restored = new Uint8Array(await b.state.sourceFiles[0].file.arrayBuffer());
    expect([...restored.slice(0, 4)]).toEqual([...new Uint8Array(original).slice(0, 4)]);
    expect(computeTotals(b.state.summaryData)).toEqual(before);
    expect(b.state.changeLog.some((l) => l.action === 'restore')).toBe(true);
    expect(b.state.notice).toBeNull();
  });

  it('reports an edit whose part no longer exists as an orphan', async () => {
    const a = fakeApp();
    a.actions.addSourceFiles(files());
    await a.actions.processAll();
    editFirstRow(a);
    const edits = collectEdits(a.state.processedData);
    const gone = { ...edits[0], key: 'BP|MISSING-PART|X', partNumber: 'MISSING-PART', dock: 'X' };
    const { matched, orphans } = planEdits(a.state.processedData, [edits[0], gone]);
    expect(matched).toHaveLength(1);
    expect(orphans).toEqual(['BP|MISSING-PART|X']);

    // through the whole restore path
    const storage = newStorage();
    const c = controller(storage);
    await c.init();
    await c.setPrefs({ saveSession: true });
    await c.saveSession(a.state);
    const rec = await storage.get('session', 'session.data');
    rec.edits.push(gone);
    await storage.put('session', 'session.data', rec);
    const b = fakeApp();
    const out = await c.restoreSession(b.ctx);
    expect(out.orphans).toEqual(['BP|MISSING-PART|X']);
    expect(b.state.notice).toContain('1 รายการ');
  });

  it('describes the saved session for the banner', () => {
    const text = describeSession({ savedAt: Date.now(), productionMonth: { year: 2026, month: 2 }, fileCount: 5, editCount: 2 }, { formatDate });
    expect(text).toMatch(/^พบงานค้างเมื่อ \d{2}:\d{2} · เดือนผลิต Feb'26 · 5 ไฟล์ · แก้ไข 2 รายการ$/);
  });
});

describe('storage-session: opt-in policy', () => {
  it('writes nothing to the session tier while the flag is off (save and autosave)', async () => {
    vi.useFakeTimers();
    const storage = newStorage();
    const c = controller(storage);
    await c.init();
    const a = fakeApp();
    a.actions.addSourceFiles(files());
    await a.actions.processAll();
    expect(await c.saveSession(a.state)).toMatchObject({ ok: false, reason: 'disabled' });
    c.scheduleAutosave(() => a.state);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await storage.list('session')).toEqual([]);
    expect(await storage.list('template')).toEqual([]);
    vi.useRealTimers();
  });

  it('debounced autosave writes once per burst', async () => {
    vi.useFakeTimers();
    const storage = newStorage();
    const put = vi.spyOn(storage, 'put');
    const c = controller(storage, { debounceMs: 1000 });
    await c.init();
    await c.setPrefs({ saveSession: true });
    const a = fakeApp();
    a.actions.addSourceFiles(files());
    await a.actions.processAll();
    put.mockClear();
    for (let i = 0; i < 5; i++) { c.scheduleAutosave(() => a.state); await vi.advanceTimersByTimeAsync(200); }
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    const sessionWrites = put.mock.calls.filter(([tier]) => tier === 'session');
    expect(sessionWrites.map((c_) => c_[1])).toEqual(['session.data', 'session.meta']); // one save = data + meta
    vi.useRealTimers();
  });

  it('template: not remembered unless asked; forget removes only the template', async () => {
    const storage = newStorage();
    const c = controller(storage);
    await c.init();
    expect(await storage.list('template')).toEqual([]);

    await c.setPrefs({ saveSession: true });
    const a = fakeApp();
    a.actions.addSourceFiles(files());
    await a.actions.processAll();
    await c.saveSession(a.state);

    const buffer = fixture('template.xlsx');
    expect(await c.rememberTemplate({ name: 'template.xlsx', size: buffer.byteLength, buffer })).toBe(true);
    expect(c.snapshot().templateMeta).toMatchObject({ name: 'template.xlsx', size: buffer.byteLength });
    expect(c.snapshot().templateMeta.sha256).toMatch(/^[0-9a-f]{8}$/);
    const file = await c.loadTemplateFile();
    expect(file.size).toBe(buffer.byteLength);

    await c.forgetTemplate();
    expect(await storage.list('template')).toEqual([]);
    expect((await storage.list('session')).length).toBe(2);
  });
});

describe('storage layer', () => {
  it('migrates a v1 record, sweeps expired ones and keeps fresh ones', async () => {
    const backend = createMemoryBackend();
    const t0 = Date.now();
    await backend.put('session', 'session.meta', { schemaVersion: 1, key: 'session.meta', savedAt: t0 - 1000, value: { a: 1 } });
    const s = createStorage({ backend, prefsBackend: createMemoryBackend() });
    const rec = await s.getRecord('session', 'session.meta');
    expect(rec).toMatchObject({ schemaVersion: SCHEMA_VERSION, tier: 'session', value: { a: 1 } });
    expect(rec.expiresAt).toBeGreaterThan(t0);
    expect(migrate({ key: 'x', savedAt: 1, value: 'v' }, 1, 2, { tier: 'runs' })).toMatchObject({ schemaVersion: 2, tier: 'runs', expiresAt: null });

    let clock = t0;
    const s2 = createStorage({ backend: createMemoryBackend(), prefsBackend: createMemoryBackend(), now: () => clock });
    await s2.put('session', 'session.meta', { fresh: false });
    clock += 3 * DAY;
    await s2.put('session', 'session.data', { fresh: true });
    clock += 5 * DAY; // meta is 8 days old (7 day retention), data is 5 days old
    expect(await s2.sweepExpired()).toBe(1);
    expect(await s2.get('session', 'session.meta')).toBeUndefined();
    expect(await s2.get('session', 'session.data')).toEqual({ fresh: true });
  });

  it('inventory lists registered keys only; unregistered writes throw in DEV; wipeAll clears every store and moowhan.* key', async () => {
    const registry = createRegistry();
    registry.register({ key: 'runs.*', tier: 'runs', purpose: 'ประวัติการรัน', retention: 90 });
    const backend = createMemoryBackend();
    const store = new Map([['moowhan.other', '1'], ['unrelated', '1']]);
    const ls = { get length() { return store.size; }, key: (i) => [...store.keys()][i], getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const { createLocalStorageBackend } = await import('../src/lib/storage/backends/localstorage.js');
    const s = createStorage({ backend, prefsBackend: createLocalStorageBackend(ls), registry });
    registry.register({ key: 'prefs.x', tier: 'prefs', purpose: 'ทดสอบ', retention: null });

    await expect(s.put('runs', 'nope', 1)).rejects.toThrow(/ยังไม่ได้ลงทะเบียน/);
    await s.put('runs', 'runs.2026-02', { total: 1 });
    await s.put('prefs', 'prefs.x', { a: 1 });
    await backend.put('runs', 'stray', { schemaVersion: 2, key: 'stray', tier: 'runs', savedAt: Date.now(), expiresAt: null, size: 1, value: 1 });
    const inv = await s.inventory();
    expect(inv.map((r) => r.key).sort()).toEqual(['prefs.x', 'runs.2026-02']);
    expect(inv[0]).toHaveProperty('purpose');
    expect(store.has('moowhan.prefs.prefs.x')).toBe(true);

    await s.wipeAll();
    expect(await s.inventory()).toEqual([]);
    expect(await backend.getAll('runs')).toEqual([]);
    expect([...store.keys()]).toEqual(['unrelated']);
  });

  it('degrades to memory with a single warning when the backend throws', async () => {
    const boom = { name: 'broken', open: async () => { throw new Error('private mode'); }, get: async () => { throw new Error('x'); }, put: async () => { throw new Error('x'); }, delete: async () => { throw new Error('x'); }, getAll: async () => { throw new Error('x'); }, clear: async () => { throw new Error('x'); }, clearAll: async () => { throw new Error('x'); } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = createStorage({ backend: boom, prefsBackend: createMemoryBackend() });
    const seen = [];
    s.subscribe((st) => seen.push(st));
    const c = createStorageSession({ storage: s });
    await c.init();
    await c.setPrefs({ saveSession: true });
    const a = fakeApp();
    a.actions.addSourceFiles(files());
    await a.actions.processAll(); // the app keeps working
    await c.saveSession(a.state);
    await s.inventory();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ degraded: true, backend: 'memory', message: STORAGE_UNAVAILABLE_MESSAGE });
    expect(c.snapshot().degraded).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('policy: only src/lib/storage touches browser storage', () => {
  // dock-analysis and daily-grid predate the storage layer; migrate them to registerKey/getStorage and drop them from this list.
  const LEGACY = ['src/features/dock-analysis/master.js', 'src/features/daily-grid/views.js'];
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  it('indexedDB/localStorage/sessionStorage appear only inside src/lib/storage', () => {
    const offenders = walk(path.join(ROOT, 'src'))
      .filter((f) => /\.(js|jsx)$/.test(f))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
      .filter((rel) => !rel.startsWith('src/lib/storage/') && !LEGACY.includes(rel))
      .filter((rel) => /\b(indexedDB|localStorage|sessionStorage)\b/.test(stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

afterEach(() => vi.useRealTimers());
