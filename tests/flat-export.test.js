import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import JSZip from 'jszip';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile, buildExport } from '../src/lib/excel/index.js';
import { zipFiles } from '../src/lib/excel/zipFiles.js';
import { buildSummary } from '../src/lib/excel/aggregate.js';
import { monthKey } from '../src/utils/format.js';
import { LONG_COLUMNS, SUMMARY_COLUMNS, buildLongRows, buildSummaryRows, buildJsonExport } from '../src/features/flat-export/logic.js';
import { toCsv, BOM } from '../src/features/flat-export/serialize.js';
import { BUILTIN_PRESETS, applyPreset, loadSettings, saveSettings, DEFAULT_SETTINGS, presetById } from '../src/features/flat-export/presets.js';
import { validateExport, validateAgainstSchema } from '../src/features/flat-export/schema.js';
import { buildFiles } from '../src/features/flat-export/FlatExportModal.jsx';
import feature from '../src/features/flat-export/index.jsx';

let state;
beforeAll(() => {
  const processedData = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  const sourceFiles = [];
  let pm = null;
  SOURCE_FILES.forEach((f, i) => {
    const name = f.split('/')[1];
    const plant = categorizeFile(name);
    const { rows, meta } = readSourceBuffer(fixture(f));
    rows.forEach((row, idx) => { Object.assign(row, { id: `f${i}-${idx}`, plant, fileName: name }); processedData[`${plant} Daily`].push(row); });
    sourceFiles.push({ id: `f${i}`, name, size: 1000 + i, category: plant, status: 'done', meta });
    pm = pm || meta.productionMonth;
  });
  const { summary } = buildSummary(processedData);
  state = { processedData, summaryData: summary, productionMonth: pm, sourceFiles, monthLabels: ['N', 'N+1', 'N+2', 'N+3'], features: {} };
});

describe('monthKey', () => {
  it('rolls over the year', () => {
    expect(monthKey({ year: 2026, month: 11 }, 3)).toBe('2027-02');
    expect(monthKey(null, 1)).toBe('');
  });
});

describe('buildLongRows', () => {
  it('rows x 4 months x 32 records', () => {
    const rows = buildLongRows(state.processedData, state.productionMonth, { files: state.sourceFiles });
    const n = Object.values(state.processedData).flat().length;
    expect(n).toBe(29);
    expect(rows).toHaveLength(3712);
    const r = rows.find((x) => x.plant === 'BP' && x.part_number === '86790-0K051-00' && x.month_offset === 0 && x.day === 'TOTAL');
    expect(r.qty).toBe(1891);
    expect(r.base_part).toBe('86790-0K051');
    expect(r.horizon).toBe('N');
    expect(rows.find((x) => x.month_offset === 1).month).toBe('2026-03');
    expect(Object.keys(rows[0])).toEqual(expect.arrayContaining(LONG_COLUMNS));
    expect(rows[0].edited).toBe(0);
  });
  it('blank day is "" and a real 0 stays 0; short rawRow is tolerated', () => {
    const holes = { 'BP Daily': [{ partNumber: 'X-1234-00', n: 7, rawRow: Object.assign([], { 8: 7, 10: null, 11: ' ' }), colPositions: { nCol: 39 } }] };
    const hr = buildLongRows(holes, null).filter((r) => r.month_offset === 0);
    expect(hr.find((r) => r.day === 1).qty).toBe(7);
    expect(hr.find((r) => r.day === 3).qty).toBe('');
    expect(hr.find((r) => r.day === 4).qty).toBe('');
    const short = { 'BP Daily': [{ partNumber: 'X-1234-00', n: 5, n1: 0, n2: 0, n3: 0, rawRow: [], colPositions: {} }] };
    const out = buildLongRows(short, null);
    expect(out).toHaveLength(128);
    expect(out.every((r) => r.day === 'TOTAL' || r.qty === '')).toBe(true);
    expect(out.find((r) => r.day === 'TOTAL' && r.month_offset === 0).qty).toBe(5);
    const zero = { 'BP Daily': [{ partNumber: 'X-1234-00', n: 0, rawRow: Object.assign([], { 38: 0 }), colPositions: { nCol: 39 } }] };
    expect(buildLongRows(zero, null).find((r) => r.month_offset === 0 && r.day === 31).qty).toBe(0);
  });
  it('carries edit flags from the row', () => {
    const rows = buildLongRows({ 'BP Daily': [{ partNumber: 'A-12345-00', edited: true, spilled: true }] }, null);
    expect(rows[0]).toMatchObject({ edited: 1, carried_over: 0, spilled: 1 });
  });
});

describe('toCsv', () => {
  it('BOM, CRLF, quoting, raw numbers, formula escaping', () => {
    const csv = toCsv([['a', 'b,c', 'say "hi"'], [1234567.5, '=SUM(1)', 'x\ny'], ['+1', '-2', '@z']]);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('a,"b,c","say ""hi"""');
    expect(csv).toContain("1234567.5,'=SUM(1),\"x\ny\"");
    expect(lines[2]).toBe("'+1,'-2,'@z");
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('honours the delimiter', () => {
    expect(toCsv([['a;b', 'c']], { delimiter: ';', bom: false })).toBe('"a;b";c\r\n');
  });
});

describe('buildSummaryRows', () => {
  it('single header with 11 names and YYYY-MM month columns', () => {
    const aoa = buildSummaryRows(state.summaryData, state.productionMonth);
    expect(aoa[0]).toEqual(SUMMARY_COLUMNS);
    expect(aoa[0]).toHaveLength(11);
    expect(aoa).toHaveLength(16);
    expect(aoa[1].slice(7)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05']);
    expect(aoa[1][6]).toBe(aoa[1][2] + aoa[1][3] + aoa[1][4] + aoa[1][5]);
  });
});

describe('buildJsonExport', () => {
  it('shape, injected clock, daily sums equal n, schema valid', () => {
    const now = () => new Date('2026-01-02T03:04:05.000Z');
    const doc = buildJsonExport(state, { now });
    expect(doc.rows).toHaveLength(29);
    expect(doc.summary).toHaveLength(15);
    expect(doc.files).toHaveLength(5);
    expect(doc.productionMonth).toEqual({ raw: '202602', year: 2026, month: 2 });
    expect(doc.generatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(doc.rows[0].daily[0]).toHaveLength(31);
    const bp0 = doc.rows[0];
    expect(bp0.plant).toBe('BP');
    expect(bp0.daily[0].reduce((s, v) => s + (v ?? 0), 0)).toBe(bp0.n);
    expect(doc.files[0].sha256).toBeNull();
    expect('qa' in doc).toBe(false);
    const schema = JSON.parse(fs.readFileSync('docs/schema/flat-export.schema.json', 'utf8'));
    expect(validateAgainstSchema(JSON.parse(JSON.stringify(doc)), schema, schema)).toEqual([]);
    expect(validateExport(doc)).toEqual({ ok: true, errors: [] });
  });
  it('adds qa / manifestSha256 only when supplied', () => {
    const doc = buildJsonExport(state, { qa: { issues: 0 }, manifestSha256: 'abc' });
    expect(doc.qa).toEqual({ issues: 0 });
    expect(doc.manifestSha256).toBe('abc');
  });
});

describe('schema validator', () => {
  it('rejects schemaVersion 2 with the Thai message and flags a broken doc', () => {
    const res = validateExport({ schemaVersion: 2 });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toBe('ไฟล์นี้สร้างจากเวอร์ชันใหม่กว่า (schema 2) กรุณาอัปเดตแอป');
    const bad = buildJsonExport(state);
    bad.rows[0].daily[0] = [1];
    expect(validateExport(bad).ok).toBe(false);
  });
});

describe('presets', () => {
  const long = () => buildLongRows(state.processedData, state.productionMonth, { files: state.sourceFiles });
  it('standard keeps every column and row', () => {
    const out = applyPreset(long(), presetById('standard'));
    expect(out.header).toEqual(LONG_COLUMNS);
    expect(out.aoa).toHaveLength(3713);
  });
  it('odoo renames, omits and keeps TOTAL only', () => {
    const out = applyPreset(long(), presetById('odoo'));
    expect(out.header).toEqual(['warehouse', 'default_code', 'name', 'date', 'period', 'product_qty']);
    expect(out.aoa).toHaveLength(1 + 29 * 4);
  });
  it('power query drops TOTAL rows and flags', () => {
    const out = applyPreset(long(), presetById('powerquery'));
    expect(out.header).not.toContain('edited');
    expect(out.aoa).toHaveLength(1 + 29 * 4 * 31);
  });
  it('has four built-ins and a custom order/delimiter works', () => {
    expect(BUILTIN_PRESETS.map((p) => p.label)).toEqual(['มาตรฐาน', 'Odoo', 'Google Sheets', 'Power Query']);
    const out = applyPreset(long(), { columns: ['qty', 'plant'], rename: { qty: 'Q' }, delimiter: ';', totalMode: 'all' });
    expect(out.header).toEqual(['Q', 'plant']);
    expect(out.delimiter).toBe(';');
  });
  it('settings fall back when storage throws', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, bad)).toBe(false);
    let saved;
    saveSettings({ preset: 'odoo', zip: true, includeSheet: true }, { setItem: (_, v) => { saved = v; } });
    expect(loadSettings({ getItem: () => saved })).toEqual({ preset: 'odoo', zip: true, includeSheet: true });
  });
});

describe('files and zip', () => {
  it('names use the raw PRODUCTION MONTH; the zip holds the three files', async () => {
    const f = buildFiles(state, presetById('standard'));
    expect([f.long.name, f.wide.name, f.json.name, f.zipName]).toEqual(['forecast_long_202602.csv', 'forecast_summary_202602.csv', 'forecast_202602.json', 'forecast_202602.zip']);
    expect(f.long.content.split('\r\n')[0]).toBe(BOM + LONG_COLUMNS.join(','));
    const zip = await JSZip.loadAsync(await zipFiles([f.long, f.wide, f.json]));
    expect(Object.keys(zip.files).sort()).toEqual([f.json.name, f.long.name, f.wide.name].sort());
    expect(await zip.file(f.wide.name).async('string')).toContain('part_number,plants');
  });
});

describe('feature contract', () => {
  const ctx = (over = {}) => ({ state: { ...state, features: {}, ...over }, actions: { setFeatureData() {} }, monthLabels: state.monthLabels });
  it('header button and modal only with processed rows', () => {
    expect(feature.order).toBe(50);
    expect(feature.headerActions(ctx({ processedData: null }))).toEqual([]);
    expect(feature.headerActions(ctx({ processedData: { 'BP Daily': [] } }))).toEqual([]);
    const [a] = feature.headerActions(ctx());
    expect(a.label).toBe('ส่งออกข้อมูล (CSV/JSON)');
    expect(feature.slots.banner(ctx())).toBeNull();
    expect(feature.slots.banner(ctx({ features: { 'flat-export': { open: true } } }))).not.toBeNull();
  });
  it('no Data (flat) sheet by default; opt-in adds it with the CSV header as row 1', async () => {
    expect(feature.exportSheets(ctx())).toEqual([]);
    const on = ctx({ features: { 'flat-export': { settings: { preset: 'standard', zip: false, includeSheet: true } } } });
    const sheets = feature.exportSheets(on);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('Data (flat)');
    expect(sheets[0].aoa[0]).toEqual(LONG_COLUMNS);
    const tpl = fixture('template.xlsx');
    const res = await buildExport({ template: { kind: 'xlsx', buffer: tpl }, processedData: state.processedData, summaryData: state.summaryData, extraSheets: sheets });
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(await res.blob.arrayBuffer()), { type: 'array' });
    expect(wb.SheetNames).toContain('Data (flat)');
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['BP Daily', 'Summary', 'Analyze']));
    const plain = await buildExport({ template: { kind: 'xlsx', buffer: tpl }, processedData: state.processedData, summaryData: state.summaryData, extraSheets: feature.exportSheets(ctx()) });
    const wb2 = XLSX.read(new Uint8Array(await plain.blob.arrayBuffer()), { type: 'array' });
    expect(wb2.SheetNames).not.toContain('Data (flat)');
  });
});
