import { describe, it, expect } from 'vitest';
import { categorizeFile, readSourceBuffer, findMonthColumns, findHeaderRow } from '../src/lib/excel/readSource.js';
import { fixture, SOURCE_FILES } from './helpers.js';

describe('categorizeFile', () => {
  it('maps file name prefixes to plants (BPK before BP)', () => {
    expect(categorizeFile('BP veh 481D.xls')).toBe('BP');
    expect(categorizeFile('BPK packing 481D.xls')).toBe('BPK');
    expect(categorizeFile('bpk_x.xlsx')).toBe('BPK');
    expect(categorizeFile('GW-veh.xls')).toBe('GW');
    expect(categorizeFile('SR_1.xls')).toBe('SR');
    expect(categorizeFile('BPX.xls')).toBeNull();
    expect(categorizeFile('download.xlsx')).toBeNull();
  });
});

describe('header detection', () => {
  it('finds the PART NUMBER row and the N columns, with fallbacks', () => {
    const aoa = [['HEADER'], [], ['PART NUMBER', 'x']];
    expect(findHeaderRow(aoa)).toBe(2);
    expect(findHeaderRow([['a']])).toBe(12);
    expect(findMonthColumns(['PART NUMBER', 'N', 'N+1'])).toEqual([1, 2, 103, 135]);
    expect(findMonthColumns([])).toEqual([39, 71, 103, 135]);
  });
});

describe('readSourceBuffer on real TMT forecast files', () => {
  const expected = {
    'input/BP veh 481D.xls': { rows: 8, first: '86790-0K051-00', n: [1891, 1677, 919, 0] },
    'input/BPK packing 481D.xls': { rows: 12, first: '86790-0K051-00', n: [640, 650, 460, 230] },
    'input/GW packing B-MPV.xls': { rows: 2, first: '86790-BZ271-00', n: [2088, 1980, 1800, 1836] },
    'input/GW veh DG7.xls': { rows: 3, first: '86790-BZ210-00', n: [5651, 7044, 5224, 7912] },
    'input/SR veh 481D.xls': { rows: 4, first: '86790-0K051-00', n: [1352, 1787, 2037, 0] },
  };

  for (const file of SOURCE_FILES) {
    it(`parses ${file}`, () => {
      const { rows, meta, headerRowIndex } = readSourceBuffer(fixture(file));
      const exp = expected[file];
      expect(headerRowIndex).toBe(12);
      expect(rows).toHaveLength(exp.rows);
      expect(rows[0].partNumber).toBe(exp.first);
      expect([rows[0].n, rows[0].n1, rows[0].n2, rows[0].n3]).toEqual(exp.n);
      expect(rows[0].rawRow.length).toBeGreaterThanOrEqual(136);
      expect(rows[0].colPositions).toEqual({ nCol: 39, n1Col: 71, n2Col: 103, n3Col: 135 });
      expect(meta.productionMonthRaw).toBe('202602');
      expect(meta.productionMonth).toEqual({ year: 2026, month: 2 });
      expect(meta.issueDate).toBe('23/01/2026');
    });
  }
});
