// ==================== EXPORT ====================
// Builds the downloadable workbook. Two modes:
//   template  -> patch the customer's .xlsx in place (pivots/formats preserved)
//   fallback  -> brand-new workbook built with SheetJS (no template or non-xlsx template)
import * as XLSX from 'xlsx';
import { patchTemplate } from './templatePatcher.js';
import { buildAnalyzeRows } from './aggregate.js';
import { ANALYZE_SHEET, DAILY_SHEETS, MONTH_HEADERS, SOURCE_HEADERS, SUMMARY_SHEET } from '../../constants.js';
import { safeSheetName, todayStamp } from '../../utils/format.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// .xlsx files are zip archives: "PK\x03\x04"
export const isZipBuffer = (buffer) => {
  if (!buffer || buffer.byteLength < 4) return false;
  const b = new Uint8Array(buffer, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
};

const OVERWRITE_SHEETS = new Set([...DAILY_SHEETS, SUMMARY_SHEET, ANALYZE_SHEET]);

const buildFallbackWorkbook = ({ processedData, summaryData, preservedSheets, extraSheets = [] }) => {
  const wb = XLSX.utils.book_new();

  // keep whatever else the (non-xlsx) template had, values only
  Object.entries(preservedSheets || {}).forEach(([name, aoa]) => {
    if (OVERWRITE_SHEETS.has(name)) return;
    const rows = (aoa || []).map((row) => (Array.isArray(row) ? row.map((v) => (v === null ? '' : v)) : []));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeSheetName(name));
  });

  Object.entries(processedData || {}).forEach(([sheetName, rows]) => {
    if (!rows.length) return;
    const aoa = [
      [...SOURCE_HEADERS, ...MONTH_HEADERS],
      ...rows.map((r) => [r.partNumber, r.partCode, r.partDesc, r.suppCode, r.shippingDock, r.dockCode, r.carFamily, r.packingSize, r.n, r.n1, r.n2, r.n3]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  });

  if (summaryData) {
    const aoa = [
      ['Part Number', 'Plants', 'Sum of N', 'Sum of N+1', 'Sum of N+2', 'Sum of N+3', 'Total'],
      ...summaryData.map((r) => [r.partNumber, r.plants, r.n, r.n1, r.n2, r.n3, r.n + r.n1 + r.n2 + r.n3]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), SUMMARY_SHEET);
  }

  const analyzeRows = buildAnalyzeRows(processedData);
  const aoa = analyzeRows.map((r) => [r.plant, ...(Array.isArray(r.rawRow) ? r.rawRow.map((v) => (v ?? '')) : [])]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [[]]), ANALYZE_SHEET);

  extraSheets.forEach((s) => {
    if (!s?.name) return;
    const name = safeSheetName(s.name);
    const idx = wb.SheetNames.indexOf(name);
    if (idx !== -1) { wb.SheetNames.splice(idx, 1); delete wb.Sheets[name]; }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa?.length ? s.aoa : [[]]), name);
  });

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
};

/**
 * @param {object} opts
 * @param {{ buffer?: ArrayBuffer, rawSheets?: object } | null} opts.template
 * @param {Record<string, object[]>} opts.processedData
 * @param {object[]} opts.summaryData
 * @param {boolean} [opts.highlight]
 * @param {{ name: string, aoa: any[][] }[]} [opts.extraSheets]
 * @param {'block'|'spill'} [opts.overflow]  see patchTemplate
 * @param {boolean} [opts.clearBeyondTable]
 * @param {boolean} [opts.addAutoFilter]
 * @param {Date|number|string} [opts.now]  fixed zip entry date (reproducible output)
 * @returns {Promise<{ blob: Blob, fileName: string, report: object }>}
 */
export const buildExport = async ({ template, processedData, summaryData, highlight = true, extraSheets: extraIn = [], cellWrites = [], protectedSheets = [], overflow = 'block', clearBeyondTable = false, addAutoFilter = true, now = null }) => {
  const warnings = [];
  const skippedSheets = [];
  // an extra sheet must never replace a template/core sheet (cellWrites are applied by the patcher when supported)
  const blocked = new Set([...protectedSheets, ...OVERWRITE_SHEETS].map((n) => String(n).toLowerCase()));
  const extraSheets = extraIn.filter((s) => {
    if (!blocked.has(String(s?.name).toLowerCase())) return true;
    warnings.push(`ข้าม sheet "${s.name}" เพราะชื่อซ้ำกับ sheet ในเทมเพลต`);
    skippedSheets.push({ name: s.name, reason: 'protected' });
    return false;
  });

  if (template?.buffer && isZipBuffer(template.buffer)) {
    try {
      const analyzeRows = buildAnalyzeRows(processedData);
      const { buffer, report } = await patchTemplate(template.buffer, { processedData, analyzeRows, highlight, extraSheets, cellWrites, overflow, clearBeyondTable, addAutoFilter, now });
      return {
        blob: new Blob([buffer], { type: XLSX_MIME }),
        fileName: `Production_Updated_${todayStamp()}.xlsx`,
        report: {
          mode: 'template', ...report,
          skippedSheets: [...skippedSheets, ...(report.skippedSheets || [])],
          warnings: [...warnings, ...(report.warnings || [])],
        },
      };
    } catch (err) {
      console.error('patchTemplate failed, falling back to a new workbook', err);
      warnings.push(`ไม่สามารถเขียนลงเทมเพลตได้ (${err.message}) ระบบจึงสร้างไฟล์ใหม่ให้แทน`);
    }
  }

  const out = buildFallbackWorkbook({ processedData, summaryData, preservedSheets: template?.rawSheets, extraSheets });
  return {
    blob: new Blob([out], { type: XLSX_MIME }),
    fileName: `Production_Summary_${todayStamp()}.xlsx`,
    report: { mode: 'fallback', patched: [], skipped: [], warnings, skippedSheets, overflow: [], cellWrites: [] },
  };
};

export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
