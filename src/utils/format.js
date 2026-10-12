// ==================== FORMATTING HELPERS ====================
import { today as clockToday } from './clock.js';

export const formatNumber = (num) => (Number(num) || 0).toLocaleString('en-US');

export const formatSize = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

// 1 -> "A", 27 -> "AA"
export const getColumnLetter = (num) => {
  let result = '';
  while (num > 0) {
    num--;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result || 'A';
};

// "A" -> 1, "AA" -> 27
export const getColumnIndex = (letters) => {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse "202602" (or 202602 as number) into { year: 2026, month: 2 }.
export const parseProductionMonth = (value) => {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

// { year: 2026, month: 2 } + offset 1 -> "Mar'26"
export const formatMonth = (pm, offset = 0) => {
  if (!pm) return '';
  const idx = pm.month - 1 + offset;
  const year = pm.year + Math.floor(idx / 12);
  const month = ((idx % 12) + 12) % 12;
  return `${MONTH_SHORT[month]}'${String(year).slice(-2)}`;
};

// Labels for N..N+3 given the production month (null -> plain N labels).
export const monthLabels = (pm) =>
  ['N', 'N+1', 'N+2', 'N+3'].map((h, i) => (pm ? `${h} (${formatMonth(pm, i)})` : h));

export const todayStamp = () => clockToday();

// Excel sheet names: max 31 chars, none of []*?/\: and no leading/trailing apostrophe.
export const safeSheetName = (name) =>
  String(name ?? '')
    .replace(/[[\]*?/\\:]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
    .trim() || 'Sheet';

// ==================== DATE / DELTA POLICY ====================
// Gregorian years with Thai month abbreviations: "5 ต.ค. 2026 14:32". Never the Buddhist calendar.
export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Injectable clock (tests replace format.now).
export const format = { now: () => Date.now() };

const partsOf = (date, tz) => {
  const out = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).forEach((p) => { out[p.type] = p.value; });
  return out;
};

/** style: 'short' -> "5 ต.ค. 2026", 'long' -> "5 ต.ค. 2026 14:32", 'time' -> "14:32". Invalid -> "-". */
export const formatDate = (value, style = 'long', { tz = 'Asia/Bangkok' } = {}) => {
  if (value === null || value === undefined || value === '') return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  let p;
  try { p = partsOf(d, tz); } catch { return '-'; }
  const date = `${Number(p.day)} ${THAI_MONTHS[Number(p.month) - 1]} ${p.year}`;
  const time = `${p.hour}:${p.minute}`;
  if (style === 'short') return date;
  if (style === 'time') return time;
  return `${date} ${time}`;
};

/**
 * "2 นาทีที่แล้ว" / "อีก 3 ชั่วโมง". `now` defaults to the injectable clock.
 * @param {string|number|Date} iso
 * @param {Date|number} [now]
 */
export const relativeTime = (iso, now = format.now()) => {
  const t = new Date(iso).getTime();
  const n = now instanceof Date ? now.getTime() : Number(now);
  if (Number.isNaN(t) || Number.isNaN(n)) return '-';
  const diff = Math.round((n - t) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return 'เมื่อสักครู่';
  /** @type {[number, string][]} */
  const steps = [[60, 'นาที'], [3600, 'ชั่วโมง'], [86400, 'วัน'], [2592000, 'เดือน'], [31104000, 'ปี']];
  let i = 0;
  while (i < steps.length - 1 && abs >= steps[i + 1][0]) i++;
  const text = `${Math.max(1, Math.round(abs / steps[i][0]))} ${steps[i][1]}`;
  return diff >= 0 ? `${text}ที่แล้ว` : `อีก ${text}`;
};

/** formatDelta(1234, 0.026) -> "+1,234 (+2.6%)"; pct is a fraction and optional. */
export const formatDelta = (n, pct) => {
  const v = Number(n) || 0;
  const sign = (x) => (x > 0 ? '+' : x < 0 ? '-' : '');
  const base = `${sign(v)}${formatNumber(Math.abs(v))}`;
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return base;
  const p = Number(pct) * 100;
  return `${base} (${sign(p)}${Math.abs(p).toFixed(1)}%)`;
};

/** monthKey({ year: 2026, month: 2 }, 1) -> "2026-03"; null production month -> "". */
export const monthKey = (pm, offset = 0) => {
  if (!pm) return '';
  const idx = pm.month - 1 + offset;
  const year = pm.year + Math.floor(idx / 12);
  const month = ((idx % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

// ==================== EXPORT FILE NAME (export-gate) ====================
export const DEFAULT_FILE_PATTERN = 'Production_Updated_{month}_{date}.xlsx';
const FILE_NAME_FORBIDDEN = /[/\\:?*[\]"<>|]/g;

/**
 * Fill {month} ("Feb26" from the production month) and {date} ("2026-10-05") in a file-name pattern,
 * drop characters Windows/Excel refuse (/ : \ ? * [ ] " < > |) and make sure it ends with .xlsx.
 * An empty or all-forbidden result falls back to the default pattern.
 */
export const renderFileName = (pattern = DEFAULT_FILE_PATTERN, { productionMonth = null, date = todayStamp() } = {}) => {
  const fill = (p) => String(p ?? '')
    .replace(/\{month\}/gi, formatMonth(productionMonth).replace(/'/g, ''))
    .replace(/\{date\}/gi, date)
    .replace(FILE_NAME_FORBIDDEN, '')
    .replace(/_{2,}/g, '_')
    .replace(/_+(\.[^.]*)?$/, '$1') // "Production_.xlsx" -> "Production.xlsx" when {month} is empty
    .replace(/\s+/g, ' ')
    .trim();
  let name = fill(pattern).replace(/\.xlsx$/i, '').replace(/^[._\s]+|[._\s]+$/g, '');
  if (!name) name = fill(DEFAULT_FILE_PATTERN).replace(/\.xlsx$/i, '');
  return `${name.slice(0, 120)}.xlsx`;
};
