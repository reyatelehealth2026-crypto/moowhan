// ==================== RUN-OUT CLASSIFIER (pure, the only copy) ====================
// Signals come ONLY from the TMT forecast (N..N+3 + daily columns). There is no stock-on-hand in
// those files, so every result is a "signal" about the forecast, never a stock figure.
import { DEFAULT_N_COLS } from '../../constants.js';
import { daysInMonth, shiftMonth } from '../../utils/calendar.js';

export const STATUS = ['runout-n1', 'runout-n2', 'runout-n3', 'new', 'gap', 'normal', 'zero'];
export const SIGNAL_STATUSES = ['runout-n1', 'runout-n2', 'runout-n3', 'new', 'gap'];
export const isRunout = (s) => s === 'runout-n1' || s === 'runout-n2' || s === 'runout-n3';
export const isSignal = (s) => SIGNAL_STATUSES.includes(s);

export const STATUS_LABEL = {
  'runout-n1': 'สัญญาณหมดใน N+1',
  'runout-n2': 'สัญญาณหมดใน N+2',
  'runout-n3': 'สัญญาณหมดใน N+3',
  new: 'สัญญาณรายการใหม่',
  gap: 'สัญญาณขาดช่วง',
  normal: 'ยังมี forecast ต่อ',
  zero: 'ไม่มี forecast',
};

// Sort rank: run-out first, then new, gap, normal (zero last).
export const STATUS_RANK = { 'runout-n1': 0, 'runout-n2': 1, 'runout-n3': 2, new: 3, gap: 4, normal: 5, zero: 6 };

/**
 * Order matters: n1=0 with n2=n3=0 is a run-out, n1=0 with n2>0 is a gap (checked after "new").
 * Last positive month: n -> runout-n1 (n1 = 0 after it), n1 -> runout-n2, n2 -> runout-n3.
 */
export const classify = ({ n = 0, n1 = 0, n2 = 0, n3 = 0 } = {}) => {
  const v = [n, n1, n2, n3].map((x) => Number(x) || 0);
  const [a, b, c, d] = v;
  if (v.every((x) => x === 0)) return 'zero';
  if (a === 0 && b === 0 && (c > 0 || d > 0)) return 'new';
  // a zero followed by a positive later month
  if (v.some((x, i) => x === 0 && v.slice(i + 1).some((y) => y > 0))) return 'gap';
  if (d > 0) return 'normal';
  // d === 0 from here and no gap: the positive months are a prefix; the last one tells the run-out month
  const last = v.map((x) => x > 0).lastIndexOf(true);
  if (last === 0) return 'runout-n1';
  if (last === 1) return 'runout-n2';
  return 'runout-n3';
};

const pad = (x) => String(x).padStart(2, '0');

/**
 * Last day with a positive daily quantity across the 4 months.
 * Day block of month k = [col - 31, col - 1] where col is the total column from colPositions
 * (fallback DEFAULT_N_COLS). Returns { monthIndex, day, iso } or null (iso = null without a month).
 */
export const lastPackDate = (row, productionMonth) => {
  const cp = row?.colPositions || {};
  const cols = [cp.nCol, cp.n1Col, cp.n2Col, cp.n3Col].map((c, i) => (Number.isInteger(c) ? c : DEFAULT_N_COLS[i]));
  const raw = row?.rawRow || [];
  for (let m = 3; m >= 0; m--) {
    const start = cols[m] - 31;
    for (let d = 31; d >= 1; d--) {
      const v = Number(raw[start + d - 1]);
      if (Number.isFinite(v) && v > 0) {
        let iso = null;
        if (productionMonth?.year) {
          const ym = shiftMonth(productionMonth, m);
          if (d <= daysInMonth(ym.year, ym.month)) iso = `${ym.year}-${pad(ym.month)}-${pad(d)}`;
        }
        return { monthIndex: m, day: d, iso };
      }
    }
  }
  return null;
};

/** Normal rows keep forecasting past the window; they are flagged, not run-out. */
export const continues = (status) => status === 'normal';
