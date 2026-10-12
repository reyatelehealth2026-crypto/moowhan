import { describe, it, expect } from 'vitest';
import { daysInMonth, weekday, buildDayColumns, weekBuckets, WEEKDAY_LABELS } from '../src/utils/calendar.js';

describe('calendar', () => {
  it('daysInMonth and weekday', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(weekday(2026, 2, 1)).toBe(0);
    expect(WEEKDAY_LABELS[weekday(2026, 2, 1)]).toBe('อา');
  });
  it('buildDayColumns for Feb 2026', () => {
    const cols = buildDayColumns({ year: 2026, month: 2 });
    expect(cols).toHaveLength(4);
    expect(cols[0][0]).toMatchObject({ day: 1, weekday: 0, exists: true, isWeekend: true });
    expect(cols[0].slice(28).map((d) => d.exists)).toEqual([false, false, false]);
    expect(cols[1].every((d) => d.exists)).toBe(true); // March
    expect(cols[2][30].exists).toBe(false); // April has 30 days
  });
  it('null production month hides weekdays', () => {
    const cols = buildDayColumns(null);
    expect(cols[0][0]).toMatchObject({ weekday: null, exists: true, isWeekend: false });
  });
  it('weekBuckets uses Monday-Sunday weeks', () => {
    const w = weekBuckets({ year: 2026, month: 2 }, 0);
    expect(w[0]).toEqual([1]);
    expect(w[1]).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(w.at(-1)).toEqual([23, 24, 25, 26, 27, 28]);
    expect(w).toHaveLength(5);
  });
});
