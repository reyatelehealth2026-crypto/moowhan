import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { safeSheetName } from '../src/utils/format.js';
import { fixture } from './helpers.js';

const processedData = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };

describe('extra sheets in the template export', () => {
  it('adds a brand-new values sheet, replaces an app sheet and refuses a template sheet', async () => {
    const extraSheets = [
      { name: 'QA Report', aoa: [['Severity', 'Part', 'Detail'], ['warning', 'P-1', 'a&b <ok>'], ['error', 'P-2', 123]] },
      { name: 'Sheet2', aoa: [['replaced'], [1, 2, 3]] }, // exists in the template (has a pivot table) -> refused
    ];
    const { buffer, report } = await patchTemplate(fixture('template.xlsx'), { processedData, extraSheets });
    expect(report.patched.filter((p) => p.created).map((p) => p.sheet)).toEqual(['QA Report']);

    const zip = await JSZip.loadAsync(buffer);
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toContain('<sheet name="QA Report" sheetId="12" r:id="rId19"/>');
    expect(await zip.file('[Content_Types].xml').async('string')).toContain('PartName="/xl/worksheets/sheet12.xml"');
    const app = await zip.file('docProps/app.xml').async('string');
    expect(app).toContain('<vt:i4>12</vt:i4>');
    expect(app).toContain('<vt:lpstr>QA Report</vt:lpstr>');
    // Sheet2 keeps its pivot relationship file
    expect(zip.file('xl/worksheets/_rels/sheet10.xml.rels')).toBeTruthy();

    const x = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    expect(x.SheetNames.at(-1)).toBe('QA Report');
    expect(x.Sheets['QA Report'].C2.v).toBe('a&b <ok>');
    expect(x.Sheets['QA Report'].C3.v).toBe(123);
    // Sheet2 is protected: refused and byte-identical
    expect(report.skippedSheets).toEqual([{ name: 'Sheet2', reason: 'protected' }]);
    const orig = await JSZip.loadAsync(fixture('template.xlsx'));
    expect(await zip.file('xl/worksheets/sheet10.xml').async('string')).toBe(await orig.file('xl/worksheets/sheet10.xml').async('string'));
    expect(x.Sheets['Sheet2'].A1?.v).not.toBe('replaced');

    const ex = new ExcelJS.Workbook();
    await ex.xlsx.load(buffer);
    expect(ex.getWorksheet('QA Report').getCell('A1').value).toBe('Severity');
  });

  it('appends extra sheets in fallback mode too', async () => {
    const res = await buildExport({ template: null, processedData, summaryData: [], extraSheets: [{ name: 'Changes/2026', aoa: [['x']] }] });
    const x = XLSX.read(new Uint8Array(await res.blob.arrayBuffer()), { type: 'array' });
    expect(x.SheetNames).toContain(safeSheetName('Changes/2026'));
    expect(safeSheetName("'Bad:Name*?[]/\\ that is way too long for excel'")).toBe('Bad Name that is way too long f');
  });
});
