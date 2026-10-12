// ==================== EXPECTED TOTALS (pure) ====================
// The values Excel should show in the template's SUM rows once the file is opened and recalculated
// (the patcher leaves the cached <v> of formula cells alone, so a viewer that does not recalculate
// shows old numbers). Advisory only: it assumes plain SUM formulas over the data rows, plus the
// template's combined row (SR Daily row below its SUM row = sum of all four plants).
import { DEFAULT_N_COLS, MONTH_KEYS, DAILY_SHEETS } from '../../constants.js';
import { getColumnLetter } from '../../utils/format.js';

export const ADVISORY_NOTE = 'ค่าที่ Excel ควรแสดงสำหรับสูตร SUM ธรรมดา (ใช้เทียบเท่านั้น ถ้าสูตรในเทมเพลตต่างไป ค่าอาจไม่ตรง)';

const sumRows = (rows = []) => MONTH_KEYS.reduce((acc, k) => ({ ...acc, [k]: rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) }), {});

/**
 * @param {Record<string, object[]>} processedData
 * @param {{ inspection?: object|null, grand?: { sheet: string, rowOffset: number } }} [opts]
 * @returns {{ byPlant: Record<string, {n,n1,n2,n3}>, grand: {n,n1,n2,n3}, cells: object[], map: Record<string, number>, advisory: true, note: string }}
 *   cells: [{ sheet, ref, month, value, kind: 'sum'|'grand', advisory: true }] — empty when the template layout is unknown
 */
export const expectedTotals = (processedData, { inspection = null, grand = { sheet: 'SR Daily', rowOffset: 1 } } = {}) => {
  const byPlant = {};
  DAILY_SHEETS.forEach((s) => { if (processedData?.[s]) byPlant[s] = sumRows(processedData[s]); });
  const all = sumRows(Object.values(processedData || {}).flat());
  const nCols = inspection?.nCols?.length === 4 ? inspection.nCols : DEFAULT_N_COLS.map((i) => i + 1);
  const sheetInfo = new Map((inspection?.sheets || []).map((s) => [s.name, s]));

  const cells = [];
  const map = {};
  const push = (sheet, row, kind, totals) => MONTH_KEYS.forEach((k, i) => {
    const ref = `${getColumnLetter(nCols[i])}${row}`;
    cells.push({ sheet, ref, month: k, value: totals[k], kind, advisory: true });
    map[`${sheet}!${ref}`] = totals[k];
  });
  for (const [sheet, totals] of Object.entries(byPlant)) {
    const row = sheetInfo.get(sheet)?.firstFormulaRowBelowData;
    if (row) push(sheet, row, 'sum', totals);
  }
  const grandRow = sheetInfo.get(grand.sheet)?.firstFormulaRowBelowData;
  if (grandRow) push(grand.sheet, grandRow + grand.rowOffset, 'grand', all);

  return { byPlant, grand: all, cells, map, advisory: true, note: ADVISORY_NOTE };
};
