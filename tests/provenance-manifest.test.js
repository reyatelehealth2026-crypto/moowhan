import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { buildSummary, computeTotals } from '../src/lib/excel/aggregate.js';
import { categorizeFile } from '../src/lib/excel/categorize.js';
import { dailySheetName, PLANTS } from '../src/constants.js';
import { setClock, withClock, now, today } from '../src/utils/clock.js';
import { todayStamp, parseProductionMonth } from '../src/utils/format.js';
import { sha256 } from '../src/utils/hash.js';
import { buildManifest, ensureHashes, manifestToAoa, manifestJson } from '../src/features/provenance-manifest/manifest.js';
import { writeProvenance, readProvenance, stampSubset } from '../src/features/provenance-manifest/stamp.js';
import { makeSentRecord, isStaleSent, sentChipText, dataSignature } from '../src/features/provenance-manifest/sent.js';
import { fixture, SOURCE_FILES } from './helpers.js';

const indep = (buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const schema = JSON.parse(fs.readFileSync(path.resolve('docs/schema/manifest.schema.json'), 'utf8'));

// minimal JSON-schema checker (type/const/required/properties/items/pattern)
const validate = (value, sch, at = '$') => {
  const errs = [];
  const types = sch.type ? [].concat(sch.type) : null;
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  if (types && !types.includes(typeOf(value))) return [`${at}: type ${typeOf(value)} not in ${types}`];
  if ('const' in sch && value !== sch.const) errs.push(`${at}: const`);
  if (sch.pattern && !new RegExp(sch.pattern).test(value)) errs.push(`${at}: pattern`);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    (sch.required || []).forEach((k) => { if (!(k in value)) errs.push(`${at}.${k}: missing`); });
    Object.entries(sch.properties || {}).forEach(([k, s]) => { if (k in value) errs.push(...validate(value[k], s, `${at}.${k}`)); });
  }
  if (Array.isArray(value) && sch.items) value.forEach((v, i) => errs.push(...validate(v, sch.items, `${at}[${i}]`)));
  return errs;
};

const buildState = async (hashFn = sha256) => {
  const tplBuf = fixture('template.xlsx');
  const processedData = Object.fromEntries(PLANTS.map((p) => [dailySheetName(p), []]));
  const sourceFiles = [];
  for (const rel of SOURCE_FILES) {
    const buf = fixture(rel);
    const name = path.basename(rel);
    const category = categorizeFile(name);
    const { rows, meta } = readSourceBuffer(buf);
    rows.forEach((r, i) => { r.id = `${name}-${i}`; r.plant = category; r.fileName = name; processedData[dailySheetName(category)].push(r); });
    sourceFiles.push({ id: name, name, size: buf.byteLength, category, status: 'done', rowCount: rows.length, meta, _buf: buf });
  }
  const hashed = await ensureHashes(sourceFiles, (f) => f._buf, hashFn);
  const { summary } = buildSummary(processedData);
  const template = (await ensureHashes([{ name: 'template.xlsx', size: tplBuf.byteLength, _buf: tplBuf }], (t) => t._buf, hashFn))[0];
  return {
    template, sourceFiles: hashed, processedData, summaryData: summary, totals: computeTotals(summary),
    productionMonth: parseProductionMonth('202602'), changeLog: [], features: {}, exportReport: null,
  };
};

afterEach(() => setClock(null));

describe('clock', () => {
  it('withClock pins todayStamp and restores afterwards', () => {
    expect(withClock('2026-02-01T00:00:00Z', () => todayStamp())).toBe('2026-02-01');
    expect(today()).not.toBe('2026-02-01');
    expect(withClock(new Date('2026-03-04T05:06:07Z'), () => now().toISOString())).toBe('2026-03-04T05:06:07.000Z');
  });
  it('restores after async work and after a throw', async () => {
    await withClock('2026-02-01T00:00:00Z', async () => { await null; expect(todayStamp()).toBe('2026-02-01'); });
    expect(todayStamp()).not.toBe('2026-02-01');
    expect(() => withClock('2026-02-01T00:00:00Z', () => { throw new Error('x'); })).toThrow('x');
    expect(todayStamp()).not.toBe('2026-02-01');
  });
});

describe('sha256', () => {
  it('matches the known vector and an independent digest', async () => {
    expect(await sha256(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const buf = fixture('template.xlsx');
    expect(await sha256(buf)).toBe(indep(buf));
    expect(await sha256(new Blob([buf]))).toBe(indep(buf));
  });
  it("returns 'n/a' when crypto.subtle is missing", async () => {
    vi.stubGlobal('crypto', {});
    try { expect(await sha256(new Uint8Array([1]))).toBe('n/a'); } finally { vi.unstubAllGlobals(); }
  });
});

describe('patcher determinism', () => {
  const pd = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  it('is byte-identical with clocks 10 s apart; entries keep their dates, new ones use 1980-01-01', async () => {
    const run = (iso) => withClock(iso, () => patchTemplate(fixture('template.xlsx'), { processedData: pd, extraSheets: [{ name: 'Run Info', aoa: [['moowhan run manifest']] }] }));
    const a = await run('2026-02-01T00:00:00Z');
    const b = await run('2026-02-01T00:00:10Z');
    expect(indep(a.buffer)).toBe(indep(b.buffer));
    const orig = await JSZip.loadAsync(fixture('template.xlsx'));
    const out = await JSZip.loadAsync(a.buffer);
    const wb = 'xl/workbook.xml';
    expect(out.file(wb).date.getTime()).toBe(orig.file(wb).date.getTime());
    const created = Object.keys(out.files).filter((p) => !orig.files[p] && !out.files[p].dir);
    expect(created.length).toBeGreaterThan(0);
    created.forEach((p) => expect(out.files[p].date.toISOString().slice(0, 10)).toBe('1980-01-01'));
  });
});

describe('manifest', () => {
  it('lists 5 hashed files with totals equal to computeTotals; hashes once per buffer', async () => {
    const calls = [];
    const counting = async (b) => { calls.push(1); return sha256(b); };
    const state = await buildState(counting);
    expect(calls).toHaveLength(6);
    // later consumers reuse entry.sha256
    await ensureHashes(state.sourceFiles, () => { throw new Error('should not read'); }, counting);
    expect(calls).toHaveLength(6);

    const m = buildManifest(state, { now: '2026-02-01T00:00:00Z' });
    expect(m.files).toHaveLength(5);
    m.files.forEach((f) => { expect(f.sha256).toMatch(/^[0-9a-f]{64}$/); expect(f.revision).not.toBe(''); expect(f.issueDate).not.toBe(''); });
    expect(m.productionMonth).toBe('202602');
    expect(m.totals.overall).toEqual(computeTotals(state.summaryData));
    expect(m.template.sha256).toBe(indep(fixture('template.xlsx')));
    expect(m.edits).toEqual([]);
    expect(m.generatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('references edits by plant|part|dock only and validates against the schema', async () => {
    const state = await buildState();
    state.changeLog = [{ action: 'edit', plant: 'BP', partNumber: 'P-1', dockCode: 'D1', details: 'N: 1 → 99' }, { action: 'export' }];
    const m = buildManifest(state);
    expect(m.edits).toEqual([{ key: 'BP|P-1|D1', plant: 'BP', partNumber: 'P-1', dockCode: 'D1', count: 1 }]);
    expect(JSON.stringify(m.edits)).not.toContain('99');
    const parsed = JSON.parse(manifestJson(m));
    expect(parsed.schemaVersion).toBe(1);
    expect(validate(parsed, schema)).toEqual([]);
    expect(validate({ ...parsed, schemaVersion: 2 }, schema)).not.toEqual([]);
  });

  it('Run Info rows start with the marker and list one row per file', async () => {
    const aoa = manifestToAoa(buildManifest(await buildState()));
    expect(aoa[0][0]).toBe('moowhan run manifest');
    expect(aoa.filter((r) => r[0]?.endsWith?.('.xls'))).toHaveLength(5);
  });

  it('Run Info export never replaces an existing template sheet', async () => {
    const state = await buildState();
    const aoa = manifestToAoa(buildManifest(state));
    const { blob } = await buildExport({ template: { buffer: fixture('template.xlsx') }, processedData: state.processedData, summaryData: state.summaryData, extraSheets: [{ name: 'Run Info', aoa }, { name: 'Sheet2', aoa: [['x']] }] });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toContain('name="Run Info"');
    expect(wb.match(/name="Sheet2"/g)).toHaveLength(1);
  });
});

describe('stamp', () => {
  it('round-trips, contains no creator names, and the original template reads null', async () => {
    expect(await readProvenance(await JSZip.loadAsync(fixture('template.xlsx')))).toBeNull();
    const state = await buildState();
    const subset = await stampSubset(state);
    expect(subset.exportedAt).toBeUndefined();
    const { buffer } = await patchTemplate(fixture('template.xlsx'), { processedData: { 'BP Daily': [] }, stamp: subset });
    const zip = await JSZip.loadAsync(buffer);
    const read = await readProvenance(zip);
    expect(read).toMatchObject({ schemaVersion: 1, productionMonth: '202602', templateSha256: state.template.sha256 });
    expect(read.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(read.exportedAt).toBeUndefined();
    expect(await zip.file('[Content_Types].xml').async('string')).toContain('PartName="/docProps/custom.xml"');
    expect(await zip.file('_rels/.rels').async('string')).toContain('custom-properties');
    expect(await zip.file('docProps/custom.xml').async('string')).not.toMatch(/creator|author|lastModifiedBy/i);
    // writing twice does not duplicate parts or properties
    await writeProvenance(zip, { ...subset, exportedAt: '2026-02-01T00:00:00.000Z' });
    expect((await zip.file('[Content_Types].xml').async('string')).match(/docProps\/custom\.xml/g)).toHaveLength(1);
    expect((await zip.file('_rels/.rels').async('string')).match(/custom-properties/g)).toHaveLength(1);
    expect((await readProvenance(zip)).exportedAt).toBe('2026-02-01T00:00:00.000Z');
  });
  it('exportedAt only appears when a clock is supplied', async () => {
    const s = await stampSubset({ sourceFiles: [], template: null, productionMonth: null }, { now: '2026-02-01T00:00:00Z' });
    expect(s.exportedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('sent', () => {
  it('stores the export hash, formats the chip and detects stale data', async () => {
    const state = await buildState();
    const { blob } = await buildExport({ template: { buffer: fixture('template.xlsx') }, processedData: state.processedData, summaryData: state.summaryData });
    const digest = await sha256(blob);
    expect(digest).toBe(indep(await blob.arrayBuffer()));
    const sig = dataSignature(state);
    const rec = makeSentRecord({ fileName: 'x.xlsx', sha256: digest, month: '202602', totals: state.totals, rowCounts: { BP: 1 }, note: ' ถึงฝ่ายผลิต ', by: '', now: '2026-02-01T08:05:00Z', dataSignature: sig });
    expect(rec.note).toBe('ถึงฝ่ายผลิต');
    expect(rec.by).toBe('');
    expect(sentChipText(rec)).toMatch(/^ส่งแล้ว \d\d:\d\d · [0-9a-f]{8}$/);
    expect(sentChipText(rec)).toContain(digest.slice(0, 8));
    expect(isStaleSent(rec, dataSignature(state))).toBe(false);
    state.changeLog = [{ action: 'edit', plant: 'BP', partNumber: 'P' }];
    expect(isStaleSent(rec, dataSignature(state))).toBe(true);
    expect(sentChipText(rec, { stale: true })).toContain('(มีการแก้ไขหลังส่ง)');
    expect(isStaleSent(null, 'x')).toBe(false);
  });
});

describe('Node-import contract', () => {
  it('pure modules import without React or Vite-only globals', async () => {
    for (const p of ['../src/utils/clock.js', '../src/utils/hash.js', '../src/lib/appVersion.js', '../src/features/provenance-manifest/manifest.js', '../src/features/provenance-manifest/stamp.js', '../src/features/provenance-manifest/sent.js']) {
      await expect(import(p)).resolves.toBeTruthy();
    }
  });
});
