// Synthetic TMT forecast workbooks, built in memory (no real customer data).
// Layout: 12 key/value rows, header row, then parts; 8 fixed columns + 4 blocks x (31 day cells + total).
import * as XLSX from 'xlsx';

const FIXED = ['PART NUMBER', 'PART CODE', 'PART DESC', 'SUPP CODE', 'SHIPPING DOCK', 'DOCK CODE', 'CAR FAMILY', 'PACKING SIZE'];
const TOTALS = ['N', 'N+1', 'N+2', 'N+3'];

// deterministic pseudo-random so fixtures never change between runs
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

/** Split `total` over the first `monthDays` days (always a 31-cell array); weekend days (day % 7 in {0,6}) stay 0 when weekendZero. */
export const spreadDays = (total, weekendZero = false, monthDays = 31) => {
  const days = Array.from({ length: monthDays }, (_, i) => i + 1).filter((d) => !(weekendZero && (d % 7 === 0 || d % 7 === 6)));
  const out = new Array(31).fill(0);
  if (!total) return out;
  const base = Math.floor(total / days.length);
  days.forEach((d) => { out[d - 1] = base; });
  out[days[days.length - 1] - 1] += total - base * days.length;
  return out;
};

// days in month `offset` months after YYYYMM
const monthLength = (yyyymm, offset) => {
  const y = Number(String(yyyymm).slice(0, 4));
  const m = Number(String(yyyymm).slice(4, 6)) - 1 + offset;
  return new Date(Date.UTC(y + Math.floor(m / 12), (m % 12) + 1, 0)).getUTCDate();
};

export const partNumberOf = (i) => `86790-T${String(i + 1).padStart(4, '0')}-00`;

/**
 * @param {object} [o]
 * @param {string} [o.plantCode='BP']
 * @param {string} [o.productionMonth='202602']
 * @param {number} [o.rows=5]          number of parts
 * @param {number} [o.headerRow=13]    1-based row of the PART NUMBER header
 * @param {number} [o.extraLeadingCols=0]  extra fixed columns after PACKING SIZE
 * @param {number} [o.nShift=0]        extra padding columns before the first N total
 * @param {boolean} [o.includeEof=false]
 * @param {boolean} [o.duplicates=false]  repeat the first part as an extra row
 * @param {string[]} [o.docks=['D1']]  one row per dock for every part
 * @param {number[]} [o.packingSizes]
 * @param {boolean} [o.weekendZero=false]
 * @param {boolean} [o.calendarDays=false]  leave days that do not exist in the month empty (29-31 Feb, 31 Apr ...), like real TMT files
 * @param {number} [o.runoutRows=0]    last N parts get 0 in N+2 / N+3
 * @param {'xls'|'xlsx'} [o.format='xlsx']
 * @param {number} [o.seed=7]
 * @returns {{ aoa: any[][], buffer: ArrayBuffer, expected: object[] }}
 */
export const makeSource = (o = {}) => {
  const {
    plantCode = 'BP', productionMonth = '202602', rows = 5, headerRow = 13, extraLeadingCols = 0, nShift = 0,
    includeEof = false, duplicates = false, docks = ['D1'], packingSizes = [60, 120], weekendZero = false,
    runoutRows = 0, format = 'xlsx', seed = 7, calendarDays = false, partOffset = 0,
  } = o;
  const rnd = lcg(seed);
  const kv = [
    ['PLANT CODE', plantCode], ['PART TYPE', 'VEH'], ['PRODUCTION MONTH', productionMonth], ['REVISION TYPE', 'F'],
    ['FORECAST TYPE', 'M'], ['WOC WEEK', 'W5'], ['REVISION NUMBER', '01'], ['ISSUE DATE', '23/01/2026'],
    ['REMARKS', ''], ['DETAILS', ''], [], [],
  ];
  const aoa = kv.slice(0, 12);
  while (aoa.length < headerRow - 1) aoa.push([]);

  const fixedHead = [...FIXED, ...Array.from({ length: extraLeadingCols }, (_, i) => `EXTRA${i + 1}`)];
  const head = [...fixedHead];
  for (let b = 0; b < 4; b++) {
    for (let d = 1; d <= 31; d++) head.push(d);
    if (b === 0) for (let p = 0; p < nShift; p++) head.push(`PAD${p + 1}`);
    head.push(TOTALS[b]);
  }
  aoa.push(head);

  const expected = [];
  const makeRow = (i, dock, n) => {
    const r = [partNumberOf(i + partOffset), `P${i + 1}`, `PART ${i + 1}`, 'S001', dock, dock, `CF${(i % 3) + 1}`, packingSizes[i % packingSizes.length]];
    for (let e = 0; e < extraLeadingCols; e++) r.push(`x${e}`);
    n.forEach((total, b) => {
      r.push(...spreadDays(total, weekendZero, calendarDays ? monthLength(productionMonth, b) : 31));
      if (b === 0) for (let p = 0; p < nShift; p++) r.push('');
      r.push(total);
    });
    aoa.push(r);
    expected.push({ partNumber: r[0], dock, n });
  };
  for (let i = 0; i < rows; i++) {
    const runout = i >= rows - runoutRows;
    docks.forEach((dock) => {
      const n = [0, 1, 2, 3].map((b) => (runout && b >= 2 ? 0 : Math.round((200 + rnd() * 1800) / 10) * 10));
      makeRow(i, dock, n);
    });
  }
  if (duplicates && rows > 0) makeRow(0, docks[0], expected[0].n);
  if (includeEof) aoa.push(['<EOF>']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { bookType: format === 'xls' ? 'biff8' : 'xlsx', type: 'buffer' });
  const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return { aoa, buffer, expected };
};
