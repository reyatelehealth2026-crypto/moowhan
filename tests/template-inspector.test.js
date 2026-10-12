import { describe, it, expect, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/readSource.js';
import { readTemplateBuffer } from '../src/lib/excel/templateInfo.js';
import { inspectTemplate } from '../src/features/template-inspector/templateInspect.js';
import { templateCapacityReport } from '../src/features/template-inspector/capacity.js';
import { fixture, SOURCE_FILES } from './helpers.js';

const templateBuf = () => fixture('template.xlsx');
// rebuild the template zip with a text edit on one part
const editZip = async (edit) => {
  const zip = await JSZip.loadAsync(templateBuf());
  await edit(zip);
  return zip.generateAsync({ type: 'arraybuffer' });
};
const editText = (path, fn) => async (zip) => zip.file(path, fn(await zip.file(path).async('string')));
const bySheet = (r) => Object.fromEntries(r.sheets.map((s) => [s.name, s]));
const codes = (r) => r.issues.map((i) => `${i.code}:${i.sheet ?? ''}`).sort();

describe('inspectTemplate: sheets and capacity', () => {
  let r;
  beforeAll(async () => { r = await inspectTemplate(templateBuf()); });

  it('reads capacity 12/25/9/6 for the Daily sheets and 54 (autoFilter) for Analyze', () => {
    const s = bySheet(r);
    expect(['BP', 'BPK', 'GW', 'SR'].map((p) => s[`${p} Daily`].capacity)).toEqual([12, 25, 9, 6]);
    expect(['BP', 'BPK', 'GW', 'SR'].map((p) => s[`${p} Daily`].firstFormulaRowBelowData)).toEqual([26, 39, 23, 20]);
    expect(s['BP Daily']).toMatchObject({ role: 'daily', headerRow: 13, dataStartRow: 14, capacitySource: 'formula' });
    expect(s.Analyze).toMatchObject({ role: 'analyze', headerRow: 2, dataStartRow: 3, capacity: 54, capacitySource: 'autoFilter' });
    expect(r.analyze).toMatchObject({ plantCol: 138, plantColLetter: 'EH', capacity: 54 });
    expect(r.sheets).toHaveLength(11);
    expect(r.missingSheets).toEqual([]);
  });

  it('reports hidden sheets, month, header cells, N columns and pivot sources', () => {
    const s = bySheet(r);
    expect(s.Summary.hidden).toBe(true);
    expect(s["Monthly FC (Don't use)"].hidden).toBe(true);
    expect(s['BP Daily'].hidden).toBe(false);
    expect(r.templateMonth).toBe("Feb'26");
    expect(r.headerCells.byPlantMonth).toEqual({ ref: 'C3', text: "Feb'26" });
    expect(r.headerCells.byPlantUpdate.ref).toBe('C2');
    expect(r.headerCells.analyzeMonths[0]).toEqual({ ref: 'AO1', text: 'Dec' });
    expect(r.headerCells.analyzeMonths.at(-1)).toEqual({ ref: 'EG1', text: 'Mar' });
    expect(r.nCols).toEqual([40, 72, 104, 136]);
    expect(r.pivots.caches.map((c) => `${c.cacheId}:${c.sheet}!${c.ref}`)).toEqual(['5:BPK Daily!A13:EF32', '6:Analyze!B2:EG49', '7:Analyze!A2:EG55']);
    expect(r.pivots.tables).toHaveLength(4);
    expect(r.pivots.caches.every((c) => c.refreshOnLoad === false && c.refreshedDate > 40000)).toBe(true);
  });

  it('flags only structural facts for the fixture (no errors) and reads kind/generator', () => {
    expect(codes(r)).toEqual(['AUTOFILTER_HEADER_ONLY:SR Daily', 'COND_FORMAT_IN_RANGE:BPK Daily', 'NO_AUTOFILTER:GW Daily']);
    expect(r.issues.some((i) => i.level === 'error')).toBe(false);
    expect(r.issues.every((i) => i.fix && i.message)).toBe(true);
    expect(r.kind).toBe('xlsx');
    expect(r.vba).toBe(false);
    expect(r.externalLinks).toEqual([]);
    expect(r.generator).toEqual({ application: 'Microsoft Excel', version: '16.0300' });
    expect(r.masters).toBeUndefined();
    expect(r.comments).toBeUndefined();
  });
});

describe('inspectTemplate: broken or foreign files', () => {
  it('reports SHEET_MISSING when SR Daily is removed or renamed', async () => {
    const removed = await editZip(editText('xl/workbook.xml', (x) => x.replace(/<sheet name="SR Daily"[^>]*\/>/, '')));
    const a = await inspectTemplate(removed);
    expect(a.missingSheets).toEqual(['SR Daily']);
    expect(a.issues.find((i) => i.code === 'SHEET_MISSING')).toMatchObject({ level: 'error', sheet: 'SR Daily' });
    const renamed = await editZip(editText('xl/workbook.xml', (x) => x.replace('name="SR Daily"', 'name="SR Daily (old)"')));
    expect((await inspectTemplate(renamed)).missingSheets).toEqual(['SR Daily']);
  });

  it('reports NO_PIVOT when the workbook has no pivot tables', async () => {
    const buf = await editZip((zip) => Object.keys(zip.files).filter((p) => /pivotTable\d+\.xml$/.test(p)).forEach((p) => zip.remove(p)));
    expect(codes(await inspectTemplate(buf))).toContain('NO_PIVOT:');
  });

  it('detects xlsb and xlsm/vba from the zip contents', async () => {
    const xlsb = await editZip((zip) => zip.file('xl/workbook.bin', 'x'));
    const b = await inspectTemplate(xlsb);
    expect(b.kind).toBe('xlsb');
    expect(b.issues.find((i) => i.code === 'KIND_UNSUPPORTED').level).toBe('error');
    const xlsm = await editZip(editText('[Content_Types].xml', (x) => x.replace('sheet.main+xml', 'sheet.macroEnabled.main+xml')));
    const m = await inspectTemplate(xlsm);
    expect(m).toMatchObject({ kind: 'xlsm', vba: true });
    expect(m.issues.some((i) => i.code === 'KIND_UNSUPPORTED')).toBe(true);
  });

  it('flags a generator that is not Excel', async () => {
    const buf = await editZip(editText('docProps/app.xml', (x) => x.replace('Microsoft Excel', 'LibreOffice')));
    const r = await inspectTemplate(buf);
    expect(r.generator.application).toBe('LibreOffice');
    const g = r.issues.find((i) => i.code === 'GENERATOR_NOT_EXCEL');
    expect(g.fix).toMatch(/Refresh All/);
  });

  it('never throws: garbage input becomes an INSPECT_FAILED issue', async () => {
    const r = await inspectTemplate(new Uint8Array([1, 2, 3, 4]).buffer);
    expect(r.issues[0]).toMatchObject({ level: 'error', code: 'INSPECT_FAILED' });
    expect(r.sheets).toEqual([]);
  });
});

describe('inspectTemplate: fingerprint, cost', () => {
  it('is stable for the same buffer and changes when a header text changes', async () => {
    const a = await inspectTemplate(templateBuf());
    const b = await inspectTemplate(templateBuf());
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(b.fingerprint).toBe(a.fingerprint);
    const edited = await editZip(editText('xl/sharedStrings.xml', (x) => x.replace('<t>PART DESC</t>', '<t>PART DESC2</t>')));
    expect((await inspectTemplate(edited)).fingerprint).not.toBe(a.fingerprint);
  });

  it('loads the zip once and stays well under 150 ms', async () => {
    const buf = templateBuf();
    await inspectTemplate(buf, { deep: true }); // warm up
    const spy = vi.spyOn(JSZip, 'loadAsync');
    const t0 = performance.now();
    await inspectTemplate(buf, { deep: true });
    const ms = performance.now() - t0;
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(ms).toBeLessThan(150);
  });
});

describe('inspectTemplate: deep', () => {
  let r;
  beforeAll(async () => { r = await inspectTemplate(templateBuf(), { deep: true }); });

  it('lists masters', () => {
    expect(r.masters.byPlantKeys).toHaveLength(51);
    expect(r.masters.totalParts).toHaveLength(27);
    expect(r.masters.dockSuffixMap).toHaveLength(8);
    expect(r.masters.dockSuffixMap[0]).toMatchObject({ part: '86790-0K050', plant: 'BPK', dock: 'B2', packing: 'TP1' });
    expect(r.masters.pivotSources).toEqual(['BPK Daily!A13:EF32', 'Analyze!B2:EG49', 'Analyze!A2:EG55']);
    expect(r.masters).toBe(r.masters); // memoised
  });

  it('inventories the 9 comments and marks the ones inside the patched area', () => {
    expect(r.comments).toHaveLength(9);
    const inside = r.comments.filter((c) => c.insidePatchedArea).map((c) => `${c.sheet}!${c.ref}`);
    expect(inside).toEqual(['BPK Daily!A25', 'BPK Daily!A30', 'BPK Daily!A31', 'SR Daily!EF16', 'Analyze!B34', 'Analyze!B35']);
    expect(r.comments[0]).toMatchObject({ sheet: 'By Plant', ref: 'A49', author: 'Nardhathai Niphitakul' });
    expect(r.comments[0].text).toMatch(/^BPK แยก packing/);
    expect(r.comments.find((c) => c.ref === 'I1').insidePatchedArea).toBe(false);
  });

  it('keeps getters out of JSON / spreads', () => {
    expect(Object.keys(r)).not.toContain('masters');
    expect(JSON.parse(JSON.stringify(r)).masters).toBeUndefined();
  });
});

describe('templateCapacityReport', () => {
  let r;
  beforeAll(async () => { r = await inspectTemplate(templateBuf()); });

  it('marks BP with 14 rows as over (capacity 12, sum row 26)', () => {
    const rep = templateCapacityReport(r, { 'BP Daily': 14 });
    expect(rep[0]).toEqual({ sheet: 'BP Daily', rows: 14, capacity: 12, sumRow: 26, over: true });
    expect(templateCapacityReport(r, { BP: new Array(12).fill({}) })[0].over).toBe(false);
  });

  it('has no over for the real fixture rows', () => {
    const data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
    for (const f of SOURCE_FILES) data[`${categorizeFile(f.split('/').pop())} Daily`].push(...readSourceBuffer(fixture(f)).rows);
    const rep = templateCapacityReport(r, data);
    expect(rep.map((x) => x.sheet)).toEqual(['BP Daily', 'BPK Daily', 'GW Daily', 'SR Daily', 'Analyze']);
    expect(rep.some((x) => x.over)).toBe(false);
  });

  it('accepts capacity overrides by sheet or plant and treats unknown capacity as unlimited', () => {
    expect(templateCapacityReport(r, { BP: 14 }, { BP: 20 })[0]).toMatchObject({ capacity: 20, over: false });
    expect(templateCapacityReport(r, { 'GW Daily': 10 }, { 'GW Daily': 5 })[0]).toMatchObject({ capacity: 5, over: true });
    expect(templateCapacityReport({ sheets: [] }, { BP: 99 })[0]).toMatchObject({ capacity: null, over: false });
  });
});

describe('readTemplateBuffer', () => {
  it('keeps the inspection on the template info without a second zip load', async () => {
    const info = await readTemplateBuffer(templateBuf());
    expect(info.kind).toBe('xlsx');
    expect(info.sheets).toHaveLength(11);
    expect(info.inspection.templateMonth).toBe("Feb'26");
  });
});
