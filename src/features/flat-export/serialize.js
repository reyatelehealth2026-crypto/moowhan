// CSV serialisation (pure). UTF-8 BOM + CRLF so Excel opens Thai text correctly.
export const BOM = '﻿';
const FORMULA_START = /^[=+\-@]/;

/** Strings that start with = + - @ are prefixed with ' so spreadsheets never evaluate them. */
export const csvCell = (value, delimiter = ',') => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (aoa, { delimiter = ',', bom = true } = {}) =>
  (bom ? BOM : '') + (aoa || []).map((row) => row.map((v) => csvCell(v, delimiter)).join(delimiter)).join('\r\n') + ((aoa || []).length ? '\r\n' : '');
