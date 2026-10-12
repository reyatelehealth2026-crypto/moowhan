// Plant-level trend and forecast drift from run snapshots (pure).
import { PLANTS } from '../../constants.js';
import { groupByMonth, monthIndex, monthKeyOf, monthLabel, pickRunForMonth } from './align.js';

const pct = (cur, prev) => (prev ? (cur - prev) / prev : null);

/**
 * buildTrend(runs, { months: 12 }) -> { points, series: { total, byPlant }, drift: { total, byPlant }, plants }
 * points ordered by calendar month; one run per month (signed-off, else latest).
 * drift[x][i] = { cur, prev, delta, pct } | null — N of the month vs the N+3 given by the run 3 months earlier.
 */
export const buildTrend = (runs, { months = 12 } = {}) => {
  const byMonth = groupByMonth(runs || []);
  const chosen = [...byMonth.entries()]
    .map(([month, list]) => ({ month, run: pickRunForMonth(list) }))
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month));
  const picked = chosen.slice(-months);
  const runOf = new Map(chosen.map((c) => [monthIndex(c.month), c.run]));

  const points = picked.map(({ month, run }) => ({
    month, label: monthLabel(month), runId: run.id, signed: !!run.sent, total: run.totals, byPlant: run.byPlant,
  }));
  const plants = PLANTS.filter((p) => points.some((pt) => pt.byPlant?.[p]));
  const series = {
    total: points.map((p) => ({ month: p.month, value: p.total.n })),
    byPlant: Object.fromEntries(plants.map((pl) => [pl, points.map((p) => ({ month: p.month, value: p.byPlant?.[pl]?.n ?? null }))])),
  };
  const driftFor = (get) => points.map((p) => {
    const earlier = runOf.get(monthIndex(p.month) - 3);
    if (!earlier) return null;
    const prev = get({ total: earlier.totals, byPlant: earlier.byPlant }, 'n3'); const cur = get(p, 'n');
    if (prev == null || cur == null) return null;
    return { cur, prev, delta: cur - prev, pct: pct(cur, prev) };
  });
  const drift = {
    total: driftFor((src, k) => src.total?.[k]),
    byPlant: Object.fromEntries(plants.map((pl) => [pl, driftFor((src, k) => src.byPlant?.[pl]?.[k])])),
  };
  return { points, series, drift, plants, monthKeyOf };
};
