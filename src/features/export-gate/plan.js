// ==================== EXPORT PLAN (pure) ====================
// What the patcher will write, derived from processedData + the template inspection (no XML parsing).
import { ANALYZE_SHEET, DAILY_SHEETS, TEMPLATE } from '../../constants.js';
import { templateCapacityReport } from '../template-inspector/capacity.js';
import { DEFAULT_FILE_PATTERN } from '../../utils/format.js';

/** file-name pattern: dated "Updated" file for an .xlsx template, "Summary" for a freshly built workbook */
export const defaultFilePattern = (template) =>
  (template?.kind === 'xlsx' ? DEFAULT_FILE_PATTERN : DEFAULT_FILE_PATTERN.replace('Updated', 'Summary'));

/**
 * @returns {{ mode: 'template'|'fallback', sheets: {sheet,rows,written,startRow,capacity,sumRow,over}[],
 *   analyze: {rows,written,startRow,capacity,over}|null, cellWrites: object[], extraSheets: string[], totalRows: number }}
 */
export const planExport = ({ processedData, inspection = null, cellWrites = [], extraSheets = [] } = {}) => {
  const info = new Map((inspection?.sheets || []).map((s) => [s.name, s]));
  const counts = Object.fromEntries(DAILY_SHEETS.map((s) => [s, processedData?.[s]?.length ?? 0]));
  const report = templateCapacityReport(inspection, counts);
  const entry = (r, startFallback) => {
    const cap = r.capacity;
    return {
      sheet: r.sheet, rows: r.rows, written: cap === null ? r.rows : Math.min(r.rows, cap),
      startRow: info.get(r.sheet)?.dataStartRow ?? startFallback, capacity: cap, sumRow: r.sumRow, over: r.over,
    };
  };
  const analyze = report.find((r) => r.sheet === ANALYZE_SHEET);
  return {
    mode: inspection ? 'template' : 'fallback',
    sheets: report.filter((r) => r.sheet !== ANALYZE_SHEET).map((r) => entry(r, TEMPLATE.dailyDataStartRow)),
    analyze: analyze ? (({ sheet, ...rest }) => rest)(entry(analyze, TEMPLATE.analyzeDataStartRow)) : null,
    cellWrites: cellWrites || [],
    extraSheets: (extraSheets || []).map((s) => s.name),
    totalRows: Object.values(counts).reduce((n, v) => n + v, 0),
  };
};
