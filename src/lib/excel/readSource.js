// ==================== SOURCE FILE READER ====================
// Reads one TMT forecast file (BP_*, BPK_*, GW_*, SR_*) into plain rows.
// Pure functions: no DOM, so they run in both the browser and vitest.
import * as XLSX from 'xlsx';
import { DEFAULT_N_COLS, MONTH_HEADERS } from '../../constants.js';
import { parseProductionMonth } from '../../utils/format.js';

export { categorizeFile } from './categorize.js';

const norm = (v) => String(v ?? '').trim().toUpperCase();

// Locate the header row ("PART NUMBER" in column A). Falls back to row 12.
export const findHeaderRow = (aoa, fallback = 12) => {
  const limit = Math.min(aoa.length, 60);
  for (let r = 0; r < limit; r++) {
    if (norm(aoa[r]?.[0]) === 'PART NUMBER') return r;
  }
  return fallback;
};

// Find 0-based indexes of N / N+1 / N+2 / N+3 on the header row.
export const findMonthColumns = (headers) => {
  const cols = [-1, -1, -1, -1];
  (headers || []).forEach((h, i) => {
    const idx = MONTH_HEADERS.indexOf(norm(h));
    if (idx !== -1 && cols[idx] === -1) cols[idx] = i;
  });
  return cols.map((c, i) => (c === -1 ? DEFAULT_N_COLS[i] : c));
};

// Key/value lines above the header, e.g. "PRODUCTION MONTH" | 202602
export const readMetadata = (aoa, headerRowIndex) => {
  const meta = {};
  for (let r = 0; r < headerRowIndex; r++) {
    const key = norm(aoa[r]?.[0]);
    const val = aoa[r]?.[1];
    if (!key || val === undefined || val === null || val === '') continue;
    if (key === 'PRODUCTION MONTH') meta.productionMonthRaw = String(val).trim();
    else if (key === 'ISSUE DATE') meta.issueDate = String(val).trim();
    else if (key === 'PLANT CODE') meta.plantCode = String(val).trim();
    else if (key === 'REVISION NUMBER') meta.revision = String(val).trim();
    else if (key === 'FORECAST TYPE') meta.forecastType = String(val).trim();
    else if (key === 'PART TYPE') meta.partType = String(val).trim();
  }
  meta.productionMonth = parseProductionMonth(meta.productionMonthRaw);
  return meta;
};

// Turn the array-of-arrays of the first sheet into part rows.
export const extractSourceRows = (aoa) => {
  const headerRowIndex = findHeaderRow(aoa);
  const dataStartIndex = headerRowIndex + 1;
  const meta = readMetadata(aoa, headerRowIndex);
  const [nCol, n1Col, n2Col, n3Col] = findMonthColumns(aoa[headerRowIndex]);
  const rows = [];

  for (let i = dataStartIndex; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row[0] === undefined || row[0] === null || row[0] === '<EOF>') continue;
    const partNumber = String(row[0]).trim();
    if (partNumber.length < 5) continue;

    rows.push({
      partNumber,
      partCode: row[1] ?? '',
      partDesc: row[2] ?? '',
      suppCode: row[3] ?? '',
      shippingDock: row[4] ?? '',
      dockCode: row[5] ?? '',
      carFamily: row[6] ?? '',
      packingSize: row[7] ?? 0,
      n: Number(row[nCol]) || 0,
      n1: Number(row[n1Col]) || 0,
      n2: Number(row[n2Col]) || 0,
      n3: Number(row[n3Col]) || 0,
      // Full source row so the template can be filled 1:1 (day columns included).
      rawRow: row.slice(0, Math.max(row.length, 150)),
      colPositions: { nCol, n1Col, n2Col, n3Col },
    });
  }

  return { rows, meta, headerRowIndex };
};

// ArrayBuffer of an .xls/.xlsx -> { sheetName, aoa }
export const parseSourceWorkbook = (arrayBuffer) => {
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('ไฟล์ไม่มี worksheet');
  const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  return { sheetName, aoa, workbook };
};

// Convenience: ArrayBuffer -> { rows, meta }
export const readSourceBuffer = (arrayBuffer) => {
  const { aoa, sheetName } = parseSourceWorkbook(arrayBuffer);
  return { sheetName, ...extractSourceRows(aoa) };
};

// Every sheet of a workbook as array-of-arrays (used to preserve a non-xlsx template).
export const workbookToRawSheets = (arrayBuffer) => {
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const rawSheets = {};
  workbook.SheetNames.forEach((name) => {
    rawSheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, blankrows: false });
  });
  return { sheetNames: workbook.SheetNames, rawSheets };
};
