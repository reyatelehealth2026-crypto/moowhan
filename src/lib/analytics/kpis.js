import { MONTH_KEYS, PLANTS } from '../../constants.js';
import { computeTotals } from '../excel/aggregate.js';

// "23/01/2026" (dd/mm/yyyy, as in TMT files) or ISO -> Date | null
export const parseIssueDate = (s) => {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s).trim());
  const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const buildKpis = (processedData, summaryData, { files = [], clock = () => new Date() } = {}) => {
  const totals = computeTotals(summaryData);
  const total4 = MONTH_KEYS.reduce((s, k) => s + totals[k], 0);
  const rowsByPlant = PLANTS.map((p) => (processedData?.[`${p} Daily`] || []).length);
  const metas = (files || []).map((f) => f.meta).filter(Boolean);
  const uniq = (key) => [...new Set(metas.map((m) => m[key]).filter((v) => v !== undefined && v !== ''))];
  const issues = uniq('issueDate');
  const revs = uniq('revision');
  const types = uniq('forecastType');
  const issueDate = issues[0] ?? null;
  const d = parseIssueDate(issueDate);
  const now = clock();
  const dataAgeDays = d ? Math.max(0, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - d.getTime()) / 86400000)) : null;
  return {
    totals,
    total4,
    parts: (summaryData || []).length,
    rows: rowsByPlant.reduce((a, b) => a + b, 0),
    plantsWithFiles: PLANTS.filter((p, i) => rowsByPlant[i] > 0 || (files || []).some((f) => f.category === p && f.status === 'done')),
    missingPlants: PLANTS.filter((p) => !(files || []).some((f) => f.category === p && f.status === 'done') && !(processedData?.[`${p} Daily`] || []).length),
    issueDate,
    revision: revs[0] ?? null,
    forecastType: types[0] ?? null,
    revisionConsistent: revs.length <= 1 && issues.length <= 1,
    dataAgeDays,
  };
};
