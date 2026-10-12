import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { dayValues, sumByPartDay, totalsByDock, weeklyBuckets, buildDailyTotalAoa, sumArray } from '../src/lib/excel/daily.js';
import { MONTH_KEYS } from '../src/constants.js';

let data;
beforeAll(() => {
  data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  SOURCE_FILES.forEach((f) => {
    const { rows } = readSourceBuffer(fixture(f));
    data[`${categorizeFile(f.split('/')[1])} Daily`].push(...rows);
  });
});

describe('dayValues', () => {
  it('first BP row N: 31 numbers summing 1891', () => {
    const v = dayValues(data['BP Daily'][0], 0);
    expect(v).toHaveLength(31);
    expect(sumArray(v)).toBe(1891);
  });
  it('every row and month sums to its n..n3', () => {
    Object.values(data).flat().forEach((row) => MONTH_KEYS.forEach((k, m) => expect(sumArray(dayValues(row, m))).toBe(row[k])));
  });
  it('uses colPositions, not constants (synthetic nCol=40)', () => {
    const rawRow = new Array(150).fill(0);
    for (let i = 9; i <= 39; i++) rawRow[i] = i;
    const v = dayValues({ rawRow, colPositions: { nCol: 40, n1Col: 72, n2Col: 104, n3Col: 136 } }, 0);
    expect(v[0]).toBe(9);
    expect(v[30]).toBe(39);
  });
});

describe('aggregation', () => {
  it('sumByPartDay merges plants', () => {
    const list = sumByPartDay(data, 0);
    expect(list).toHaveLength(15);
    const p = list.find((x) => x.partNumber === '86790-0K051-00');
    expect(p.days[1]).toBe(446);
    expect(p.total).toBe(9673);
  });
  it('totalsByDock groups BPK by dock', () => {
    const bpk = totalsByDock(data, 0).find((x) => x.plant === 'BPK');
    expect(bpk.docks.map((d) => d.dock)).toEqual(expect.arrayContaining(['BN', 'D1']));
    expect(bpk.total).toBe(sumArray(bpk.docks.map((d) => d.total)));
  });
  it('weeklyBuckets totals', () => {
    const days = new Array(31).fill(1);
    const w = weeklyBuckets(days, { year: 2026, month: 2 });
    expect(w.map((b) => b.total)).toEqual([1, 7, 7, 7, 6]);
  });
  it('Daily Total aoa has 15 rows in merged mode', () => {
    const aoa = buildDailyTotalAoa(data, { merged: true });
    expect(aoa).toHaveLength(16);
    expect(aoa[0].slice(0, 4)).toEqual(['Part Number', 'Plant', 'Dock', 'N 1']);
    expect(aoa[0]).toHaveLength(3 + 124);
    expect(aoa[1]).toHaveLength(127);
  });
});
