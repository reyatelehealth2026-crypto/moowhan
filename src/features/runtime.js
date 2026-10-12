// Pure feature runtime (no React/DOM): fault-isolated hook calls and collectors.
import { safeSheetName } from '../utils/format.js';

export const featureName = (f) => f?.tab?.label || f?.description || f?.id || 'ไม่ทราบชื่อ';
export const hookErrorMessage = (feature, hook) => `ฟีเจอร์ "${featureName(feature)}" ทำงานผิดพลาด (${hook}) — ข้ามไปก่อน`;

const fail = (report, feature, hook, error) => {
  try { report?.({ feature, hook, error, message: hookErrorMessage(feature, hook) }); } catch { /* reporter must not break the runtime */ }
};

/** Call feature[name](...args). Never throws; returns undefined on failure (reported via `report`). */
export const runHook = (feature, name, args = [], report) => {
  const fn = feature?.[name];
  if (typeof fn !== 'function') return undefined;
  try {
    const out = fn(...args);
    if (out && typeof out.then === 'function') return out.catch((err) => { fail(report, feature, name, err); return undefined; });
    return out;
  } catch (err) {
    fail(report, feature, name, err);
    return undefined;
  }
};

const LEVEL_RANK = { block: 0, confirm: 1, info: 2 };
const sortIssues = (list) => [...list].sort((a, b) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3));
const toIssues = (feature, out) => (Array.isArray(out) ? out : []).filter((i) => i && LEVEL_RANK[i.level] !== undefined).map((i) => ({ ...i, featureId: feature.id }));

/** validate(ctx) issues of all features (sync hooks only). */
export const collectIssues = (features, ctx, report) =>
  sortIssues(features.flatMap((f) => toIssues(f, runHook(f, 'validate', [ctx], report))));

/** validate + beforeExport + extra template issues, ordered block > confirm > info. */
export const collectGate = (features, ctx, report, templateIssues = []) =>
  sortIssues([
    ...features.flatMap((f) => [
      ...toIssues(f, runHook(f, 'validate', [ctx], report)),
      ...toIssues(f, runHook(f, 'beforeExport', [ctx], report)),
    ]),
    ...templateIssues,
  ]);

/**
 * Await every feature's exportSheets(ctx) (sync or Promise). Rejects names > 31 chars, duplicates and
 * protected names. Returns { sheets, rejected: [{name, reason}] }; rejections are also passed to `report`.
 */
export const collectExportSheets = async (features, ctx, { protectedSheets = [], report, extra = [] } = {}) => {
  const protectedSet = new Set(protectedSheets.map((s) => String(s).toLowerCase()));
  const results = await Promise.all(features.map(async (f) => {
    const out = await runHook(f, 'exportSheets', [ctx], report);
    return (Array.isArray(out) ? out : []).map((s) => ({ s, f }));
  }));
  const sheets = [];
  const rejected = [];
  const used = new Set();
  const reject = (f, name, reason) => {
    rejected.push({ name, reason });
    try { report?.({ feature: f, hook: 'exportSheets', error: new Error(reason), message: `ฟีเจอร์ "${featureName(f)}": ${reason}` }); } catch { /* ignore */ }
  };
  [...results.flat(), ...extra.map((s) => ({ s, f: null }))].forEach(({ s, f }) => {
    if (!s || typeof s.name !== 'string' || !s.name.trim()) return reject(f, String(s?.name ?? ''), 'ชื่อ sheet ว่าง ข้าม sheet นี้');
    if (s.name.length > 31) return reject(f, s.name, `ชื่อ sheet "${s.name}" ยาวเกิน 31 ตัวอักษร ข้าม sheet นี้`);
    const name = safeSheetName(s.name);
    const key = name.toLowerCase();
    if (protectedSet.has(key)) return reject(f, name, `ชื่อ sheet "${name}" ซ้ำกับ sheet ในเทมเพลต ข้าม sheet นี้`);
    if (used.has(key)) return reject(f, name, `ชื่อ sheet "${name}" ซ้ำกับ sheet อื่นที่จะส่งออก ข้าม sheet นี้`);
    used.add(key);
    sheets.push({ ...s, name });
  });
  return { sheets, rejected };
};

/** exportCellWrites(ctx) of all features, flattened. Applied by the patcher (patcher-safety item). */
export const collectCellWrites = async (features, ctx, report) => {
  const lists = await Promise.all(features.map(async (f) => {
    const out = await runHook(f, 'exportCellWrites', [ctx], report);
    return Array.isArray(out) ? out : [];
  }));
  return lists.flat();
};

/** Normalise headerActions(ctx): array of actions, or a legacy single element -> { node }. */
export const normalizeHeaderActions = (out) => {
  if (!out) return [];
  if (Array.isArray(out)) return out.filter((a) => a && typeof a.onClick === 'function' && a.label).map((a) => ({ priority: 0, ...a }));
  return [{ node: out, priority: 0 }];
};

/** badge -> { count, severity } | null */
export const normalizeBadge = (b) => {
  if (b == null || b === false) return null;
  if (typeof b === 'number') return b > 0 ? { count: b, severity: 'info' } : null;
  return b.count > 0 ? { count: b.count, severity: b.severity || 'info' } : null;
};
