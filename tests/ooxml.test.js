import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { buildSummary } from '../src/lib/excel/aggregate.js';
import { validateOoxml } from './ooxmlValidator.js';
import { fixture, loadProcessedData } from './helpers.js';

let exported;
beforeAll(async () => {
  const processedData = await loadProcessedData();
  const { blob } = await buildExport({ template: { buffer: fixture('template.xlsx') }, processedData, summaryData: buildSummary(processedData).summary });
  exported = await blob.arrayBuffer();
});

describe('OOXML structural validator', () => {
  it('passes on the original template and on the exported workbook', async () => {
    expect(await validateOoxml(fixture('template.xlsx'))).toEqual([]);
    expect(await validateOoxml(exported)).toEqual([]);
  });

  it('flags autoFilter placed after pageMargins', async () => {
    const zip = await JSZip.loadAsync(exported);
    const p = 'xl/worksheets/sheet1.xml';
    let xml = await zip.file(p).async('string');
    const af = xml.match(/<autoFilter\b[^>]*?(?:\/>|>[\s\S]*?<\/autoFilter>)/)?.[0];
    expect(af, 'sheet1 has an autoFilter').toBeTruthy();
    xml = xml.replace(af, '').replace(/(<pageMargins\b[^>]*\/>)/, `$1${af}`);
    zip.file(p, xml);
    const errors = await validateOoxml(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(errors.join('\n')).toMatch(/xl\/worksheets\/sheet1\.xml: element order violation — <autoFilter>/);
  });

  it('flags a part without a content-type override (custom.xml)', async () => {
    const zip = await JSZip.loadAsync(exported);
    zip.file('docProps/custom.xml', '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>');
    const errors = await validateOoxml(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(errors.join('\n')).toMatch(/missing content-type override for docProps\/custom\.xml/);
  });

  it('flags duplicate sheet names, bad r:id and out-of-range localSheetId', async () => {
    const zip = await JSZip.loadAsync(exported);
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace('name="BPK Daily"', 'name="BP Daily"').replace(/(<sheet\b[^>]*name="SR Daily"[^>]*r:id=")[^"]+/, '$1rId999');
    wb = wb.replace('</definedNames>', '<definedName name="X" localSheetId="99">A1</definedName></definedNames>');
    zip.file('xl/workbook.xml', wb);
    const errors = (await validateOoxml(await zip.generateAsync({ type: 'arraybuffer' }))).join('\n');
    expect(errors).toMatch(/ชื่อ sheet ซ้ำ/);
    expect(errors).toMatch(/rId999/);
    expect(errors).toMatch(/localSheetId 99/);
  });
});
