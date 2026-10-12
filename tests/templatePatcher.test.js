import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/readSource.js';
import { buildSummary, buildAnalyzeRows } from '../src/lib/excel/aggregate.js';
import { patchTemplate, listSheetNames, StyleRegistry, patchSheetXml, parseSheet } from '../src/lib/excel/templatePatcher.js';
import { buildExport, isZipBuffer } from '../src/lib/excel/exportWorkbook.js';
import { readTemplateBuffer } from '../src/lib/excel/templateInfo.js';
import { fixture, SOURCE_FILES } from './helpers.js';

const loadProcessed = () => {
  const processedData = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  for (const file of SOURCE_FILES) {
    const plant = categorizeFile(file.split('/').pop());
    processedData[`${plant} Daily`].push(...readSourceBuffer(fixture(file)).rows);
  }
  return processedData;
};

const countFiles = (zip, re) => Object.keys(zip.files).filter((p) => re.test(p)).length;

describe('patchTemplate (real template + real source files)', () => {
  let out, report, zip, original, processedData, analyzeRows, wbX;

  beforeAll(async () => {
    processedData = loadProcessed();
    analyzeRows = buildAnalyzeRows(processedData);
    const template = fixture('template.xlsx');
    original = await JSZip.loadAsync(template);
    ({ buffer: out, report } = await patchTemplate(template, { processedData, analyzeRows }));
    zip = await JSZip.loadAsync(out);
    wbX = XLSX.read(new Uint8Array(out), { type: 'array' });
  });

  it('keeps every workbook part (pivots, caches, comments, drawings, calcChain)', () => {
    for (const re of [/pivotCache\/pivotCacheDefinition/, /pivotTables\/pivotTable\d+\.xml$/, /comments\d+\.xml$/, /vmlDrawing/, /calcChain/, /theme/]) {
      expect(countFiles(zip, re), String(re)).toBe(countFiles(original, re));
    }
    expect(countFiles(zip, /pivotTables\/pivotTable\d+\.xml$/)).toBe(4);
    expect(Object.keys(zip.files).sort()).toEqual(Object.keys(original.files).sort());
  });

  it('reports what was patched', () => {
    expect(report.skipped).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.patched.map((p) => [p.sheet, p.rows, p.startRow])).toEqual([
      ['BP Daily', 8, 14], ['BPK Daily', 12, 14], ['GW Daily', 5, 14], ['SR Daily', 4, 14], ['Analyze', 29, 3],
    ]);
    expect(report.patched.at(-1).plantCol).toBe('EH');
  });

  it('writes the source rows 1:1 into the daily sheets', () => {
    const ws = wbX.Sheets['BP Daily'];
    expect(ws.A14.v).toBe('86790-0K051-00');
    expect(ws.H14.v).toBe(25);
    expect(ws.AN14.v).toBe(1891);      // N
    expect(ws.BT14.v).toBe(1677);      // N+1
    expect(ws.CZ14.v).toBe(919);       // N+2
    expect(ws.EF14.v).toBe(0);         // N+3
    expect(ws.A21.v).toBe(readSourceBuffer(fixture('input/BP veh 481D.xls')).rows[7].partNumber);
    expect(ws.A22).toBeUndefined();    // old row 22 cleared
    expect(ws.A25).toBeUndefined();
    // totals formula row untouched
    expect(ws.AN26.f).toBeDefined();
    // GW gets both GW files (2 + 3 rows)
    const gw = wbX.Sheets['GW Daily'];
    expect(gw.A17.v).toBe('86790-BZ220-00');
    expect(gw.A18.v).toBe('86790-BZ350-00');
    expect(gw.A19).toBeUndefined();
  });

  it('fills Analyze with plant in EH and keeps the key formulas', async () => {
    const ws = wbX.Sheets['Analyze'];
    expect(ws.B3.v).toBe(analyzeRows[0].partNumber);
    expect(ws.EH3.v).toBe('BP');
    expect(ws.EH31.v).toBe('SR');
    expect(ws.B32).toBeUndefined();   // cleared old data
    expect(ws.EH49).toBeUndefined();
    expect(ws.A3.f).toContain('EI3&EH3&EM3');
    expect(ws.EI3.f).toBe('LEFT(B3,11)');
    expect(ws.A40.f).toBeDefined();   // formulas past the data survive
    // pivot output area below the table is untouched
    expect(ws.B62.v).toBe('Row Labels');
  });

  it('extends ranges and sets recalc/refresh flags', async () => {
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"/);
    expect(wb).toContain(`'BPK Daily'!$A$13:$EG$39`); // 12 rows -> row 25 < 39, unchanged
    expect(wb).toContain(`'SR Daily'!$A$13:$EF$17`);  // was $EF$13, now covers 4 rows
    const defs = Object.keys(zip.files).filter((p) => /pivotCacheDefinition\d+\.xml$/.test(p));
    for (const p of defs) {
      expect(await zip.file(p).async('string')).toMatch(/<pivotCacheDefinition[^>]*refreshOnLoad="1"/);
    }
    const sheet4 = await zip.file('xl/worksheets/sheet4.xml').async('string');
    expect(sheet4).toContain('<autoFilter ref="A13:EF21"');
    expect(sheet4).toContain('<dimension ref="A1:EL26"/>');
  });

  it('adds highlight styles instead of mutating existing ones', async () => {
    const before = await original.file('xl/styles.xml').async('string');
    const after = await zip.file('xl/styles.xml').async('string');
    expect(before).toMatch(/<cellXfs count="292">/);
    expect(Number(after.match(/<cellXfs count="(\d+)">/)[1])).toBeGreaterThan(292);
    // existing xf entries are untouched: the old list is a prefix of the new one
    const body = (xml) => xml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/)[1];
    expect(body(after).startsWith(body(before))).toBe(true);
    expect(after).toMatch(/<fills count="31">/);
    expect(after).toMatch(/<borders count="35">/);
    expect(after).toContain('rgb="FFE6F7FF"');
  });

  it('is a workbook ExcelJS can open, with pivots and formulas intact', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out);
    expect(wb.worksheets.map((w) => w.name)).toHaveLength(11);
    const bp = wb.getWorksheet('BP Daily');
    expect(bp.getCell('A14').value).toBe('86790-0K051-00');
    expect(bp.getCell('AN14').value).toBe(1891);
    expect(bp.getCell('AN14').fill?.fgColor?.argb).toBe('FFE6F7FF');
    expect(bp.getCell('AN26').value?.formula ?? bp.getCell('AN26').value?.sharedFormula).toBeTruthy();
  });

  it('round-trips through the exporter', async () => {
    const { summary } = buildSummary(processedData);
    const template = await readTemplateBuffer(fixture('template.xlsx'));
    expect(template.kind).toBe('xlsx');
    expect(template.sheets).toContain('Analyze');
    const res = await buildExport({ template, processedData, summaryData: summary });
    expect(res.report.mode).toBe('template');
    expect(res.fileName).toMatch(/^Production_Updated_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(res.blob.size).toBeGreaterThan(100000);
    expect(isZipBuffer(await res.blob.arrayBuffer())).toBe(true);
  });

  it('falls back to a fresh workbook without a template', async () => {
    const { summary } = buildSummary(processedData);
    const res = await buildExport({ template: null, processedData, summaryData: summary });
    expect(res.report.mode).toBe('fallback');
    const wb = XLSX.read(new Uint8Array(await res.blob.arrayBuffer()), { type: 'array' });
    expect(wb.SheetNames).toEqual(['BP Daily', 'BPK Daily', 'GW Daily', 'SR Daily', 'Summary', 'Analyze']);
    expect(wb.Sheets['Summary'].A2.v).toBe(summary[0].partNumber);
    expect(wb.Sheets['Analyze'].A1.v).toBe('BP');
  });
});

describe('patchSheetXml edge cases', () => {
  const styles = () => new StyleRegistry('<styleSheet><fills count="2"><fill/><fill/></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>');

  it('creates rows, escapes strings, keeps formulas and clears leftovers', () => {
    const xml = '<worksheet><dimension ref="A1:C3"/><sheetData><row r="1" spans="1:3"><c r="A1" s="1"><v>1</v></c><c r="B1" t="s"><v>0</v></c><c r="C1"><f>A1*2</f><v>2</v></c></row><row r="3"><c r="A3"><v>9</v></c></row></sheetData><autoFilter ref="A1:C1"/></worksheet>';
    const parsed = parseSheet(xml);
    const reg = styles();
    const dataRows = [new Map([[1, 5], [2, 'a&b <c>'], [3, 'ignored']]), new Map([[1, ' pad '], [4, true]])];
    const res = patchSheetXml(xml, parsed, { startRow: 1, dataRows, clearThroughRow: 3, styles: reg, highlight: true });
    // s="1" -> derived xf 2, no style -> derived xf 3 (from base 0)
    expect(res.xml).toContain('<row r="1" spans="1:3"><c r="A1" s="2"><v>5</v></c><c r="B1" s="3" t="inlineStr"><is><t>a&amp;b &lt;c&gt;</t></is></c><c r="C1"><f>A1*2</f><v>2</v></c></row>');
    expect(res.xml).toContain('<row r="2" spans="1:4"><c r="A2" s="2" t="inlineStr"><is><t xml:space="preserve"> pad </t></is></c><c r="D2" s="3" t="b"><v>1</v></c></row>');
    expect(res.xml).toContain('<row r="3"><c r="A3"/></row>');
    expect(res.xml).toContain('<dimension ref="A1:D3"/>');
    expect(res.xml).toContain('<autoFilter ref="A1:C2"/>');
    expect(res.written).toBe(4);
    const committed = reg.commit();
    expect(committed).toContain('<cellXfs count="4">');
    expect(committed).toContain('<xf applyBorder="1" applyFill="1" numFmtId="3" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1"/>');
    expect(committed).toContain('<fills count="3">');
    expect(committed).toContain('<borders count="2">');
  });

  it('lists sheet names from a template', async () => {
    expect(await listSheetNames(fixture('template.xlsx'))).toEqual([
      'Summary', 'By Plant', "Monthly FC (Don't use)", 'BP Daily', 'BPK Daily', 'GW Daily', 'SR Daily', 'Total', 'Sheet1', 'Sheet2', 'Analyze',
    ]);
  });
});
