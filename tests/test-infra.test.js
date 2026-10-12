import { describe, it, expect } from 'vitest';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { buildSummary } from '../src/lib/excel/aggregate.js';
import { makeSource } from './fixtures/makeSource.js';
import { makeTemplate } from './fixtures/makeTemplate.js';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { workbookToRawSheets } from '../src/lib/excel/readSource.js';
import { loadExpected, loadProcessedData, fixture, SOURCE_FILES } from './helpers.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const BLOCK_START = [8, 8 + 32, 8 + 64, 8 + 96];

describe('makeSource', () => {
  it('round-trips through readSourceBuffer: header at row 15, 20 rows, day cells sum to N', () => {
    const { buffer, aoa } = makeSource({ rows: 20, headerRow: 15 });
    const { rows, headerRowIndex, meta } = readSourceBuffer(buffer);
    expect(headerRowIndex).toBe(14);
    expect(rows).toHaveLength(20);
    expect(meta.productionMonth).toEqual({ year: 2026, month: 2 });
    for (const r of rows) {
      ['n', 'n1', 'n2', 'n3'].forEach((k, b) => {
        expect(sum(r.rawRow.slice(BLOCK_START[b], BLOCK_START[b] + 31).map(Number)), `${r.partNumber} ${k}`).toBe(r[k]);
      });
    }
    expect(aoa).toHaveLength(15 + 20);
  });

  it('nShift moves colPositions.nCol', () => {
    expect(readSourceBuffer(makeSource({ nShift: 2 }).buffer).rows[0].colPositions.nCol).toBe(41);
    expect(readSourceBuffer(makeSource().buffer).rows[0].colPositions.nCol).toBe(39);
  });

  it('multi-dock part gives two rows and one summary row listing both docks', () => {
    const { rows } = readSourceBuffer(makeSource({ rows: 1, docks: ['D1', 'BN'] }).buffer);
    expect(rows).toHaveLength(2);
    const { summary } = buildSummary({ 'BP Daily': rows });
    expect(summary).toHaveLength(1);
    expect(summary[0].sources.map((s) => s.dockCode).sort()).toEqual(['BN', 'D1']);
    expect(summary[0].n).toBe(rows[0].n + rows[1].n);
  });

  it('skips <EOF> and short part numbers, keeps duplicates, supports .xls', () => {
    const { buffer } = makeSource({ rows: 3, includeEof: true, duplicates: true, format: 'xls' });
    const { rows } = readSourceBuffer(buffer);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.partNumber.length >= 5)).toBe(true);
  });

  it('weekendZero leaves weekend days empty and runoutRows zero out N+2/N+3', () => {
    const { rows } = readSourceBuffer(makeSource({ rows: 4, weekendZero: true, runoutRows: 2 }).buffer);
    expect(rows[0].rawRow[8 + 6]).toBe(0);
    expect(rows.slice(2).every((r) => r.n2 === 0 && r.n3 === 0)).toBe(true);
    expect(rows.slice(0, 2).every((r) => r.n2 > 0)).toBe(true);
  });
});

describe('expected.json matches the committed fixtures', () => {
  it('per-file rows and per-part N..N+3', () => {
    const exp = loadExpected();
    for (const f of SOURCE_FILES) {
      const { rows } = readSourceBuffer(fixture(f));
      expect(rows, f).toHaveLength(exp.files[f].rows);
      for (const r of rows) expect(exp.files[f].parts[`${r.partNumber}|${r.dockCode}`], `${f} ${r.partNumber}`).toEqual([r.n, r.n1, r.n2, r.n3]);
    }
  });

  it('per-sheet totals', async () => {
    const exp = loadExpected();
    const data = await loadProcessedData();
    for (const [sheet, rows] of Object.entries(data)) {
      expect({ rows: rows.length, n: sum(rows.map((r) => r.n)), n1: sum(rows.map((r) => r.n1)), n2: sum(rows.map((r) => r.n2)), n3: sum(rows.map((r) => r.n3)) }, sheet).toEqual(exp.sheetTotals[sheet]);
    }
  });
});

describe('makeTemplate', () => {
  it("format 'xls' makes buildExport fall back and keep Sheet1", async () => {
    const buf = await makeTemplate({ format: 'xls' });
    const raw = workbookToRawSheets(buf);
    const { blob, report } = await buildExport({ template: { buffer: buf, rawSheets: raw.rawSheets }, processedData: await loadProcessedData(), summaryData: [] });
    expect(report.mode).toBe('fallback');
    const { sheetNames } = workbookToRawSheets(await blob.arrayBuffer());
    expect(sheetNames).toContain('Sheet1');
  });
});

describe('check-bundle', () => {
  it('passes on a tidy dist and fails when xlsx/jszip land in the entry chunk', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { checkBundle } = await import('../scripts/check-bundle.mjs');
    const mk = (entryJs) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
      fs.mkdirSync(path.join(dir, 'assets'));
      fs.writeFileSync(path.join(dir, 'index.html'), '<script type="module" crossorigin src="/assets/index-abc.js"></script>');
      fs.writeFileSync(path.join(dir, 'assets', 'index-abc.js'), entryJs);
      fs.writeFileSync(path.join(dir, 'assets', 'xlsx-111.js'), 'x');
      fs.writeFileSync(path.join(dir, 'assets', 'jszip-222.js'), 'x');
      return dir;
    };
    expect(checkBundle(mk('import("./xlsx-111.js")')).errors).toEqual([]);
    expect(checkBundle(mk('import{a}from"./xlsx-111.js";')).errors.join()).toMatch(/xlsx/);
    expect(checkBundle(mk('var z=new JSZip();')).errors.join()).toMatch(/jszip/);
    expect(checkBundle(mk('a'.repeat(2000)), { budget: 1000 }).errors.join()).toMatch(/ใหญ่เกินงบ/);
  });
});
