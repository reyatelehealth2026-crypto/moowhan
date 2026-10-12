// Run history snapshots (pure; persistence only through src/lib/storage). No DOM/React.
import { PLANTS, MONTH_KEYS } from '../../constants.js';
import { isoNow } from '../../utils/clock.js';
import { registerKey } from '../../lib/storage/registry.js';
import { monthIndex } from './align.js';

export { FEATURE_ID } from './meta.js';
export const SCHEMA_VERSION = 1;
export const MAX_RUNS = 24;
export const RUNS_KEY = 'runs.list';
export const PREFS_KEY = 'prefs.run-history';
export const DEFAULT_PREFS = { tierB: false, accuracySheet: false };

registerKey({ key: RUNS_KEY, tier: 'runs', purpose: 'ประวัติการรัน (ยอดรวมต่อโรงงาน ไม่มีข้อมูลดิบ)', retention: 90 });
registerKey({ key: PREFS_KEY, tier: 'prefs', purpose: 'ตั้งค่าประวัติการรัน (เก็บข้อมูลราย Part, ชีต FC Accuracy)', retention: null });

const zero = () => ({ n: 0, n1: 0, n2: 0, n3: 0 });
const add = (a, r) => { MONTH_KEYS.forEach((k) => { a[k] += Number(r[k]) || 0; }); return a; };
const pmKey = (pm) => (!pm ? '' : typeof pm === 'string' ? pm : `${pm.year}${String(pm.month).padStart(2, '0')}`);
const plantOfSheet = (s) => String(s).split(' ')[0];

/** Totals per plant (and overall) from processedData: { BP: {n..n3}, ... }. */
export const plantTotals = (processedData) => {
  const out = {};
  Object.entries(processedData || {}).forEach(([sheet, rows]) => {
    const p = plantOfSheet(sheet);
    out[p] = rows.reduce((a, r) => add(a, r), out[p] || zero());
  });
  return out;
};
export const overallTotals = (byPlant) => Object.values(byPlant || {}).reduce((a, t) => add(a, t), zero());

/** Tier B: values aggregated per plant|part|dock (no descriptions, no raw rows). */
export const aggregateParts = (processedData) => {
  const map = new Map();
  Object.entries(processedData || {}).forEach(([sheet, rows]) => {
    const plant = plantOfSheet(sheet);
    rows.forEach((r) => {
      const key = `${plant}|${r.partNumber}|${r.dockCode ?? ''}`;
      const cur = map.get(key) || { plant, part: String(r.partNumber ?? ''), dock: String(r.dockCode ?? ''), ...zero() };
      add(cur, r);
      map.set(key, cur);
    });
  });
  return [...map.values()];
};

const maxRevision = (files) => files.reduce((best, f) => (best === '' || Number(f.revision) > Number(best) ? (f.revision ?? '') : best), '');

/**
 * Compact snapshot of one run.
 * @param {{ processedData, productionMonth, files, changeLog?, exportInfo?, qa? }} input  (files: result.files with size/sha256/rows/meta)
 * @param {{ withParts?: boolean, now?: Date|string, manifest?: object }} [opts]  manifest = provenance buildManifest() output (reused when present)
 */
export const toSnapshot = (input, { withParts = false, now, manifest } = {}) => {
  const created = now ? new Date(now).toISOString() : isoNow();
  const byPlant = manifest?.totals?.byPlant
    ? Object.fromEntries(Object.entries(manifest.totals.byPlant).map(([p, t]) => [p, { n: t.n, n1: t.n1, n2: t.n2, n3: t.n3 }]))
    : plantTotals(input.processedData);
  const files = manifest?.files
    ? manifest.files.map((f) => ({ name: f.name, plant: f.plant, rows: f.rows, size: f.size, sha256: f.sha256 === 'n/a' ? null : f.sha256, revision: f.revision, issueDate: f.issueDate, forecastType: f.forecastType }))
    : (input.files || []).map((f) => ({
      name: f.name, plant: f.category ?? f.plant, rows: f.rows ?? f.rowCount ?? 0, size: f.size ?? 0, sha256: f.sha256 || null,
      revision: f.meta?.revision ?? '', issueDate: f.meta?.issueDate ?? '', forecastType: f.meta?.forecastType ?? '',
    }));
  const month = manifest?.productionMonth || pmKey(input.productionMonth);
  const snap = {
    schemaVersion: SCHEMA_VERSION,
    id: `${month || 'unknown'}-${created.replace(/\D/g, '').slice(0, 14)}`,
    createdAt: created,
    productionMonth: month,
    issueDate: files.find((f) => f.issueDate)?.issueDate || '',
    revision: String(maxRevision(files)),
    forecastType: files.find((f) => f.forecastType)?.forecastType || '',
    files: files.map(({ name, plant, rows, size, sha256 }) => ({ name, plant, rows, size, ...(sha256 ? { sha256 } : {}) })),
    totals: overallTotals(byPlant),
    byPlant,
    qa: input.qa ?? null,
    editsCount: manifest?.edits ? manifest.edits.reduce((n, e) => n + (e.count || 1), 0) : (input.changeLog || []).filter((l) => l.action === 'edit').length,
    export: manifest?.output ? { fileName: manifest.output.fileName, sha256: manifest.output.sha256, exportedAt: null } : input.exportInfo ?? null,
    sent: manifest?.sent ? { at: manifest.sent.at, sha256: manifest.sent.sha256 } : null,
  };
  if (withParts) snap.parts = aggregateParts(input.processedData);
  return snap;
};

/** Same file set (sorted sha256, else name+size) and same production month -> same run. */
export const runSignature = (snap) =>
  `${snap.productionMonth}#${(snap.files || []).map((f) => f.sha256 || `${f.name}:${f.size}`).sort().join(',')}`;

/** Replace the entry with the same signature, else prepend; newest first, capped at MAX_RUNS. Pure. */
export const upsertRun = (list, snap, max = MAX_RUNS) => {
  const sig = runSignature(snap);
  const rest = (list || []).filter((r) => runSignature(r) !== sig);
  return [snap, ...rest].slice(0, max);
};

// ---- persistence through the shared storage layer (namespace/tier 'runs') ----
let defaultStorage = null;
const storageOf = async (opts) => {
  if (opts?.storage) return opts.storage;
  if (!defaultStorage) defaultStorage = (await import('../../lib/storage/index.js')).getStorage();
  return defaultStorage;
};

export const loadRuns = async (opts = {}) => {
  try {
    const v = await (await storageOf(opts)).get('runs', RUNS_KEY);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};

/** Saves the list; on a quota error halves it and retries. Never throws. Returns the list actually kept. */
export const saveRuns = async (list, opts = {}) => {
  let cur = list || [];
  try {
    const storage = await storageOf(opts);
    for (let i = 0; i < 6; i++) {
      let ok = false;
      try { ok = (await storage.put('runs', RUNS_KEY, cur)) !== false; } catch { ok = false; }
      if (ok) return cur;
      if (cur.length <= 1) break;
      cur = cur.slice(0, Math.ceil(cur.length / 2));
    }
  } catch { /* storage unusable: history simply is not kept */ }
  return cur;
};

export const loadPrefs = async (opts = {}) => {
  try { return { ...DEFAULT_PREFS, ...((await (await storageOf(opts)).get('prefs', PREFS_KEY)) || {}) }; } catch { return { ...DEFAULT_PREFS }; }
};
export const savePrefs = async (prefs, opts = {}) => {
  try { await (await storageOf(opts)).put('prefs', PREFS_KEY, prefs); } catch { /* ignore */ }
  return prefs;
};

/** Patch the newest run (first in list) — used by onExported / sent sync. Pure. */
export const patchLatest = (list, patch) => (list?.length ? [{ ...list[0], ...patch }, ...list.slice(1)] : list || []);

// ---- JSON import / export ----
export const exportRuns = (list) => JSON.stringify({ app: 'moowhan', kind: 'run-history', schemaVersion: SCHEMA_VERSION, runs: list || [] }, null, 2);
export const runsFileName = () => `run-history_${isoNow().slice(0, 10)}.json`;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const validTotals = (t) => t && typeof t === 'object' && MONTH_KEYS.every((k) => isNum(t[k]));
// manifests from provenance-manifest (totals: {overall, byPlant}) are accepted as runs too
const fromManifest = (m) => ({
  ...m,
  id: m.id || `${m.productionMonth}-${String(m.generatedAt || '').replace(/\D/g, '').slice(0, 14)}`,
  createdAt: m.createdAt || m.generatedAt,
  totals: m.totals?.overall || m.totals,
  byPlant: m.totals?.byPlant ? Object.fromEntries(Object.entries(m.totals.byPlant).map(([p, t]) => [p, { n: t.n, n1: t.n1, n2: t.n2, n3: t.n3 }])) : m.byPlant,
  files: (m.files || []).map(({ name, plant, rows, size, sha256 }) => ({ name, plant, rows, size, ...(sha256 && sha256 !== 'n/a' ? { sha256 } : {}) })),
  editsCount: Array.isArray(m.edits) ? m.edits.length : m.editsCount ?? 0,
  export: m.output ?? m.export ?? null,
  qa: m.qa ?? null,
});
const validRun = (r) => r && typeof r === 'object' && r.schemaVersion === SCHEMA_VERSION
  && monthIndex(r.productionMonth) != null && Array.isArray(r.files) && validTotals(r.totals)
  && r.byPlant && typeof r.byPlant === 'object' && Object.values(r.byPlant).every(validTotals);

/** Parse a JSON file and merge it into `list`. Returns { ok:true, list, added } or { ok:false, error } (Thai). */
export const importRuns = (json, list = []) => {
  let data;
  try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch { return { ok: false, error: 'ไฟล์นี้ไม่ใช่ JSON ที่อ่านได้ กรุณาเลือกไฟล์ที่ส่งออกจากแอปนี้' }; }
  const incoming = Array.isArray(data) ? data : Array.isArray(data?.runs) ? data.runs : data && typeof data === 'object' ? [data] : null;
  if (!incoming || !incoming.length) return { ok: false, error: 'ไม่พบข้อมูลประวัติการรันในไฟล์นี้' };
  const runs = incoming.map((r) => (r && r.totals?.overall ? fromManifest(r) : r));
  if (!runs.every(validRun)) return { ok: false, error: 'รูปแบบไฟล์ไม่ถูกต้อง (ต้องเป็นประวัติการรัน schemaVersion 1 ที่มีเดือนผลิตและยอดรวม)' };
  const before = (list || []).length;
  const merged = runs.reduce((acc, r) => upsertRun(acc, r), list || []);
  const sorted = [...merged].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, MAX_RUNS);
  return { ok: true, list: sorted, added: Math.max(0, sorted.length - before) };
};

export const PLANT_ORDER = PLANTS;
