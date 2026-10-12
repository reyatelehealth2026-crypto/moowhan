// Run manifest (pure, Node-testable): one object feeds the Run Info sheet, the JSON download and the stamp.
import { PLANTS } from '../../constants.js';
import { computeTotals } from '../../lib/excel/aggregate.js';
import { APP_VERSION } from '../../lib/appVersion.js';
import { isoNow } from '../../utils/clock.js';
import { sha256, shortHash } from '../../utils/hash.js';

export const MANIFEST_SCHEMA_VERSION = 1;
export { FEATURE_ID } from './meta.js';
import { FEATURE_ID } from './meta.js';

export const monthKey = (pm) => (pm ? `${pm.year}${String(pm.month).padStart(2, '0')}` : '');

/**
 * Hash every entry that has no sha256 yet (once per buffer). `getBuffer(entry)` -> ArrayBuffer | Blob.
 * Returns the entries with sha256 filled in; already-hashed entries cost nothing.
 */
export const ensureHashes = async (entries, getBuffer, hashFn = sha256) =>
  Promise.all(entries.map(async (e) => (e.sha256 ? e : { ...e, sha256: await hashFn(await getBuffer(e)) })));

const editRefs = (changeLog = []) => {
  const map = new Map();
  changeLog.filter((l) => l.action === 'edit').forEach((l) => {
    const key = `${l.plant || ''}|${l.partNumber || ''}|${l.dockCode || ''}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map].map(([key, count]) => {
    const [plant, partNumber, dockCode] = key.split('|');
    return { key, plant, partNumber, dockCode, count };
  });
};

const plantTotals = (processedData) =>
  Object.fromEntries(Object.entries(processedData || {}).map(([sheet, rows]) => [
    sheet.split(' ')[0],
    rows.reduce((a, r) => ({ rows: a.rows + 1, n: a.n + r.n, n1: a.n1 + r.n1, n2: a.n2 + r.n2, n3: a.n3 + r.n3 }), { rows: 0, n: 0, n1: 0, n2: 0, n3: 0 }),
  ]));

/** @param {object} state consolidator state  @param {{ now?: Date|string, operator?: string }} [opts] */
export const buildManifest = (state, { now, operator = '' } = {}) => {
  const feat = state.features?.[FEATURE_ID] || {};
  const files = (state.sourceFiles || []).filter((f) => f.status === 'done').map((f) => ({
    name: f.name,
    plant: f.category,
    plantCode: f.meta?.plantCode || '',
    revision: f.meta?.revision || '',
    forecastType: f.meta?.forecastType || '',
    issueDate: f.meta?.issueDate || '',
    size: f.size ?? 0,
    sha256: f.sha256 || 'n/a',
    rows: f.rowCount ?? 0,
  }));
  const rep = state.exportReport;
  const out = rep?.sha256 ? { fileName: rep.fileName || '', sha256: rep.sha256 } : feat.lastExport ? { fileName: feat.lastExport.fileName, sha256: feat.lastExport.sha256 } : null;
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    generatedAt: now ? new Date(now).toISOString() : isoNow(),
    productionMonth: monthKey(state.productionMonth),
    template: state.template ? { name: state.template.name || '', size: state.template.size ?? 0, sha256: state.template.sha256 || 'n/a' } : null,
    files,
    totals: { overall: state.totals || computeTotals(state.summaryData), byPlant: plantTotals(state.processedData) },
    edits: editRefs(state.changeLog),
    output: out,
    sent: feat.sent || null,
    operator: String(operator || feat.sent?.by || '').trim(),
  };
};

/** Run Info sheet rows (values only). A1 is the sheet's marker. */
export const manifestToAoa = (m) => {
  const aoa = [
    ['moowhan run manifest'],
    ['เวอร์ชันแอป', m.appVersion],
    ['สร้างเมื่อ', m.generatedAt],
    ['PRODUCTION MONTH', m.productionMonth],
    ['ไฟล์หลัก (template)', m.template?.name || '-', m.template ? shortHash(m.template.sha256) : ''],
    [],
    ['ชื่อไฟล์', 'โรงงาน', 'REVISION', 'ISSUE DATE', 'ขนาด (byte)', 'SHA-256', 'แถว'],
    ...m.files.map((f) => [f.name, f.plant, f.revision, f.issueDate, f.size, f.sha256, f.rows]),
    [],
    ['ยอดรวม', 'N', 'N+1', 'N+2', 'N+3'],
    ...PLANTS.filter((p) => m.totals.byPlant[p]).map((p) => { const t = m.totals.byPlant[p]; return [p, t.n, t.n1, t.n2, t.n3]; }),
    ['รวม', m.totals.overall.n, m.totals.overall.n1, m.totals.overall.n2, m.totals.overall.n3],
    [],
    ['การแก้ไขด้วยมือ (รายการ)', m.edits.length],
    ['ไฟล์ส่งออกครั้งก่อน', m.output?.fileName || '-', m.output?.sha256 || ''],
  ];
  if (m.sent) aoa.push(['ส่งแล้ว', m.sent.at, m.sent.sha256, m.sent.note, m.sent.by]);
  return aoa;
};

export const manifestFileName = (m) => `run_${m.productionMonth || 'unknown'}.json`;
export const manifestJson = (m) => JSON.stringify(m, null, 2);
