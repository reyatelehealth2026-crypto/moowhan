// ==================== DIAGNOSTICS BUNDLE (pure) ====================
// Data-minimisation: only counts, names and whitelisted metadata. Never part numbers, descriptions or quantities.
// Fields are copied by whitelist (not regex-scrubbed), and change-log `details` are dropped.
export const DIAGNOSTICS_SCHEMA_VERSION = 1;
const META_KEYS = ['plantCode', 'partType', 'productionMonthRaw', 'revision', 'forecastType', 'issueDate'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined && obj[k] !== null).map((k) => [k, obj[k]]));

/** state: the useConsolidator state (may be partial/empty). extras: { appVersion, env, capacity, lastErrors, sha256 } */
export const buildDiagnostics = (state = {}, extras = {}) => {
  const files = (state.sourceFiles || []).map((f) => ({
    name: f.name, size: f.size, plant: f.category, rows: f.rowCount ?? 0, status: f.status,
    meta: pick(f.meta, META_KEYS),
  }));
  const rep = state.exportReport;
  const log = state.changeLog || [];
  const actionTail = log.slice(-30).map((l) => ({ at: l.timestamp, action: l.action }));
  const errors = [...(extras.lastErrors || [])];
  if (state.error) errors.push(String(state.error).split('\n')[0].slice(0, 200));
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    appVersion: extras.appVersion ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'),
    generatedAt: extras.now ?? new Date().toISOString(),
    env: extras.env ?? {},
    template: state.template
      ? { name: state.template.name, size: state.template.size, kind: state.template.kind, sheets: [...(state.template.sheets || [])], capacity: extras.capacity ?? null, sha256: extras.sha256 ?? 'n/a' }
      : null,
    files,
    productionMonth: state.productionMonth ? `${state.productionMonth.year}${String(state.productionMonth.month).padStart(2, '0')}` : null,
    exportReport: rep
      ? {
        mode: rep.mode,
        patched: (rep.patched || []).map((p) => ({ sheet: p.sheet, rows: p.rows })),
        skipped: [...(rep.skipped || [])],
        overflow: (rep.overflow || []).map((o) => ({ sheet: o.sheet ?? o.name, count: o.count ?? o.rows ?? undefined })),
        warningCount: (rep.warnings || []).length,
      }
      : null,
    lastErrors: errors,
    actions: actionTail,
  };
};

export const diagnosticsFileName = (d = new Date()) => `moowhan-diagnostics-${d.toISOString().slice(0, 10)}.json`;

/** sha256 hex of an ArrayBuffer ('n/a' when crypto.subtle is unavailable). */
export { sha256 as sha256Hex } from '../../utils/hash.js';
