// ==================== SAFE TEXT SERIALIZERS ====================
// Pure (no DOM/React). One place for escaping so TSV / CSV / JSON output behaves identically.

const FORMULA_START = /^[=+\-@\t\r]/;
// C0 controls except \n (kept so quoted CSV cells can hold line breaks), DEL, bidi embedding/override/isolate marks
const STRIP = /[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/g;
// TAB / CR are removed above, so only the formula check needs to run on the raw value first.

/** Strings that a spreadsheet would read as a formula get a leading apostrophe; control and bidi characters are removed. */
export const escapeCellText = (v) => {
  if (typeof v !== 'string') return v;
  const clean = v.replace(STRIP, '');
  return FORMULA_START.test(v) || FORMULA_START.test(clean) ? `'${clean}` : clean;
};

const flat = (v) => {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? escapeCellText(v.replace(/[\t\r\n]+/g, ' ')) : String(v);
};

/** Rows -> tab separated text (paste into Excel / Google Sheets). Numbers stay raw (no thousand separators). */
export const toTsv = (aoa) => (aoa || []).map((row) => (row || []).map(flat).join('\t')).join('\n');

const csvCell = (v, delimiter) => {
  const e = escapeCellText(v);
  const s = e === null || e === undefined ? '' : String(e);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV. bom=true prepends U+FEFF so Excel opens Thai text correctly. */
export const toCsv = (aoa, { bom = true, eol = '\r\n', delimiter = ',' } = {}) =>
  (bom ? '﻿' : '') + (aoa || []).map((row) => (row || []).map((c) => csvCell(c, delimiter)).join(delimiter)).join(eol);

/** Deep copy with every string run through escapeCellText (keys included are left alone). */
export const jsonSafe = (v) => {
  if (typeof v === 'string') return escapeCellText(v);
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]));
  return v;
};
