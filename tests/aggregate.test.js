import { describe, it, expect } from 'vitest';
import { buildSummary, computeTotals, buildAnalyzeRows, totalsByPlant } from '../src/lib/excel/aggregate.js';
import { monthLabels, parseProductionMonth, formatMonth, getColumnIndex, getColumnLetter } from '../src/utils/format.js';

const data = {
  'BP Daily': [
    { partNumber: 'P-2', partCode: 'a', n: 1, n1: 2, n2: 3, n3: 4, rawRow: ['P-2'] },
    { partNumber: 'P-1', partCode: 'b', n: 10, n1: 0, n2: 0, n3: 0, rawRow: ['P-1'] },
  ],
  'SR Daily': [{ partNumber: 'P-1', partCode: 'c', n: 5, n1: 5, n2: 5, n3: 5, rawRow: ['P-1'] }],
  'GW Daily': [],
};

describe('buildSummary', () => {
  it('sums per part across plants and lists sources', () => {
    const { summary, matching } = buildSummary(data);
    expect(summary.map((s) => s.partNumber)).toEqual(['P-1', 'P-2']);
    expect(summary[0]).toMatchObject({ plants: 'BP, SR', n: 15, n1: 5, n2: 5, n3: 5 });
    expect(matching['P-1'].sources).toHaveLength(2);
    expect(computeTotals(summary)).toEqual({ n: 16, n1: 7, n2: 8, n3: 9 });
  });

  it('orders Analyze rows by plant then part number', () => {
    expect(buildAnalyzeRows(data).map((r) => `${r.plant}:${r.partNumber}`)).toEqual(['BP:P-1', 'BP:P-2', 'SR:P-1']);
    expect(totalsByPlant(data)).toEqual([
      { plant: 'BP', count: 2, total: 20 },
      { plant: 'SR', count: 1, total: 20 },
      { plant: 'GW', count: 0, total: 0 },
    ]);
  });
});

describe('format helpers', () => {
  it('derives month labels from the production month', () => {
    const pm = parseProductionMonth('202602');
    expect(pm).toEqual({ year: 2026, month: 2 });
    expect(monthLabels(pm)).toEqual(["N (Feb'26)", "N+1 (Mar'26)", "N+2 (Apr'26)", "N+3 (May'26)"]);
    expect(formatMonth(parseProductionMonth(202611), 3)).toBe("Feb'27");
    expect(monthLabels(null)).toEqual(['N', 'N+1', 'N+2', 'N+3']);
    expect(parseProductionMonth('2026-02')).toBeNull();
  });
  it('converts column letters', () => {
    expect(getColumnLetter(1)).toBe('A');
    expect(getColumnLetter(138)).toBe('EH');
    expect(getColumnIndex('EH')).toBe(138);
    expect(getColumnIndex(getColumnLetter(702))).toBe(702);
  });
});
