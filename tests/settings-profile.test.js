import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import {
  DEFAULT_PROFILE, defaultProfile, exportProfile, importProfile, mergeWithDefaults, validateProfile,
} from '../src/features/settings-profile/profile.js';
import {
  DEFAULT_CALENDAR, addWorkingDays, isWorkingDay, lastWorkingDay, normalizeCalendar, suggestNonWorkingDays, workingDaysInMonth,
} from '../src/features/settings-profile/calendar.js';
import { renderFileName } from '../src/utils/format.js';

const mutate = (fn) => { const p = defaultProfile(); fn(p); return p; };
const FEB = { year: 2026, month: 2 };
const cal = (scopes = {}, extra = {}) => ({ workingWeekdays: [1, 2, 3, 4, 5], scopes: { all: { holidays: [], extraWorkDays: [], shutdowns: [] }, ...scopes }, ...extra });

describe('validateProfile', () => {
  it('accepts the default profile', () => {
    expect(validateProfile(DEFAULT_PROFILE)).toEqual({ ok: true, errors: [] });
  });
  const cases = [
    ['รหัสโรงงานซ้ำ', (p) => { p.plants[1].code = 'BP'; }, /ซ้ำ/],
    ['dailySheet ซ้ำ', (p) => { p.plants[1].dailySheet = p.plants[0].dailySheet; }, /ชื่อชีต Daily .* ซ้ำ/],
    ['filePrefixes ว่าง', (p) => { p.plants[0].filePrefixes = []; }, /filePrefixes/],
    ['regex ผิด', (p) => { p.plants[0].filePrefixes = ['(']; }, /regex/],
    ['schemaVersion ไม่รู้จัก', (p) => { p.schemaVersion = 2; }, /schemaVersion/],
    ['stamp นอก writableSheets', (p) => { p.template.stamps[0].sheet = 'Summary'; }, /ไม่อยู่ในชีตที่เขียนได้/],
    ['คีย์ files', (p) => { p.files = []; }, /"files"/],
    ['ปฏิทินผิดรูปแบบ', (p) => { p.features.calendar.scopes.all.holidays = [{ date: '2026-02-30' }]; }, /ไม่ใช่วันที่จริง/],
  ];
  it.each(cases)('rejects: %s with its own Thai message', (_n, fn, re) => {
    const r = validateProfile(mutate(fn));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => re.test(e))).toBe(true);
    expect(r.errors.every((e) => /[฀-๿]/.test(e))).toBe(true);
  });
  it('rejects JSON larger than 64KB', () => {
    const big = JSON.stringify(mutate((p) => { p.features.note = 'x'.repeat(70 * 1024); }));
    expect(validateProfile(big)).toMatchObject({ ok: false, errors: [expect.stringContaining('64')] });
  });
  it('rejects broken JSON text', () => {
    expect(validateProfile('{nope').ok).toBe(false);
  });
  it('a rejected import does not produce a profile to replace the active one', () => {
    const r = importProfile(JSON.stringify(mutate((p) => { p.files = 1; })));
    expect(r.ok).toBe(false);
    expect(r.profile).toBeNull();
  });
});

describe('export / import', () => {
  it('round-trips deep-equal', () => {
    const p = mutate((x) => { x.export.fileNamePattern = 'Plan_{month}.xlsx'; x.features.calendar.scopes.BP = { holidays: [{ date: '2026-02-16', name: 'ชดเชย' }], extraWorkDays: ['2026-02-14'], shutdowns: [] }; });
    const r = importProfile(exportProfile(p));
    expect(r.ok).toBe(true);
    expect(r.profile).toEqual(p);
  });
  it('mergeWithDefaults fills missing values', () => {
    const m = mergeWithDefaults({ schemaVersion: 1, export: { highlight: false } });
    expect(m.export).toEqual({ ...DEFAULT_PROFILE.export, highlight: false });
    expect(m.plants).toHaveLength(4);
    expect(mergeWithDefaults({ schemaVersion: 1, plants: [{ code: 'BP', filePrefixes: ['^X'], dailySheet: 'BP Daily' }] }).plants[0].label).toBe(DEFAULT_PROFILE.plants[0].label);
  });
});

describe('renderFileName', () => {
  const now = new Date(2026, 1, 5, 14, 32);
  const pm = FEB;
  it('default pattern', () => {
    expect(renderFileName('Production_Updated_{monthLabel}_{date}.xlsx', { productionMonth: pm, now })).toBe("Production_Updated_Feb'26_2026-02-05.xlsx");
    expect(renderFileName('Production_Updated_{monthLabel}_{date}.xlsx', { productionMonth: pm, now })).toMatch(/^Production_/);
  });
  it('other tokens, unknown token kept', () => {
    expect(renderFileName('P_{month}_{time}_{rev}_{zzz}.xlsx', { productionMonth: pm, now, rev: 'R2' })).toBe('P_202602_1432_R2_{zzz}.xlsx');
  });
  it('strips forbidden characters, leading dots and rewrites reserved names', () => {
    expect(renderFileName('a/b\\c:d*e?.xlsx', { now })).toBe('a_b_c_d_e.xlsx');
    expect(renderFileName('..hidden.xlsx', { now })).toBe('hidden.xlsx');
    expect(renderFileName('CON.xlsx', { now })).toBe('CON_file.xlsx');
    expect(renderFileName('nul', { now })).toBe('nul_file.xlsx');
  });
  it('adds .xlsx, caps the length, falls back when empty', () => {
    expect(renderFileName('plan', { now })).toBe('plan.xlsx');
    expect(renderFileName('x'.repeat(300) + '.xlsx', { now }).length).toBeLessThanOrEqual(125);
    expect(renderFileName('{monthLabel}', { now })).toBe('Production_Updated.xlsx');
  });
});

describe('working calendar', () => {
  it('default has no built-in holidays and 20 working days in Feb 2026', () => {
    expect(DEFAULT_CALENDAR.scopes.all).toEqual({ holidays: [], extraWorkDays: [], shutdowns: [] });
    expect(workingDaysInMonth(DEFAULT_CALENDAR, 'BP', FEB)).toBe(20);
  });
  it('extra Saturdays then a holiday: 22 then 21', () => {
    const extra = cal({ BP: { holidays: [], extraWorkDays: ['2026-02-14', '2026-02-28'], shutdowns: [] } });
    expect(workingDaysInMonth(extra, 'BP', FEB)).toBe(22);
    expect(workingDaysInMonth(extra, 'GW', FEB)).toBe(20);
    const both = cal({ BP: { holidays: [{ date: '2026-02-16', name: 'x' }], extraWorkDays: ['2026-02-14', '2026-02-28'], shutdowns: [] } });
    expect(workingDaysInMonth(both, 'BP', FEB)).toBe(21);
  });
  it('shutdown in scope "all" closes every plant', () => {
    const c = cal({ all: { holidays: [], extraWorkDays: [], shutdowns: [{ from: '2026-04-13', to: '2026-04-15', name: 'สงกรานต์' }] } });
    ['BP', 'BPK', 'GW', 'SR'].forEach((p) => ['2026-04-13', '2026-04-14', '2026-04-15'].forEach((d) => expect(isWorkingDay(c, p, d)).toBe(false)));
    expect(isWorkingDay(c, 'BP', '2026-04-16')).toBe(true);
  });
  it('addWorkingDays skips weekends, both directions, and lastWorkingDay', () => {
    expect(addWorkingDays(DEFAULT_CALENDAR, 'BP', '2026-02-06', 1)).toBe('2026-02-09'); // Fri -> Mon
    expect(addWorkingDays(DEFAULT_CALENDAR, 'BP', '2026-02-06', 5)).toBe('2026-02-13');
    expect(addWorkingDays(DEFAULT_CALENDAR, 'BP', '2026-02-09', -1)).toBe('2026-02-06');
    expect(addWorkingDays(DEFAULT_CALENDAR, 'BP', '2026-02-06', 0)).toBe('2026-02-06');
    expect(lastWorkingDay(DEFAULT_CALENDAR, 'BP', FEB)).toBe('2026-02-27');
    expect(addWorkingDays(cal({}, { workingWeekdays: [] }), 'BP', '2026-02-06', 1)).toBeNull();
  });
  it('per-plant weekdays override', () => {
    const c = cal({ SR: { workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [], extraWorkDays: [], shutdowns: [] } });
    expect(isWorkingDay(c, 'SR', '2026-02-14')).toBe(true);
    expect(isWorkingDay(c, 'BP', '2026-02-14')).toBe(false);
  });
  it('corrupt or oversized calendars fall back to the default', () => {
    const corrupt = [null, 'x', { workingWeekdays: 'mon' }, cal({ all: { holidays: [{ date: '2026-13-01' }], extraWorkDays: [], shutdowns: [] } }), { scopes: [] }];
    corrupt.slice(1).forEach((c) => {
      expect(normalizeCalendar(c).errors.length).toBeGreaterThan(0);
      expect(workingDaysInMonth(c, 'BP', FEB)).toBe(20);
    });
    const huge = cal({ all: { holidays: Array.from({ length: 501 }, (_, i) => ({ date: `${2000 + Math.floor(i / 300)}-0${1 + (i % 9)}-${String(1 + (i % 27)).padStart(2, '0')}`, name: '' })), extraWorkDays: [], shutdowns: [] } });
    expect(normalizeCalendar(huge).errors.join()).toMatch(/500/);
    expect(workingDaysInMonth(huge, 'BP', FEB)).toBe(20);
    expect(workingDaysInMonth(undefined, 'BP', FEB)).toBe(20);
  });
});

describe('suggestNonWorkingDays on fixtures', () => {
  let data;
  beforeAll(() => {
    data = { BP: [], BPK: [], GW: [], SR: [] };
    SOURCE_FILES.forEach((f) => data[categorizeFile(f.split('/')[1])].push(...readSourceBuffer(fixture(f)).rows));
  });
  it.each(['BP', 'BPK', 'GW', 'SR'])('%s Feb: [1,7,8,15,21,22], Saturdays 14 and 28 not guessed', (plant) => {
    const days = suggestNonWorkingDays(data[plant], 0, { productionMonth: FEB });
    expect(days).toEqual([1, 7, 8, 15, 21, 22]);
    expect(days).not.toContain(14);
    expect(days).not.toContain(28);
  });
  it('empty rows suggest nothing', () => {
    expect(suggestNonWorkingDays([], 0, { productionMonth: FEB })).toEqual([]);
  });
});
