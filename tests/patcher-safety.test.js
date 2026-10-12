import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/readSource.js';
import { buildAnalyzeRows } from '../src/lib/excel/aggregate.js';
import { patchTemplate, patchSheetXml, parseSheet, StyleRegistry, upsertSheet, listSheets } from '../src/lib/excel/templatePatcher.js';
import { resolveSheetName, isProtected } from '../src/lib/excel/sheetNames.js';
import { summarizeSafety } from '../src/features/patcher-safety/logic.js';
import { fixture, SOURCE_FILES } from './helpers.js';

const load = () => {
  const d = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  for (const f of SOURCE_FILES) d[`${categorizeFile(f.split('/').pop())} Daily`].push(...readSourceBuffer(fixture(f)).rows);
  return d;
};
const sheetXml = async (zip, n) => zip.file(`xl/worksheets/sheet${n}.xml`).async('string');
const cell = (xml, ref) => xml.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`))?.[0];
const rowXml = (xml, r) => xml.match(new RegExp(`<row r="${r}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`))?.[0];

let template, original, data;
beforeAll(async () => {
  template = fixture('template.xlsx');
  original = await JSZip.loadAsync(template);
  data = load();
});
const withSr = (n) => {
  const sr = data['SR Daily'];
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ ...sr[i % sr.length], partNumber: `SR-${i + 1}`, rawRow: [`SR-${i + 1}`, ...sr[i % sr.length].rawRow.slice(1)] });
  return { ...data, 'SR Daily': rows };
};

describe('formula-row guard', () => {
  it('patchSheetXml stops above a formula row and leaves it untouched', () => {
    const row = (r, inner) => `<row r="${r}">${inner}</row>`;
    let body = '';
    for (let r = 1; r <= 4; r++) body += row(r, `<c r="A${r}"><v>0</v></c>`);
    body += row(5, '<c r="A5"><f>SUM(A1:A4)</f><v>0</v></c><c r="B5"><v>7</v></c>');
    const xml = `<worksheet><dimension ref="A1:B5"/><sheetData>${body}</sheetData></worksheet>`;
    const dataRows = Array.from({ length: 6 }, (_, i) => new Map([[1, `p${i}`]]));
    const res = patchSheetXml(xml, parseSheet(xml), { startRow: 1, dataRows, clearThroughRow: 5, styles: null, highlight: false, zone: { min: 1, max: 2 } });
    expect(res.blocked).toHaveLength(1);
    expect(res.blocked[0].dropped).toBe(2);
    expect(res.capacity).toBe(4);
    expect(rowXml(res.xml, 5)).toBe(row(5, '<c r="A5"><f>SUM(A1:A4)</f><v>0</v></c><c r="B5"><v>7</v></c>'));
    expect(res.xml).toContain('t="inlineStr"><is><t>p3</t>');
    expect(res.xml).not.toContain('p4');
  });

  it('writes 6 of 8 SR rows, keeps formulas and reports the overflow', async () => {
    const { buffer, report } = await patchTemplate(template, { processedData: withSr(8), analyzeRows: [] });
    const x = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const ws = x.Sheets['SR Daily'];
    expect(ws.A19.v).toBe('SR-6');
    expect(ws.A20).toBeUndefined();
    expect(ws.A21).toBeUndefined();
    expect(ws.AN20.f).toBeDefined();
    expect(ws.AN21.f).toBeDefined();
    expect(report.overflow[0]).toEqual({ sheet: 'SR Daily', rows: 8, capacity: 6, dropped: ['SR-7', 'SR-8'] });
    expect(report.warnings.some((w) => /SR Daily.*8.*6/.test(w))).toBe(true);
    expect(report.errors).toBeUndefined();
  });

  it('leaves rows at/below the first formula row byte-identical', async () => {
    const { buffer } = await patchTemplate(template, { processedData: { ...withSr(8) }, analyzeRows: [] });
    const zip = await JSZip.loadAsync(buffer);
    for (const [n, rows] of [[7, [20, 21, 22]], [5, [39, 40, 41, 42, 43, 44]], [4, [26]]]) {
      const a = await sheetXml(original, n);
      const b = await sheetXml(zip, n);
      for (const r of rows) expect(rowXml(b, r), `sheet${n} row ${r}`).toBe(rowXml(a, r));
    }
  });

  it("overflow:'spill' writes the surplus to a values-only sheet", async () => {
    const pd = withSr(8);
    const { buffer, report } = await patchTemplate(template, { processedData: pd, analyzeRows: buildAnalyzeRows(pd), overflow: 'spill' });
    const x = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sp = x.Sheets['SR Daily (เกิน)'];
    expect(sp.A1.v).toBe('PART NUMBER');
    expect(sp.A2.v).toBe('SR-7');
    expect(sp.A3.v).toBe('SR-8');
    expect(sp.A4).toBeUndefined();
    expect(report.patched.find((p) => p.sheet === 'SR Daily').spilled).toBe(2);
    expect(x.Sheets['Analyze'].EH3.v).toBeDefined();
    const analyzeRows = x.Sheets['Analyze'];
    const plants = Object.keys(analyzeRows).filter((k) => /^EH\d+$/.test(k) && analyzeRows[k].v === 'SR');
    expect(plants).toHaveLength(8);
  });
});

describe('writable zone', () => {
  it('preserves side columns and reports them; clearBeyondTable restores the old clearing', async () => {
    const { buffer, report } = await patchTemplate(template, { processedData: data, analyzeRows: buildAnalyzeRows(data) });
    const x = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    expect(x.Sheets['GW Daily'].EH14.v).toBe('86790-BZ270-00');
    expect(x.Sheets['GW Daily'].EI14.f).toBeDefined();
    const o = XLSX.read(new Uint8Array(template), { type: 'array' });
    expect(x.Sheets['BP Daily'].EJ14.v).toEqual(o.Sheets['BP Daily'].EJ14.v);
    expect(x.Sheets['BP Daily'].EI14.v).toEqual(o.Sheets['BP Daily'].EI14.v);
    expect(x.Sheets['BPK Daily'].EK16?.v).toEqual(o.Sheets['BPK Daily'].EK16?.v);
    expect(x.Sheets['BPK Daily'].EM16?.v).toEqual(o.Sheets['BPK Daily'].EM16?.v);
    for (const r of [22, 23, 24, 25]) expect(x.Sheets['BP Daily'][`A${r}`]).toBeUndefined();
    const bp = report.patched.find((p) => p.sheet === 'BP Daily');
    expect(bp.preservedCols).toBe('EG:EL');
    expect(bp.preservedValues.count).toBeGreaterThan(0);

    const old = await patchTemplate(template, { processedData: data, analyzeRows: [], clearBeyondTable: true });
    const y = XLSX.read(new Uint8Array(old.buffer), { type: 'array' });
    expect(y.Sheets['GW Daily'].EH14).toBeUndefined();
  });
});

describe('protected sheet names', () => {
  const sheets = ['Summary', 'Sheet2', 'QA Report', 'BP Daily'];
  it('classifies names', () => {
    expect(isProtected('Sheet2', sheets)).toBe(true);
    expect(isProtected('sheet2', sheets)).toBe(true);
    expect(isProtected('QA Report', sheets)).toBe(false);
    expect(isProtected('Brand New', sheets)).toBe(false);
  });
  it('refuses duplicates and numbers truncation collisions', () => {
    const used = new Map();
    expect(resolveSheetName('README', { templateSheets: sheets, used })).toEqual({ name: 'README' });
    expect(resolveSheetName('README', { templateSheets: sheets, used })).toEqual({ skipped: 'duplicate', name: 'README' });
    const a = 'A very long sheet name for the first one';
    const b = 'A very long sheet name for the second';
    expect(resolveSheetName(a, { templateSheets: sheets, used }).name).toBe('A very long sheet name for the');
    expect(resolveSheetName(b, { templateSheets: sheets, used }).name).toBe('A very long sheet name for (2)');
  });
  it('replaces an existing app sheet and refuses a duplicate in patchTemplate', async () => {
    const first = await patchTemplate(template, { processedData: {}, extraSheets: [{ name: 'QA Report', aoa: [['x']] }] });
    const second = await patchTemplate(first.buffer, {
      processedData: {},
      extraSheets: [{ name: 'QA Report', aoa: [['y']] }, { name: 'README', aoa: [['1']] }, { name: 'README', aoa: [['2']] }],
    });
    expect(second.report.skippedSheets).toEqual([{ name: 'README', reason: 'duplicate' }]);
    const x = XLSX.read(new Uint8Array(second.buffer), { type: 'array' });
    expect(x.Sheets['QA Report'].A1.v).toBe('y');
    expect(x.Sheets['README'].A1.v).toBe('1');
    expect(x.SheetNames.filter((n) => n === 'QA Report')).toHaveLength(1);
  });
  it('upsertSheet refuses a protected sheet directly', async () => {
    const zip = await JSZip.loadAsync(template);
    const res = await upsertSheet(zip, 'Summary', [['x']]);
    expect(res.skipped).toBe('protected');
  });
});

describe('cellWrites', () => {
  it('keeps number formats, skips formulas and preserves the target type', async () => {
    const { buffer, report } = await patchTemplate(template, {
      processedData: {},
      cellWrites: [
        { sheet: 'By Plant', ref: 'C2', value: new Date(Date.UTC(2026, 0, 23)) },
        { sheet: 'By Plant', ref: 'C3', value: "Mar'26" },
        { sheet: 'Summary', ref: 'B3', value: 'nope' },
        { sheet: "Monthly FC (Don't use)", ref: 'I1', value: 'nope' },
        { sheet: 'BPK Daily', ref: 'B4', value: '202602' },
        { sheet: 'GW Daily', ref: 'B4', value: '202602' },
        { sheet: 'Missing', ref: 'A1', value: 1 },
      ],
    });
    const zip = await JSZip.loadAsync(buffer);
    const byPlant = await sheetXml(zip, 2);
    expect(cell(byPlant, 'C2')).toBe('<c r="C2" s="183"><v>46045</v></c>');
    expect(cell(byPlant, 'C3')).toBe(`<c r="C3" s="184" t="inlineStr"><is><t>Mar'26</t></is></c>`);
    expect(cell(await sheetXml(zip, 5), 'B4')).toBe('<c r="B4" s="133" t="inlineStr"><is><t>202602</t></is></c>');
    expect(cell(await sheetXml(zip, 6), 'B4')).toBe('<c r="B4" s="202"><v>202602</v></c>');
    const status = Object.fromEntries(report.cellWrites.map((w) => [`${w.sheet}!${w.ref}`, w.status]));
    expect(status['Summary!B3']).toBe('skipped-formula');
    expect(status["Monthly FC (Don't use)!I1"]).toBe('skipped-formula');
    expect(status['Missing!A1']).toBe('skipped-sheet');
    expect(status['By Plant!C2']).toBe('written');
    expect(report.cellWrites.find((w) => w.ref === 'C3')).toMatchObject({ before: "Feb'26", after: "Mar'26" });
    // formula cell untouched
    expect(await sheetXml(zip, 1)).toBe(await sheetXml(original, 1));
    expect(await sheetXml(zip, 3)).toBe(await sheetXml(original, 3));
  });
});

describe('typed cells and number formats', () => {
  const baseStyles = '<styleSheet><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
  it('withNumFmt caches and only accepts built-in ids', () => {
    const reg = new StyleRegistry(baseStyles);
    const a = reg.withNumFmt(0, 15);
    expect(reg.withNumFmt(0, 15)).toBe(a);
    expect(reg.commit()).toContain('<cellXfs count="2">');
    expect(reg.commit()).toContain('numFmtId="15"');
    expect(() => reg.withNumFmt(0, 200)).toThrow();
  });
  it('writes Date and typed ints', async () => {
    const zip = await JSZip.loadAsync(template);
    const styles = new StyleRegistry(await zip.file('xl/styles.xml').async('string'));
    await upsertSheet(zip, 'Notes', [[new Date(Date.UTC(2026, 0, 23)), { v: '880', t: 'int' }, { v: '007', t: 'text' }]], { styles });
    zip.file('xl/styles.xml', styles.commit());
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const x = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
    expect(x.Sheets.Notes.A1.w).toBe('23-Jan-26');
    const z2 = await JSZip.loadAsync(buf);
    const sheets = await listSheets(z2);
    const xml = await z2.file(sheets.find((s) => s.name === 'Notes').path).async('string');
    expect(cell(xml, 'B1')).toMatch(/<v>880<\/v>/);
    expect(cell(xml, 'B1')).not.toContain('inlineStr');
    expect(cell(xml, 'C1')).toContain('<t>007</t>');
  });
});

describe('autoFilter', () => {
  it('adds a filter to GW Daily in schema order, with a _FilterDatabase name', async () => {
    const { buffer, report } = await patchTemplate(template, { processedData: data, analyzeRows: [] });
    const zip = await JSZip.loadAsync(buffer);
    const xml = await sheetXml(zip, 6);
    expect(xml).toContain('<autoFilter ref="A13:EF18"/>');
    expect(xml.indexOf('</sheetData><autoFilter')).toBeGreaterThan(0);
    expect(xml.indexOf('<autoFilter')).toBeLessThan(xml.indexOf('<pageMargins'));
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toContain(`<definedName name="_xlnm._FilterDatabase" localSheetId="5" hidden="1">'GW Daily'!$A$13:$EF$18</definedName>`);
    expect(report.patched.find((p) => p.sheet === 'GW Daily').autoFilter).toBe('added');
    expect(report.patched.find((p) => p.sheet === 'BP Daily').autoFilter).toBe('extended');
    expect(await sheetXml(zip, 4)).toContain('<autoFilter ref="A13:EF21"');
  });
  it('places the filter before legacyDrawing/conditionalFormatting and honours the off switch', async () => {
    const xml = '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><conditionalFormatting sqref="A1"/><pageMargins/><legacyDrawing r:id="rId1"/></worksheet>';
    const res = patchSheetXml(xml, parseSheet(xml), { startRow: 1, dataRows: [new Map([[1, 1]])], clearThroughRow: 1, styles: null, highlight: false, zone: { min: 1, max: 3 }, autoFilter: { headerRow: 1, lastCol: 3 } });
    expect(res.xml).toContain('</sheetData><autoFilter ref="A1:C1"/><conditionalFormatting');
    const off = await patchTemplate(template, { processedData: data, analyzeRows: [], addAutoFilter: false });
    expect(await sheetXml(await JSZip.loadAsync(off.buffer), 6)).not.toContain('<autoFilter');
  });
});

describe('summarizeSafety', () => {
  it('summarises a clean report as ok', () => {
    expect(summarizeSafety({ patched: [], overflow: [], skippedSheets: [], cellWrites: [] }).ok).toBe(true);
    expect(summarizeSafety({ overflow: [{ sheet: 'x', dropped: ['a'] }] }).droppedRows).toBe(1);
  });
});
