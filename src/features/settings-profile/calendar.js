// ==================== WORKING CALENDAR (pure, no DOM) ====================
// Model (profile.features.calendar):
//   { workingWeekdays: [1,2,3,4,5],                       // 0 = Sunday .. 6 = Saturday, default Mon-Fri
//     scopes: { all: Scope, BP: Scope, ... } }            // 'all' = every plant (UI label "ทุกโรงงาน")
//   Scope = { workingWeekdays?: number[], holidays: [{date, name}], extraWorkDays: [ISO], shutdowns: [{from, to, name}] }
// Rules: a shutdown or holiday (plant scope or 'all') always wins; an extra work day turns a weekly day
// off into a working day; otherwise the weekday decides. No public holidays are built in: the user
// enters their own. A corrupt or oversized calendar silently falls back to the default.
import { daysInMonth, shiftMonth } from '../../utils/calendar.js';
import { dayValues } from '../../lib/excel/daily.js';

export const ALL_SCOPE = 'all';
export const MAX_CALENDAR_ENTRIES = 500;
export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

export const emptyScope = () => ({ holidays: [], extraWorkDays: [], shutdowns: [] });
export const DEFAULT_CALENDAR = { workingWeekdays: [...DEFAULT_WEEKDAYS], scopes: { [ALL_SCOPE]: emptyScope() } };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** True for a real calendar date written as YYYY-MM-DD. */
export const isIsoDate = (s) => {
  const m = typeof s === 'string' && ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
};
const toUtc = (iso) => { const m = ISO_RE.exec(iso); return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])); };
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86400000;
export const isoOf = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
export const weekdayOf = (iso) => new Date(toUtc(iso)).getUTCDay();

const isWeekdays = (a) => Array.isArray(a) && a.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);

/** Validates a raw calendar. Returns { calendar (clean), errors: [Thai messages] }; errors => calendar is the default. */
export const normalizeCalendar = (raw) => {
  if (raw === undefined || raw === null) return { calendar: structuredCloneSafe(DEFAULT_CALENDAR), errors: [] };
  const errors = [];
  const bad = (m) => errors.push(`ปฏิทินวันทำงาน: ${m}`);
  if (typeof raw !== 'object' || Array.isArray(raw)) { bad('รูปแบบไม่ถูกต้อง (ต้องเป็นออบเจ็กต์)'); return { calendar: structuredCloneSafe(DEFAULT_CALENDAR), errors }; }
  const weekdays = raw.workingWeekdays === undefined ? [...DEFAULT_WEEKDAYS] : raw.workingWeekdays;
  if (!isWeekdays(weekdays)) bad('workingWeekdays ต้องเป็นเลข 0-6 (0 = อาทิตย์)');
  const scopesIn = raw.scopes === undefined ? { [ALL_SCOPE]: emptyScope() } : raw.scopes;
  if (!scopesIn || typeof scopesIn !== 'object' || Array.isArray(scopesIn)) bad('scopes ต้องเป็นออบเจ็กต์');
  let count = 0;
  const scopes = {};
  if (errors.length === 0) {
    for (const [name, sc] of Object.entries(scopesIn)) {
      if (!sc || typeof sc !== 'object' || Array.isArray(sc)) { bad(`ขอบเขต "${name}" ไม่ถูกต้อง`); continue; }
      if (sc.workingWeekdays !== undefined && !isWeekdays(sc.workingWeekdays)) bad(`ขอบเขต "${name}": วันทำงานประจำสัปดาห์ต้องเป็นเลข 0-6`);
      const holidays = sc.holidays ?? [];
      const extra = sc.extraWorkDays ?? [];
      const shutdowns = sc.shutdowns ?? [];
      if (![holidays, extra, shutdowns].every(Array.isArray)) { bad(`ขอบเขต "${name}": holidays/extraWorkDays/shutdowns ต้องเป็นรายการ`); continue; }
      count += holidays.length + extra.length + shutdowns.length;
      holidays.forEach((h) => { if (!h || !isIsoDate(h.date)) bad(`วันหยุด "${h?.date ?? ''}" ไม่ใช่วันที่จริง (รูปแบบ YYYY-MM-DD)`); });
      extra.forEach((d) => { if (!isIsoDate(d)) bad(`วันทำงานพิเศษ "${d}" ไม่ใช่วันที่จริง (รูปแบบ YYYY-MM-DD)`); });
      shutdowns.forEach((s) => {
        if (!s || !isIsoDate(s.from) || !isIsoDate(s.to)) bad(`ช่วงหยุดโรงงาน "${s?.from ?? ''}..${s?.to ?? ''}" ไม่ใช่วันที่จริง`);
        else if (s.from > s.to) bad(`ช่วงหยุดโรงงาน ${s.from}..${s.to}: วันเริ่มต้องไม่เกินวันสิ้นสุด`);
      });
      scopes[name] = {
        ...(sc.workingWeekdays !== undefined ? { workingWeekdays: [...sc.workingWeekdays] } : {}),
        holidays: holidays.map((h) => ({ date: h?.date, name: String(h?.name ?? '') })),
        extraWorkDays: [...extra],
        shutdowns: shutdowns.map((s) => ({ from: s?.from, to: s?.to, name: String(s?.name ?? '') })),
      };
    }
    if (count > MAX_CALENDAR_ENTRIES) bad(`มีรายการรวม ${count} รายการ เกินกำหนด ${MAX_CALENDAR_ENTRIES} รายการ`);
  }
  if (errors.length) return { calendar: structuredCloneSafe(DEFAULT_CALENDAR), errors };
  if (!scopes[ALL_SCOPE]) scopes[ALL_SCOPE] = emptyScope();
  return { calendar: { workingWeekdays: [...weekdays], scopes }, errors: [] };
};

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

const resolve = (cal) => normalizeCalendar(cal && typeof cal === 'object' ? cal : undefined).calendar;

const scopesFor = (calendar, plant) => [calendar.scopes[ALL_SCOPE], plant && plant !== ALL_SCOPE ? calendar.scopes[plant] : null].filter(Boolean);
const weekdaysFor = (calendar, plant) => {
  const own = plant && plant !== ALL_SCOPE ? calendar.scopes[plant]?.workingWeekdays : undefined;
  return own ?? calendar.scopes[ALL_SCOPE]?.workingWeekdays ?? calendar.workingWeekdays;
};

/** Why a day is (not) a working day: { working, reason: 'shutdown'|'holiday'|'extra'|'weekday'|'weekend', name? }. */
export const dayStatus = (cal, plant, iso) => {
  if (!isIsoDate(iso)) return { working: false, reason: 'invalid' };
  const calendar = resolve(cal);
  const scopes = scopesFor(calendar, plant);
  for (const sc of scopes) {
    const s = sc.shutdowns.find((x) => iso >= x.from && iso <= x.to);
    if (s) return { working: false, reason: 'shutdown', name: s.name };
  }
  for (const sc of scopes) {
    const h = sc.holidays.find((x) => x.date === iso);
    if (h) return { working: false, reason: 'holiday', name: h.name };
  }
  if (scopes.some((sc) => sc.extraWorkDays.includes(iso))) return { working: true, reason: 'extra' };
  return weekdaysFor(calendar, plant).includes(weekdayOf(iso)) ? { working: true, reason: 'weekday' } : { working: false, reason: 'weekend' };
};

export const isWorkingDay = (cal, plant, iso) => dayStatus(cal, plant, iso).working;

/** Number of working days of { year, month }. */
export const workingDaysInMonth = (cal, plant, { year, month }) => {
  let n = 0;
  for (let d = 1, last = daysInMonth(year, month); d <= last; d++) if (isWorkingDay(cal, plant, isoOf(year, month, d))) n++;
  return n;
};

/** The ISO date n working days after (n > 0) or before (n < 0) `iso`; n = 0 returns iso itself. Null when none exists. */
export const addWorkingDays = (cal, plant, iso, n) => {
  if (!isIsoDate(iso)) return null;
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(Math.trunc(n));
  let ms = toUtc(iso);
  for (let guard = 0; left > 0 && guard < 3660; guard++) {
    ms += step * DAY_MS;
    if (isWorkingDay(cal, plant, fromUtc(ms))) left--;
  }
  return left === 0 ? fromUtc(ms) : null;
};

/** Last working day (ISO) of the month, or null. */
export const lastWorkingDay = (cal, plant, { year, month }) => {
  for (let d = daysInMonth(year, month); d >= 1; d--) if (isWorkingDay(cal, plant, isoOf(year, month, d))) return isoOf(year, month, d);
  return null;
};

/**
 * Days (1-based numbers) of month `monthIdx` (0 = N) on which EVERY row has quantity 0, i.e. "expected closed".
 * This is a hint shown apart from confirmed holidays, never used as confirmed data.
 * Pass { productionMonth } so days beyond the month's length are ignored.
 */
export const suggestNonWorkingDays = (rows, monthIdx = 0, { productionMonth } = {}) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];
  const sums = new Array(31).fill(0);
  list.forEach((r) => dayValues(r, monthIdx).forEach((v, i) => { sums[i] += Math.abs(v); }));
  const len = productionMonth ? (({ year, month }) => daysInMonth(year, month))(shiftMonth(productionMonth, monthIdx)) : 31;
  const out = [];
  for (let i = 0; i < len; i++) if (sums[i] === 0) out.push(i + 1);
  return out;
};
