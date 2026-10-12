// Forecast accuracy: what N+1..N+3 said earlier vs the Firm N of the month (pure).
import { PLANTS } from '../../constants.js';
import { groupByMonth, monthIndex, monthKeyOf, pickHighestRevision } from './align.js';

export const HORIZONS = [1, 2, 3];
const HKEY = { 1: 'n1', 2: 'n2', 3: 'n3' };
export const EMPTY_MESSAGE = 'ต้องมีประวัติอย่างน้อย 2 รอบ';

const cell = (errs) => (errs.length
  ? { count: errs.length, bias: errs.reduce((a, e) => a + e, 0) / errs.length, mape: errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length }
  : null); // null = no pair -> UI shows '-', never 0

const partMap = (run) => new Map((run.parts || []).map((p) => [`${p.plant}|${p.part}|${p.dock}`, p]));

/**
 * accuracy(runs, { level: 'plant'|'part' }) -> { empty, message?, level, pairs, summary }
 * summary[horizon] = { byPlant: { BP: {count,bias,mape}|null }, total: {...}|null }
 * Firm = N of the highest-revision run of the month; forecast = N+k of the run for month m-k.
 */
export const accuracy = (runs, { level = 'plant' } = {}) => {
  const list = runs || [];
  if (list.length < 2) return { empty: true, message: EMPTY_MESSAGE, level, pairs: [], summary: {} };
  const best = new Map([...groupByMonth(list).entries()].map(([m, rs]) => [monthIndex(m), pickHighestRevision(rs)]));
  const pairs = [];
  best.forEach((firmRun, idx) => {
    HORIZONS.forEach((h) => {
      const earlier = best.get(idx - h);
      if (!earlier) return;
      const month = monthKeyOf(idx);
      const push = (plant, part, firm, forecast) => {
        if (firm == null || forecast == null || !firm) return; // zero Firm: percentage error undefined
        pairs.push({ month, horizon: h, plant, part, firm, forecast, error: (forecast - firm) / firm });
      };
      if (level === 'part') {
        if (!firmRun.parts || !earlier.parts) return;
        const fm = partMap(firmRun);
        partMap(earlier).forEach((p, key) => { const f = fm.get(key); if (f) push(p.plant, `${p.part}`, f.n, p[HKEY[h]]); });
      } else {
        PLANTS.forEach((pl) => { if (firmRun.byPlant?.[pl] && earlier.byPlant?.[pl]) push(pl, null, firmRun.byPlant[pl].n, earlier.byPlant[pl][HKEY[h]]); });
      }
    });
  });
  const summary = {};
  HORIZONS.forEach((h) => {
    const ps = pairs.filter((p) => p.horizon === h);
    summary[h] = {
      byPlant: Object.fromEntries(PLANTS.map((pl) => [pl, cell(ps.filter((p) => p.plant === pl).map((p) => p.error))])),
      total: cell(ps.map((p) => p.error)),
    };
  });
  return { empty: false, level, pairs, summary };
};

export const accuracyToAoa = (acc) => {
  const aoa = [['FC Accuracy (ค่า N+k ที่เคยพยากรณ์ เทียบกับ N จริงของเดือนนั้น)'], ['Horizon', 'โรงงาน', 'จำนวนคู่', 'Bias %', 'MAPE %']];
  if (acc.empty) return [...aoa, [acc.message]];
  const f = (v) => (v == null ? '-' : Math.round(v * 1000) / 10);
  HORIZONS.forEach((h) => {
    PLANTS.forEach((pl) => { const c = acc.summary[h].byPlant[pl]; aoa.push([`N+${h}`, pl, c?.count ?? '-', f(c?.bias), f(c?.mape)]); });
    const t = acc.summary[h].total; aoa.push([`N+${h}`, 'รวม', t?.count ?? '-', f(t?.bias), f(t?.mape)]);
  });
  return aoa;
};
