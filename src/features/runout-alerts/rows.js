// ==================== RUN-OUT ROWS (pure) ====================
// One row per plant x part x dock. Statuses come from classify.js (the only classifier).
import { MONTH_KEYS } from '../../constants.js';
import { STATUS_RANK, classify, continues, isSignal, lastPackDate } from './classify.js';

const plantOf = (sheet) => String(sheet).split(' ')[0];

/** Key shared by overrides, notes and waivers: plant|part|dock */
export const rowKey = (plant, partNumber, dockCode) => `${plant}|${partNumber}|${dockCode ?? ''}`;

/** YYYY-MM-DD that is a real calendar date, else ''. */
export const cleanIsoDate = (v) => {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
};

/**
 * @param {Record<string, object[]>} processedData
 * @param {{year:number, month:number}|null} productionMonth
 * @param {Record<string, {date:string, editedAt?:string}>} overrides official Last Pack by rowKey
 * @param {Record<string, string[]>} [notes] note texts by rowKey (shared notes store)
 * @returns {object[]} sorted: run-out, new, gap, normal, zero
 */
export const buildRunoutRows = (processedData, productionMonth, overrides = {}, notes = {}) => {
  const byKey = new Map();
  Object.entries(processedData || {}).forEach(([sheet, rows]) => {
    (rows || []).forEach((r) => {
      const plant = r.plant || plantOf(sheet);
      const key = rowKey(plant, r.partNumber, r.dockCode);
      const lp = lastPackDate(r, productionMonth);
      const cur = byKey.get(key);
      if (!cur) {
        byKey.set(key, { key, plant, sheet, partNumber: r.partNumber, partCode: r.partCode ?? '', dockCode: r.dockCode ?? '', n: r.n || 0, n1: r.n1 || 0, n2: r.n2 || 0, n3: r.n3 || 0, lp });
      } else { // duplicate part+dock rows in one plant: add quantities, keep the later last-pack day
        MONTH_KEYS.forEach((k) => { cur[k] += r[k] || 0; });
        if (lp && (!cur.lp || lp.monthIndex > cur.lp.monthIndex || (lp.monthIndex === cur.lp.monthIndex && lp.day > cur.lp.day))) cur.lp = lp;
      }
    });
  });

  return [...byKey.values()]
    .map((r) => {
      const status = classify(r);
      const ov = overrides?.[r.key];
      const official = cleanIsoDate(ov?.date);
      return {
        key: r.key, plant: r.plant, sheet: r.sheet, partNumber: r.partNumber, partCode: r.partCode, dockCode: r.dockCode,
        status, signal: isSignal(status), continues: continues(status),
        lastPackEstimated: r.lp?.iso || '', lastPackDay: r.lp ? { monthIndex: r.lp.monthIndex, day: r.lp.day } : null,
        lastPackOfficial: official, officialEditedAt: official ? (ov?.editedAt || '') : '',
        n: r.n, n1: r.n1, n2: r.n2, n3: r.n3,
        notes: notes?.[r.key] || [],
      };
    })
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.plant.localeCompare(b.plant) || a.partNumber.localeCompare(b.partNumber) || a.dockCode.localeCompare(b.dockCode));
};

export const signalRows = (rows) => rows.filter((r) => r.signal);

/** Immutable update of the official Last Pack overrides: an empty/invalid date removes the override (= back to the estimate). */
export const withOverride = (overrides, key, date, now = new Date()) => {
  const next = { ...(overrides || {}) };
  const iso = cleanIsoDate(date);
  if (iso) next[key] = { date: iso, editedAt: new Date(now).toISOString().slice(0, 10) };
  else delete next[key];
  return next;
};

export const EXPORT_SHEET_NAME = 'Runout';
const EXPORT_HEADER = ['Plant', 'Dock', 'Part', 'Part Code', 'สถานะ', 'Last Pack (ประมาณ)', 'Last Pack (ทางการ)', 'N', 'N+1', 'N+2', 'N+3', 'หมายเหตุ'];

/** Rows for the opt-in 'Runout' sheet. Dates are text YYYY-MM-DD; every row is exported, in view order. */
export const buildRunoutAoa = (rows, statusLabel = {}) => [
  EXPORT_HEADER,
  ...rows.map((r) => [
    r.plant, r.dockCode, r.partNumber, r.partCode, statusLabel[r.status] || r.status,
    String(r.lastPackEstimated || ''), String(r.lastPackOfficial || ''),
    r.n, r.n1, r.n2, r.n3, (r.notes || []).join(' / '),
  ]),
];
