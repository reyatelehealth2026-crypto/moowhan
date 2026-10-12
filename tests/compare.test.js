import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import feature from '../src/features/compare/index.jsx';
import { alignMonths, compare, summarize, filterRows, compareToAoa, COMPARE_HEADERS, rowsFromProcessed } from '../src/features/compare/compare.js';
import { readPrevious, readPreviousWorkbook, loadForecastJson, baselineToJson, baselineFromProcessed, parseMonYY } from '../src/features/compare/readPrevious.js';
import { tagRows } from '../src/features/compare/tagRows.js';
import { readSourceBuffer } from '../src/lib/excel/index.js';
import { categorizeFile } from '../src/lib/excel/categorize.js';
import { dailySheetName } from '../src/constants.js';
import { fixture, SOURCE_FILES } from './helpers.js';

// current round = the five real TMT fixtures
const processed = {};
SOURCE_FILES.forEach((f) => {
  const plant = categorizeFile(f.split('/').pop());
  const { rows } = readSourceBuffer(fixture(f));
  (processed[dailySheetName(plant)] ||= []).push(...rows.map((r) => ({ ...r, plant })));
});
const currRows = rowsFromProcessed(processed);
const FEB26 = { year: 2026, month: 2 };

describe('alignMonths', () => {
  it('shift 1 pairs prev N+1 with curr N', () => {
    const a = alignMonths({ year: 2026, month: 1 }, FEB26);
    expect(a.mode).toBe('shift');
    expect(a.shift).toBe(1);
    expect(a.pairs[0]).toMatchObject({ prevKey: 'n1', currKey: 'n' });
    expect(a.pairs).toHaveLength(3);
    expect(a.sentence).toBe("เทียบ Feb'26 (รอบก่อน N+1) กับ Feb'26 (รอบนี้ N) และอีก 2 เดือน");
  });
  it('same month is a revision', () => {
    const a = alignMonths(FEB26, FEB26);
    expect(a.mode).toBe('revision');
    expect(a.pairs).toHaveLength(4);
    expect(a.sentence).toContain('รอบเดียวกัน (revision)');
  });
  it('no overlap gives no pairs and a warning', () => {
    const a = alignMonths({ year: 2025, month: 6 }, FEB26);
    expect(a.pairs).toEqual([]);
    expect(a.warning).toContain('ไม่ซ้อนกัน');
  });
  it('positional is only used when asked, and warns', () => {
    const a = alignMonths({ year: 2025, month: 6 }, FEB26, { positional: true });
    expect(a.mode).toBe('positional');
    expect(a.warning).toContain('ไม่แนะนำ');
  });
  it('unconfirmed previous month does not align', () => {
    expect(alignMonths(null, FEB26).pairs).toEqual([]);
  });
});

describe('compare()', () => {
  const row = (part, dock, n, n1 = 0, plant = 'BP') => ({ plant, part, dock, n, n1, n2: 0, n3: 0 });
  it('same / changed / new / missing and pct null on base 0', () => {
    const prev = [row('A', 'D', 100), row('B', 'D', 50), row('Z', 'D', 10), row('E', 'D', 0)];
    const curr = [row('A', 'D', 100), row('B', 'D', 60), row('C', 'D', 5), row('E', 'D', 7)];
    const rows = compare(prev, curr, 0).filter((r) => r.monthIdx === 0);
    const by = Object.fromEntries(rows.map((r) => [r.part, r]));
    expect(by.A.status).toBe('same');
    expect(by.B).toMatchObject({ status: 'changed', diff: 10, pct: 20 });
    expect(by.C).toMatchObject({ status: 'new', pct: null });
    expect(by.Z).toMatchObject({ status: 'missing', curr: 0, diff: -10 });
    expect(by.E).toMatchObject({ status: 'new', pct: null });
    rows.forEach((r) => expect(Number.isFinite(r.pct ?? 0)).toBe(true));
  });
  it('level part sums docks before comparing', () => {
    const prev = [row('A', 'D1', 10), row('A', 'D2', 20)];
    const curr = [row('A', 'D1', 25), row('A', 'D2', 5)];
    expect(compare(prev, curr, 0, { level: 'dock' }).filter((r) => r.monthIdx === 0).map((r) => r.status)).toEqual(['changed', 'changed']);
    const part = compare(prev, curr, 0, { level: 'part' }).filter((r) => r.monthIdx === 0);
    expect(part).toHaveLength(1);
    expect(part[0]).toMatchObject({ prev: 30, curr: 30, status: 'same', dock: '' });
  });
  it('returns [] when months do not overlap', () => {
    expect(compare([row('A', 'D', 1)], [row('A', 'D', 1)], 5)).toEqual([]);
  });
});

describe('download.xlsx as previous round', () => {
  it('reads 42 rows and never uses Daily B4 as the month', async () => {
    const b = await readPrevious(fixture('input/download.xlsx'), { name: 'download.xlsx' });
    expect(b.rows).toHaveLength(42);
    const count = (p) => b.rows.filter((r) => r.plant === p).length;
    expect([count('BP'), count('BPK'), count('GW'), count('SR')]).toEqual([12, 16, 8, 6]);
    expect(b.month).toBeNull();
    expect(b.confidence).toBe('low');
    expect(b.monthCandidates.map((c) => c.value)).toContainEqual({ year: 2025, month: 12 });
    expect(b.monthCandidates.map((c) => c.source).join()).not.toMatch(/Daily/);
  });
  it('same round vs current fixtures: 29 same, 13 missing, 0 new', async () => {
    const b = await readPreviousWorkbook(fixture('input/download.xlsx'));
    const rows = compare(b.rows, currRows, 0, { currMonth: FEB26 });
    const s = summarize(rows, { shift: 0 });
    expect(s).toMatchObject({ same: 29, missing: 13, new: 0, changed: 0, keys: 42 });
  });
  it('rejects a workbook without Daily sheets, naming them', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Other');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    await expect(readPreviousWorkbook(buf)).rejects.toThrow('BP Daily');
  });
});

describe('shifted synthetic baseline', () => {
  it('matches prev.n1 with curr.n, diff -24 and -3.4%', () => {
    const p = [{ plant: 'BP', part: 'X', dock: 'D', n: 5, n1: 706, n2: 0, n3: 0 }];
    const c = [{ plant: 'BP', part: 'X', dock: 'D', n: 682, n1: 0, n2: 0, n3: 0 }];
    const rows = compare(p, c, 1, { currMonth: FEB26 });
    const first = rows.find((r) => r.monthIdx === 0);
    expect(first).toMatchObject({ prev: 706, curr: 682, diff: -24, month: "Feb'26" });
    expect(first.pct).toBeCloseTo(-3.4, 1);
    const zero = compare([{ ...p[0], n1: 0 }], c, 1).find((r) => r.monthIdx === 0);
    expect(zero).toMatchObject({ status: 'new', pct: null });
  });
  it('firm changed counts prev N+1 vs curr N only for shift 1', () => {
    const p = [{ plant: 'BP', part: 'X', dock: 'D', n: 0, n1: 10, n2: 0, n3: 0 }];
    const c = [{ plant: 'BP', part: 'X', dock: 'D', n: 12, n1: 0, n2: 0, n3: 0 }];
    expect(summarize(compare(p, c, 1), { shift: 1 }).firmChanged).toBe(1);
    expect(summarize(compare(p, c, 0), { shift: 0 }).firmChanged).toBeNull();
  });
});

describe('filterRows / compareToAoa', () => {
  const mk = (part, prev, curr, status) => ({ key: part, plant: 'BP', part, dock: 'D', month: 'N', monthIdx: 0, prev, curr, diff: curr - prev, pct: prev ? ((curr - prev) / prev) * 100 : null, status });
  const rows = [mk('small', 100, 105, 'changed'), mk('pct-only', 10, 30, 'changed'), mk('big', 1000, 1300, 'changed'), mk('gone', 40, 0, 'missing'), mk('same', 5, 5, 'same'), mk('huge', 5000, 6000, 'changed')];
  it('applies 10% / 50 pcs, keeps new/missing, sorts by |diff|', () => {
    const out = filterRows(rows, { pct: 10, minPcs: 50 });
    expect(out.map((r) => r.part)).toEqual(['huge', 'big', 'gone']);
    expect(out.map((r) => r.part)).not.toContain('small');
    expect(out.map((r) => r.part)).not.toContain('pct-only');
    expect(out.map((r) => Math.abs(r.diff))).toEqual([...out.map((r) => Math.abs(r.diff))].sort((a, b) => b - a));
  });
  it('compareToAoa header', () => {
    const aoa = compareToAoa(filterRows(rows));
    expect(aoa[0]).toEqual(['Part', 'Plant', 'Dock', 'Month', 'Previous', 'Current', 'Diff', 'Diff%', 'Status']);
    expect(aoa[0]).toEqual(COMPARE_HEADERS);
    expect(aoa[1]).toHaveLength(9);
  });
});

describe('tagRows', () => {
  it('BP Daily in the template vs fixtures: 8 unchanged, 4 removed', async () => {
    const tpl = await readPreviousWorkbook(fixture('template.xlsx'), { label: 'เทมเพลต', source: 'template' });
    const bp = tpl.rows.filter((r) => r.plant === 'BP');
    const cur = currRows.filter((r) => r.plant === 'BP');
    const t = tagRows(bp, cur);
    expect(t.counts).toMatchObject({ unchanged: 8, removed: 4, new: 0, changed: 0 });
    expect(t.removed).toHaveLength(4);
  });
  it('new / changed with changedCells', () => {
    const t = tagRows([{ part: 'A', dock: 'D', n: 1, n1: 2, n2: 3, n3: 4 }], [{ part: 'A', dock: 'D', n: 1, n1: 9, n2: 3, n3: 4 }, { part: 'B', dock: 'D', n: 1, n1: 1, n2: 1, n3: 1 }]);
    expect(t.rows[0]).toMatchObject({ tag: 'changed', changedCells: ['n1'] });
    expect(t.rows[1].tag).toBe('new');
  });
});

describe('JSON baseline', () => {
  it('round-trips', () => {
    const b = baselineFromProcessed(processed, { month: FEB26 });
    const back = loadForecastJson(baselineToJson(b));
    expect(back.rows).toEqual(b.rows);
    expect(back.month).toEqual(FEB26);
    expect(back.source).toBe('json');
  });
  it('rejects other schema versions in Thai', () => {
    const bad = JSON.stringify({ kind: 'moowhan-forecast-baseline', schemaVersion: 99, rows: [{ plant: 'BP', part: 'A' }] });
    expect(() => loadForecastJson(bad)).toThrow('เวอร์ชัน 99');
    expect(() => loadForecastJson('not json')).toThrow('JSON');
    expect(() => loadForecastJson('{"a":1}')).toThrow('baseline');
  });
  it('parseMonYY', () => {
    expect(parseMonYY("Production Month:Dec'25")).toEqual({ year: 2025, month: 12 });
    expect(parseMonYY('nothing')).toBeNull();
  });
});

describe('static imports', () => {
  it('feature files never import xlsx/jszip statically', () => {
    for (const f of ['compare.js', 'readPrevious.js', 'tagRows.js']) {
      expect(fs.readFileSync(`src/features/compare/${f}`, 'utf8')).not.toMatch(/^import .*['"](xlsx|jszip)['"]/m);
    }
  });
});

describe('exportSheets "FC Compare"', () => {
  const ctxWith = async (exportCompare) => {
    const baseline = await readPreviousWorkbook(fixture('input/download.xlsx'));
    return { state: { processedData: processed, productionMonth: FEB26, features: { compare: { baseline, confirmedMonth: FEB26, exportCompare } } } };
  };
  it('is opt-in and needs a confirmed month', async () => {
    expect(feature.exportSheets(await ctxWith(false))).toEqual([]);
    const ctx = await ctxWith(true);
    ctx.state.features.compare.confirmedMonth = null;
    expect(feature.exportSheets(ctx)).toEqual([]);
  });
  it('adds the sheet to the template without losing pivots', async () => {
    const sheets = feature.exportSheets(await ctxWith(true));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('FC Compare');
    expect(sheets[0].aoa[0]).toEqual(COMPARE_HEADERS);
    const body = sheets[0].aoa.slice(1);
    expect(body.every((r) => r[8] === 'หายไป')).toBe(true); // only the 13 missing keys pass the threshold
    expect(new Set(body.map((r) => `${r[1]}|${r[0]}|${r[2]}`)).size).toBe(13);
    const { buffer } = await patchTemplate(fixture('template.xlsx'), { processedData: processed, extraSheets: sheets });
    const zip = await JSZip.loadAsync(buffer);
    const orig = await JSZip.loadAsync(fixture('template.xlsx'));
    const pivots = (z) => Object.keys(z.files).filter((f) => f.startsWith('xl/pivot')).sort();
    expect(pivots(zip)).toEqual(pivots(orig));
    expect(pivots(zip).length).toBeGreaterThan(0);
    const x = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    expect(x.SheetNames).toContain('FC Compare');
    expect(x.Sheets['FC Compare'].A1.v).toBe('Part');
  });
  it('validate() reports missing parts as info', async () => {
    const issues = feature.validate(await ctxWith(false));
    expect(issues.find((i) => i.code === 'compare-missing').level).toBe('info');
  });
});
