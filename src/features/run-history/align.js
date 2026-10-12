// Calendar-month alignment shared by run-history trend / accuracy (pure, no DOM).
// A production month is "YYYYMM". Month index = year*12 + (month-1), so month m + k is index + k.
export const monthIndex = (pm) => {
  const m = String(pm ?? '').match(/^(\d{4})(\d{2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return Number(m[1]) * 12 + Number(m[2]) - 1;
};
export const monthKeyOf = (idx) => `${Math.floor(idx / 12)}${String((idx % 12) + 1).padStart(2, '0')}`;
export const shiftMonth = (pm, k) => { const i = monthIndex(pm); return i == null ? null : monthKeyOf(i + k); };

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const monthLabel = (pm) => { const i = monthIndex(pm); return i == null ? '-' : `${TH_MONTHS[i % 12]} ${String(Math.floor(i / 12)).slice(2)}`; };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : -1; };
/** true when run a has a later revision than b (ties: later createdAt). */
export const isNewerRevision = (a, b) => {
  const ra = num(a.revision); const rb = num(b.revision);
  if (ra !== rb) return ra > rb;
  return String(a.createdAt) > String(b.createdAt);
};
/** The run to use for a production month: the signed-off one (latest), else the latest by createdAt. */
export const pickRunForMonth = (runs) => {
  const signed = runs.filter((r) => r.sent);
  const pool = signed.length ? signed : runs;
  return pool.reduce((best, r) => (!best || String(r.createdAt) > String(best.createdAt) ? r : best), null);
};
/** Best run of a month for accuracy: highest revision, ties by latest createdAt. */
export const pickHighestRevision = (runs) => runs.reduce((best, r) => (!best || isNewerRevision(r, best) ? r : best), null);
export const groupByMonth = (runs) => {
  const map = new Map();
  runs.forEach((r) => { if (monthIndex(r.productionMonth) != null) map.set(r.productionMonth, [...(map.get(r.productionMonth) || []), r]); });
  return map;
};
