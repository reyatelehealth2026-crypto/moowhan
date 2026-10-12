import { MONTH_KEYS, PLANTS } from '../../constants.js';
import { computeTotals, totalsByPlant } from '../excel/aggregate.js';

const sum4 = (t) => MONTH_KEYS.reduce((s, k) => s + t[k], 0);
const rowTotals = (rows) =>
  rows.reduce((a, r) => { MONTH_KEYS.forEach((k) => { a[k] += r[k] || 0; }); return a; }, { n: 0, n1: 0, n2: 0, n3: 0 });

/** BP/BPK/GW/SR x n..n3 + 4-month total + share of grand total (percent, 0 when empty). */
export const plantMonthMatrix = (processedData) => {
  const counts = Object.fromEntries(totalsByPlant(processedData).map((p) => [p.plant, p.count]));
  const rows = PLANTS.map((plant) => {
    const t = rowTotals(processedData?.[`${plant} Daily`] || []);
    return { plant, ...t, total: sum4(t), count: counts[plant] || 0 };
  });
  const grand = rows.reduce((s, r) => s + r.total, 0);
  const withShare = rows.map((r) => ({ ...r, share: grand ? (r.total / grand) * 100 : 0 }));
  const total = rowTotals(rows);
  return { rows: withShare, total: { ...total, total: sum4(total), share: grand ? 100 : 0 }, grand };
};

export { computeTotals };
