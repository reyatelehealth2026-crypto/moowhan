import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/readSource.js';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { buildAnalyzeRows, buildSummary } from '../src/lib/excel/aggregate.js';
import { verifyExport } from '../src/lib/excel/verifyExport.js';
import { expectedTotals } from '../src/lib/excel/expectedTotals.js';
import { inspectTemplate } from '../src/features/template-inspector/templateInspect.js';
import { buildGate, needsDialog, summarizeGate } from '../src/features/export-gate/gate.js';
import { planExport, defaultFilePattern } from '../src/features/export-gate/plan.js';
import { buildChecklist } from '../src/features/export-gate/checklist.js';
import { attachOverrideNote, makeLastExport, overrideLogEntry, redownload, shouldVerifyFirst } from '../src/features/export-gate/lastExport.js';
import { collectGate } from '../src/features/runtime.js';
import { renderFileName } from '../src/utils/format.js';
import { fixture, SOURCE_FILES } from './helpers.js';

let template, inspection, data, sources;
const load = () => {
  const d = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  const files = [];
  SOURCE_FILES.forEach((f, i) => {
    const { rows, meta } = readSourceBuffer(fixture(f));
    d[`${categorizeFile(f.split('/').pop())} Daily`].push(...rows);
    files.push({ id: `f${i}`, name: f.split('/').pop(), category: categorizeFile(f.split('/').pop()), status: 'done', meta });
  });
  return { d, files };
};
const ctxOf = (over = {}) => ({
  state: {
    processedData: data, isStale: false, productionMonth: { year: 2026, month: 2 }, sourceFiles: sources,
    template: { kind: 'xlsx', name: 'template.xlsx', inspection },
    ...over,
  },
});
const clone = (rows, n) => Array.from({ length: n }, (_, i) => ({ ...rows[i % rows.length], partNumber: `X-${i}`, rawRow: [`X-${i}`, ...rows[i % rows.length].rawRow.slice(1)] }));

beforeAll(async () => {
  template = fixture('template.xlsx');
  inspection = await inspectTemplate(template);
  ({ d: data, files: sources } = load());
});

describe('buildGate', () => {
  it('returns [] for a complete, fresh run (one-click download)', () => {
    expect(buildGate(ctxOf())).toEqual([]);
    expect(needsDialog([])).toBe(false);
  });

  it('G02: plant without a file -> confirm that names the Daily sheet', () => {
    const issues = buildGate(ctxOf({ processedData: { ...data, 'SR Daily': [] } }));
    const g = issues.find((i) => i.code === 'G02');
    expect(g.level).toBe('confirm');
    expect(g.message).toContain('SR Daily');
    expect(g.message).toMatch(/ล้างข้อมูลเดิม 6 แถว/);
    expect(needsDialog(issues)).toBe(true);
  });

  it('G01: stale -> block with a reprocess action', () => {
    const g = buildGate(ctxOf({ isStale: true })).find((i) => i.code === 'G01');
    expect(g.level).toBe('block');
    expect(g.action.label).toBe('ประมวลผลใหม่');
  });

  it('G04: different PRODUCTION MONTH -> block', () => {
    const files = sources.map((f, i) => (i === 0 ? { ...f, meta: { ...f.meta, productionMonthRaw: '202603' } } : f));
    const g = buildGate(ctxOf({ sourceFiles: files })).find((i) => i.code === 'G04');
    expect(g.level).toBe('block');
    expect(g.message).toMatch(/202602/);
    expect(g.message).toMatch(/202603/);
  });

  it('G06: BP with 13 rows exceeds the 12-row area -> block mentioning BP Daily and 12', () => {
    const g = buildGate(ctxOf({ processedData: { ...data, 'BP Daily': clone(data['BP Daily'], 13) } })).find((i) => i.code === 'G06');
    expect(g.level).toBe('block');
    expect(g.message).toContain('BP Daily');
    expect(g.message).toContain('12');
    expect(g.message).toContain('26');
  });

  it('G05: Analyze over its capacity -> confirm (capacity from the inspection)', () => {
    const small = { ...inspection, sheets: inspection.sheets.map((s) => (s.name === 'Analyze' ? { ...s, capacity: 20 } : s)) };
    const g = buildGate(ctxOf({ template: { kind: 'xlsx', inspection: small } })).find((i) => i.code === 'G05');
    expect(g.level).toBe('confirm');
    expect(g.message).toContain('Analyze');
  });

  it('G09: a missing required sheet -> block', () => {
    const g = buildGate(ctxOf({ template: { kind: 'xlsx', inspection: { ...inspection, missingSheets: ['SR Daily'] } } })).find((i) => i.code === 'G09');
    expect(g.level).toBe('block');
    expect(g.message).toContain('SR Daily');
  });

  it('G08: no .xlsx template -> info only, the dialog stays closed', () => {
    const issues = buildGate(ctxOf({ template: null }));
    expect(issues.map((i) => i.code)).toEqual(['G08']);
    expect(issues[0].level).toBe('info');
    expect(needsDialog(issues)).toBe(false);
  });

  it('nothing processed -> no issues; summarizeGate counts levels', () => {
    expect(buildGate({ state: {} })).toEqual([]);
    expect(summarizeGate([{ level: 'block' }, { level: 'confirm' }, { level: 'confirm' }])).toEqual({ block: 1, confirm: 2, info: 0, state: 'blocked' });
    expect(summarizeGate([]).state).toBe('ready');
  });

  it('other features feed the same gate through runtime.collectGate (beforeExport / validate)', () => {
    const qa = { id: 'qa-fake', beforeExport: () => [{ level: 'confirm', code: 'G03', message: 'QA พบข้อผิดพลาด 2 รายการ', fix: 'เปิดแท็บ QA' }] };
    const issues = collectGate([qa], ctxOf(), undefined, buildGate(ctxOf({ isStale: true })));
    expect(issues.map((i) => i.code)).toEqual(['G01', 'G03']); // block first, then confirm
  });
});

describe('planExport', () => {
  it('rows, start rows and Analyze capacity from the inspection (no XML parsing)', () => {
    const plan = planExport({ processedData: data, inspection });
    expect(plan.mode).toBe('template');
    expect(plan.sheets.map((s) => [s.sheet, s.rows, s.startRow, s.capacity])).toEqual([
      ['BP Daily', 8, 14, 12], ['BPK Daily', 12, 14, 25], ['GW Daily', 5, 14, 9], ['SR Daily', 4, 14, 6],
    ]);
    expect(plan.analyze).toMatchObject({ rows: 29, capacity: 54, startRow: 3, over: false });
    expect(plan.totalRows).toBe(29);
  });

  it('marks the over-capacity sheet and falls back without an inspection', () => {
    const plan = planExport({ processedData: { ...data, 'BP Daily': clone(data['BP Daily'], 13) }, inspection });
    expect(plan.sheets[0]).toMatchObject({ over: true, written: 12 });
    expect(planExport({ processedData: data }).mode).toBe('fallback');
  });

  it('default file pattern depends on the template kind', () => {
    expect(defaultFilePattern({ kind: 'xlsx' })).toBe('Production_Updated_{month}_{date}.xlsx');
    expect(defaultFilePattern(null)).toBe('Production_Summary_{month}_{date}.xlsx');
  });
});

describe('renderFileName', () => {
  const pm = { year: 2026, month: 2 };
  it('fills {month} and {date}', () => {
    expect(renderFileName('Production_Updated_{month}_{date}.xlsx', { productionMonth: pm, date: '2026-10-05' })).toBe('Production_Updated_Feb26_2026-10-05.xlsx');
  });
  it('removes / : \\ ? * [ ] and adds .xlsx', () => {
    expect(renderFileName('a/b:c\\d?e*f[g]_{date}', { productionMonth: pm, date: '2026-10-05' })).toBe('abcdefg_2026-10-05.xlsx');
  });
  it('copes with a missing month and empty names', () => {
    expect(renderFileName('Plan_{month}_{date}.xlsx', { date: '2026-10-05' })).toBe('Plan_2026-10-05.xlsx');
    expect(renderFileName('////', { productionMonth: pm, date: '2026-10-05' })).toBe('Production_Updated_Feb26_2026-10-05.xlsx');
  });
});

describe('expectedTotals', () => {
  it('BP Daily!AN26 and SR Daily!AN21 (advisory) follow the data', () => {
    const t = expectedTotals(data, { inspection });
    expect(t.map['BP Daily!AN26']).toBe(5399);
    expect(t.map['SR Daily!AN21']).toBe(48934);
    expect(t.cells.every((c) => c.advisory)).toBe(true);
    // same result as updateRowValues would produce: edit one BP row's N by +100
    const edited = { ...data, 'BP Daily': data['BP Daily'].map((r, i) => (i === 0 ? { ...r, n: r.n + 100 } : r)) };
    const t2 = expectedTotals(edited, { inspection });
    expect(t2.map['BP Daily!AN26']).toBe(5499);
    expect(t2.map['SR Daily!AN21']).toBe(49034);
  });
  it('without an inspection it still returns totals but no cell positions', () => {
    const t = expectedTotals(data);
    expect(t.cells).toEqual([]);
    expect(t.byPlant['BP Daily'].n).toBe(5399);
  });
});

describe('verifyExport', () => {
  let built, buffer;
  beforeAll(async () => {
    built = await buildExport({ template: { buffer: template }, processedData: data, summaryData: buildSummary(data).summary });
    buffer = await built.blob.arrayBuffer();
  });
  const run = (buf = buffer, extra = {}) =>
    verifyExport(buf, { processedData: data, analyzeRows: buildAnalyzeRows(data), templateBuffer: template, report: built.report, ...extra });

  it('passes on the 5 fixtures, V02 totals per plant', async () => {
    const t0 = Date.now();
    const v = await run();
    expect(Date.now() - t0).toBeLessThan(500);
    expect(v.ok).toBe(true);
    expect(v.sampled).toBe(false);
    const v02 = Object.fromEntries(v.checks.filter((c) => c.id === 'V02').map((c) => [c.sheet, c.actual]));
    expect(v02).toEqual({ 'BP Daily': 5399, 'BPK Daily': 23660, 'GW Daily': 17594, 'SR Daily': 2281 });
    expect(new Set(v.checks.map((c) => c.id))).toEqual(new Set(['V01', 'V02', 'V03', 'V04', 'V05', 'V08', 'V09', 'V10']));
    expect(v.checks.every((c) => c.ok === true)).toBe(true);
  });

  it('changing AN14 inside the zip fails only V02 of BP Daily', async () => {
    const zip = await JSZip.loadAsync(buffer);
    const file = 'xl/worksheets/sheet4.xml';
    let xml = await zip.file(file).async('string');
    const before = xml.match(/<c r="AN14"[^>]*><v>([^<]*)<\/v><\/c>/);
    expect(before).toBeTruthy();
    xml = xml.replace(before[0], before[0].replace(/<v>[^<]*<\/v>/, '<v>0</v>'));
    zip.file(file, xml);
    const bad = await zip.generateAsync({ type: 'arraybuffer' });
    const v = await run(bad);
    expect(v.ok).toBe(false);
    expect(v.failed.map((c) => `${c.id}:${c.sheet}`)).toEqual(['V02:BP Daily']);
    const c = v.failed[0];
    expect(c.expected).toBe(5399);
    expect(c.actual).toBe(5399 - Number(before[0].match(/<v>([^<]*)</)[1]));
    expect(c.actual).toBe(3508); // AN14 was 1891
  });

  it('extra sheets are checked (V06) and a missing one fails', async () => {
    const extra = [{ name: 'Run Info', aoa: [['a', 'b'], ['c']] }];
    const b2 = await buildExport({ template: { buffer: template }, processedData: data, summaryData: [], extraSheets: extra });
    const buf = await b2.blob.arrayBuffer();
    const ok = await verifyExport(buf, { processedData: data, extraSheets: extra, templateBuffer: template, report: b2.report });
    expect(ok.checks.find((c) => c.id === 'V06')).toMatchObject({ ok: true, expected: 2, actual: 2 });
    const missing = await verifyExport(buf, { processedData: data, extraSheets: [{ name: 'Nope', aoa: [['x']] }], templateBuffer: template, report: b2.report });
    expect(missing.failed.map((c) => c.id)).toEqual(['V06']);
  });

  it('fallback mode: V05/V08/V09/V10 are null, the rest pass', async () => {
    const fb = await buildExport({ template: null, processedData: data, summaryData: [] });
    const v = await verifyExport(await fb.blob.arrayBuffer(), { processedData: data, report: fb.report });
    expect(v.mode).toBe('fallback');
    expect(v.ok).toBe(true);
    ['V05', 'V08', 'V09', 'V10'].forEach((id) => expect(v.checks.find((c) => c.id === id).ok).toBeNull());
    expect(v.checks.filter((c) => c.id === 'V02').map((c) => c.actual)).toEqual([5399, 23660, 17594, 2281]);
  });

  it('samples above 2000 rows and finishes within 2 s', { timeout: 30000 }, async () => {
    const big = { 'BP Daily': clone(data['BP Daily'], 2100), 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
    const fb = await buildExport({ template: null, processedData: big, summaryData: [] });
    const buf = await fb.blob.arrayBuffer();
    const t0 = Date.now();
    const v = await verifyExport(buf, { processedData: big, report: fb.report });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(v.sampled).toBe(true);
    expect(v.ok).toBe(true);
    expect(shouldVerifyFirst(2100)).toBe(false);
    expect(shouldVerifyFirst(52)).toBe(true);
  });
});

describe('buildChecklist', () => {
  const report = {
    patched: [{ sheet: 'BP Daily', rows: 8, startRow: 14, cells: 1 }, { sheet: 'Run Info', rows: 3, startRow: 1, created: true }],
    skipped: ['Analyze'], skippedSheets: [{ name: 'Summary', reason: 'protected' }],
    overflow: [{ sheet: 'SR Daily', rows: 8, capacity: 6, dropped: ['a', 'b'] }],
    cellWrites: [{ sheet: 'By Plant', ref: 'C2', status: 'written' }, { sheet: 'By Plant', ref: 'C3', status: 'skipped-formula' }],
    warnings: ['SR Daily: เกินพื้นที่'],
  };
  it('lists written / skipped / warning / check / info items', () => {
    const verification = { ok: false, sampled: false, checks: [{ id: 'V02', label: 'ผลรวม', ok: false, expected: 1, actual: 2, sheet: 'BP Daily' }, { id: 'V05', label: 'x', ok: null }, { id: 'V01', label: 'y', ok: true }] };
    const expected = expectedTotals(data, { inspection });
    const items = buildChecklist({ report, verification, expected, highlight: true, plannedCellWrites: [{ sheet: 'By Plant', ref: 'C2' }, { sheet: 'Total', ref: 'B1' }] });
    const kinds = (k) => items.filter((i) => i.kind === k).map((i) => i.text);
    expect(kinds('written').some((t) => t.startsWith('BP Daily: 8 แถว'))).toBe(true);
    expect(kinds('written').some((t) => t.includes('Run Info'))).toBe(true);
    expect(kinds('skipped').join('|')).toMatch(/Analyze.*ไม่พบ/);
    expect(kinds('skipped').join('|')).toMatch(/Summary/);
    expect(kinds('skipped').join('|')).toMatch(/SR Daily.*ไม่ได้เขียน 2 แถว/);
    expect(kinds('skipped').join('|')).toMatch(/By Plant!C3.*เป็นสูตร/);
    expect(kinds('skipped').join('|')).toMatch(/Total!B1/); // planned header cell never written
    expect(kinds('skipped').join('|')).not.toMatch(/By Plant!C2/);
    expect(kinds('warning')).toContain('SR Daily: เกินพื้นที่');
    expect(kinds('warning').join('|')).toMatch(/ผลรวม: คาดว่า 1 แต่พบ 2/);
    expect(kinds('check')[0]).toMatch(/ผ่าน 1 • ไม่ผ่าน 1 • ข้าม 1/);
    expect(kinds('info').join('|')).toMatch(/Refresh All/);
    expect(kinds('info').join('|')).toMatch(/BP Daily!AN26 = 5,399/);
  });
  it('says so when the file was not verified yet', () => {
    expect(buildChecklist({ report: { patched: [] } }).find((i) => i.kind === 'check').ok).toBeNull();
  });
});

describe('last export and override', () => {
  it('redownload reuses the remembered blob and never builds again', () => {
    const last = makeLastExport({ blob: new Blob(['x']), fileName: 'a.xlsx', report: { mode: 'template' } });
    const calls = [];
    expect(redownload(last, (b, n) => calls.push(n))).toBe(true);
    expect(redownload(last, (b, n) => calls.push(n))).toBe(true);
    expect(calls).toEqual(['a.xlsx', 'a.xlsx']);
    expect(redownload(null, () => calls.push('never'))).toBe(false); // cleared by reset
    expect(calls).toHaveLength(2);
  });
  it('override leaves a changelog entry and a Run Info note', () => {
    const blocks = [{ code: 'G06', message: 'BP Daily เกิน' }];
    const log = overrideLogEntry(blocks, 'a.xlsx');
    expect(log.action).toBe('override');
    expect(log.details).toContain('G06');
    const sheets = attachOverrideNote([{ name: 'QA Report', aoa: [['x']] }], blocks);
    expect(sheets.find((s) => s.name === 'Run Info').aoa.flat().join(' ')).toContain('G06');
    const merged = attachOverrideNote([{ name: 'Run Info', aoa: [['เวอร์ชัน', '1']] }], blocks);
    expect(merged).toHaveLength(1);
    expect(merged[0].aoa[0]).toEqual(['เวอร์ชัน', '1']);
    expect(attachOverrideNote([{ name: 'A', aoa: [] }], [])).toHaveLength(1);
  });
});

describe('module boundaries', () => {
  it('components, state and the feature UI never import xlsx/jszip statically', () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const files = [
      'src/components/ExportDialog.jsx', 'src/state/useConsolidator.js', 'src/App.jsx', 'src/components/SummaryTab.jsx',
      ...fs.readdirSync(path.join(root, 'src/features/export-gate')).map((f) => `src/features/export-gate/${f}`),
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/from ['"](xlsx|jszip)['"]/);
      expect(src, f).not.toMatch(/from ['"][./]*lib\/excel\/(verifyExport|templatePatcher|exportWorkbook)/);
    }
  });
});

describe('save target (บันทึกลงโฟลเดอร์)', () => {
  const fakeDir = (files = new Map(), perm = 'granted') => ({
    name: 'ส่งออก',
    async queryPermission() { return perm; },
    async *entries() { for (const k of files.keys()) yield [k, { kind: 'file' }]; },
    async getFileHandle(name) { return { async createWritable() { return { async write(b) { files.set(name, b); }, async close() {} }; } }; },
  });

  it('defaults to the browser download; a chosen folder switches delivery', async () => {
    const { saveTarget, deliveryOptions, canSaveToFolder } = await import('../src/features/export-gate/saveTarget.js');
    saveTarget.reset();
    expect(deliveryOptions()).toEqual({});
    expect(canSaveToFolder()).toBe(false); // node: no showDirectoryPicker, so the dialog hides the option
    expect(await saveTarget.pickFolder(async () => fakeDir())).toBe(true);
    expect(saveTarget.get()).toMatchObject({ kind: 'folder', name: 'ส่งออก' });
    expect(deliveryOptions().folderName).toBe('ส่งออก');
    saveTarget.useDownload();
    expect(deliveryOptions()).toEqual({});
    // closing the picker keeps the previous target
    expect(await saveTarget.pickFolder(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); })).toBe(false);
    saveTarget.reset();
  });

  it('writes without overwriting (_v2) and reports a Thai error when permission is refused', async () => {
    const { saveBlobToFolder } = await import('../src/features/export-gate/saveTarget.js');
    const files = new Map([['Production_Updated.xlsx', 'old']]);
    const ok = await saveBlobToFolder(fakeDir(files), 'Production_Updated.xlsx', new Blob(['new']));
    expect(ok).toEqual({ ok: true, name: 'Production_Updated_v2.xlsx' });
    expect(files.get('Production_Updated.xlsx')).toBe('old');
    expect(files.has('Production_Updated_v2.xlsx')).toBe(true);
    const denied = await saveBlobToFolder({ ...fakeDir(files, 'denied'), requestPermission: async () => 'denied' }, 'x.xlsx', new Blob(['x']));
    expect(denied).toEqual({ ok: false, error: 'ไม่ได้รับอนุญาตให้เขียนลงโฟลเดอร์' });
  });
});
