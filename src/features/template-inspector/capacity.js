// Pure data helper: how many rows each template sheet can take versus how many we want to write.
// Turning this into a message / Issue ("แถว 26 เป็นสูตร ...") is the QA rule's job, not ours.
import { ANALYZE_SHEET, DAILY_SHEETS } from '../../constants.js';

const countOf = (v) => (Array.isArray(v) ? v.length : Number.isFinite(Number(v)) ? Number(v) : 0);
// 'BP' | 'BP Daily' -> 'BP Daily'
const toSheet = (key) => (DAILY_SHEETS.includes(key) ? key : DAILY_SHEETS.find((s) => s === `${key} Daily`) ?? key);

/**
 * @param inspection  result of inspectTemplate()
 * @param processedRowsByPlant  { 'BP Daily' | 'BP': rows[] | count, ..., Analyze?: rows[] | count }
 *                              (Analyze defaults to the sum of the Daily sheets)
 * @param overrides   { 'BP Daily' | 'BP' | 'Analyze': capacity } supplied by settings-profile
 * @returns {{ sheet: string, rows: number, capacity: number|null, sumRow: number|null, over: boolean }[]}
 */
export const templateCapacityReport = (inspection, processedRowsByPlant = {}, overrides = {}) => {
  const sheets = new Map((inspection?.sheets ?? []).map((s) => [s.name, s]));
  const rows = new Map();
  for (const [key, v] of Object.entries(processedRowsByPlant || {})) rows.set(key === ANALYZE_SHEET ? key : toSheet(key), countOf(v));
  const override = new Map(Object.entries(overrides || {}).map(([k, v]) => [k === ANALYZE_SHEET ? k : toSheet(k), v]));

  const names = DAILY_SHEETS.filter((n) => rows.has(n));
  if (!rows.has(ANALYZE_SHEET) && names.length) rows.set(ANALYZE_SHEET, names.reduce((n, s) => n + rows.get(s), 0));
  if (rows.has(ANALYZE_SHEET)) names.push(ANALYZE_SHEET);

  return names.map((sheet) => {
    const info = sheets.get(sheet);
    const ov = Number(override.get(sheet));
    const capacity = Number.isFinite(ov) && override.has(sheet) ? ov : info?.capacity ?? null;
    const count = rows.get(sheet);
    return {
      sheet, rows: count, capacity,
      sumRow: info?.firstFormulaRowBelowData ?? null,
      over: capacity !== null && count > capacity,
    };
  });
};
