import { describe, it, expect } from 'vitest';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { buildSummary } from '../src/lib/excel/aggregate.js';
import { makeSource } from './fixtures/makeSource.js';

describe('source robustness', () => {
  it('finds a header on row 15 and reads metadata above it', () => {
    const r = readSourceBuffer(makeSource({ rows: 3, headerRow: 15, productionMonth: '202603' }).buffer);
    expect(r.headerRowIndex).toBe(14);
    expect(r.rows).toHaveLength(3);
    expect(r.meta.productionMonth).toEqual({ year: 2026, month: 3 });
  });

  it('follows shifted N columns by header text', () => {
    const { rows } = readSourceBuffer(makeSource({ rows: 2, nShift: 3 }).buffer);
    expect(rows[0].colPositions).toEqual({ nCol: 42, n1Col: 74, n2Col: 106, n3Col: 138 });
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('copes with extra fixed columns', () => {
    const { buffer, expected } = makeSource({ rows: 2, extraLeadingCols: 2 });
    const { rows } = readSourceBuffer(buffer);
    expect(rows[0].colPositions.nCol).toBe(41);
    expect(rows[0].n).toBe(expected[0].n[0]);
  });

  it('skips <EOF> and parts with short numbers', () => {
    const { aoa, buffer } = makeSource({ rows: 2, includeEof: true });
    expect(aoa.at(-1)).toEqual(['<EOF>']);
    expect(readSourceBuffer(buffer).rows).toHaveLength(2);
  });

  it('keeps duplicate parts as separate rows but one summary row', () => {
    const { rows } = readSourceBuffer(makeSource({ rows: 2, duplicates: true }).buffer);
    expect(rows).toHaveLength(3);
    const { summary } = buildSummary({ 'BP Daily': rows });
    expect(summary).toHaveLength(2);
    expect(summary.find((s) => s.partNumber === rows[0].partNumber).n).toBe(rows[0].n * 2);
  });

  it('multi-dock part: two rows, one summary row listing both docks', () => {
    const { rows } = readSourceBuffer(makeSource({ rows: 1, docks: ['D1', 'BN'] }).buffer);
    expect(rows.map((r) => r.dockCode)).toEqual(['D1', 'BN']);
    const { summary } = buildSummary({ 'BP Daily': rows });
    expect(summary).toHaveLength(1);
    expect(summary[0].sources).toHaveLength(2);
  });
});
