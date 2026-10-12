// ==================== CALENDAR HELPERS (pure) ====================
export const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']; // index = Date#getUTCDay (0 = Sunday)

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** 0 = Sunday .. 6 = Saturday. */
export const weekday = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

/** { year, month } shifted by `offset` months. */
export const shiftMonth = (pm, offset) => {
  const idx = pm.month - 1 + offset;
  return { year: pm.year + Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 + 1 };
};

/**
 * Four groups (N..N+3) of 31 day descriptors: [{ day, weekday, exists, isWeekend }].
 * Without a production month: weekday is null, every day exists and nothing is shaded.
 */
export const buildDayColumns = (pm) =>
  [0, 1, 2, 3].map((offset) => {
    const m = pm ? shiftMonth(pm, offset) : null;
    const dim = m ? daysInMonth(m.year, m.month) : 31;
    return Array.from({ length: 31 }, (_, i) => {
      const day = i + 1;
      const wd = m && day <= dim ? weekday(m.year, m.month, day) : null;
      return { day, weekday: wd, exists: day <= dim, isWeekend: wd === 0 };
    });
  });

/**
 * Splits the days of one month into weeks. One convention only: weekStart 1 = Monday..Sunday.
 * Returns arrays of day numbers, e.g. Feb 2026 (1st is Sunday) -> [[1],[2..8],[9..15],[16..22],[23..28]].
 */
export const weekBuckets = (pm, monthIdx = 0, weekStart = 1) => {
  const m = pm ? shiftMonth(pm, monthIdx) : null;
  const dim = m ? daysInMonth(m.year, m.month) : 31;
  const buckets = [];
  let cur = [];
  for (let d = 1; d <= dim; d++) {
    if (m && cur.length && (weekday(m.year, m.month, d) - weekStart + 7) % 7 === 0) { buckets.push(cur); cur = []; }
    else if (!m && cur.length === 7) { buckets.push(cur); cur = []; }
    cur.push(d);
  }
  if (cur.length) buckets.push(cur);
  return buckets;
};
