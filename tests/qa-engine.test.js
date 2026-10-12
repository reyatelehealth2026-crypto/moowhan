import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { inspectTemplate } from '../src/features/template-inspector/templateInspect.js';
import { runRules, listRules, registerRule } from '../src/features/qa-engine/engine.js';
import { countByLevel, toCsvRows, toContractIssue, fromContractIssue, filterIssues } from '../src/features/qa-engine/model.js';
import { createWaiverStore, memoryAdapter, applyWaivers, waiverKey } from '../src/features/qa-engine/waivers.js';
import feature from '../src/features/qa-engine/index.jsx';
import { collectIssues } from '../src/features/runtime.js';
import { validateFeature } from '../src/features/defineFeature.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PM = { year: 2026, month: 2 };
const TODAY = new Date(2026, 1, 10);

let inspection; let template; let base;
const build = () => {
  const data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  const files = [];
  SOURCE_FILES.forEach((f, fi) => {
    const name = f.split('/')[1];
    const category = categorizeFile(name);
    const { rows, meta } = readSourceBuffer(fixture(f));
    files.push({ id: `f${fi}`, name, category, status: 'done', rowCount: rows.length, error: null, meta });
    rows.forEach((r, i) => Object.assign(r, { id: `f${fi}-${i}`, plant: category, fileName: name }));
    data[`${category} Daily`].push(...rows);
  });
  return { data, files };
};
const clone = () => structuredClone(base);
const run = (over = {}, b = clone()) =>
  runRules({ processedData: b.data, sourceFiles: b.files, productionMonth: PM, template, today: TODAY, ...over });

beforeAll(async () => {
  const buf = fs.readFileSync(path.join(root, 'template.xlsx'));
  inspection = await inspectTemplate(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { deep: true });
  template = { inspection };
  base = build();
});

describe('engine on the real fixtures', () => {
  it('has 0 errors and R01 passes every row of every month', () => {
    const issues = run();
    expect(countByLevel(issues).error).toBe(0);
    expect(issues.filter((i) => i.rule === 'R01')).toEqual([]);
    expect(Object.values(base.data).flat().length).toBeGreaterThan(0);
  });

  it('is pure: importing the engine needs no DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(listRules().length).toBeGreaterThan(20);
  });

  it('M03 is never an error', () => {
    expect(listRules().find((r) => r.id === 'M03').level).toBe('warning');
    ['2026-10-05', '2026-01-25'].forEach((d) => {
      expect(run({ today: new Date(d) }).filter((i) => i.rule === 'M03').every((i) => i.level !== 'error')).toBe(true);
    });
  });
});

describe('row rules', () => {
  it('R01: +5 on day 3 of the first BP row gives exactly one error with location', () => {
    const b = clone();
    const row = b.data['BP Daily'][0];
    row.rawRow[row.colPositions.nCol - 31 + 2] += 5;
    const r01 = run({}, b).filter((i) => i.rule === 'R01');
    expect(r01).toHaveLength(1);
    expect(r01[0]).toMatchObject({ level: 'error', plant: 'BP', sheet: 'BP Daily', rowNumber: 14, scope: 'row' });
    expect(r01[0].actual - r01[0].expected).toBe(-5);
    expect(r01[0].fix).not.toBe('');
  });

  it('R01 uses colPositions instead of hard-coded columns', () => {
    const b = clone();
    const row = b.data['GW Daily'][0];
    expect(row.colPositions.n1Col).toBe(71);
    row.rawRow[row.colPositions.n1Col] += 1;
    expect(run({}, b).filter((i) => i.rule === 'R01')).toHaveLength(1);
  });

  it('R02: quantity on 30 Feb', () => {
    const b = clone();
    const row = b.data['BP Daily'][0];
    row.rawRow[row.colPositions.nCol - 31 + 29] = 10;
    const r02 = run({}, b).filter((i) => i.rule === 'R02');
    expect(r02).toHaveLength(1);
    expect(r02[0].message).toContain('30 ก.พ.');
  });

  it('R03: "1,891" in the total column', () => {
    const b = clone();
    const row = b.data['BP Daily'][1];
    row.rawRow[row.colPositions.n1Col] = '1,891';
    const r03 = run({}, b).filter((i) => i.rule === 'R03');
    expect(r03).toHaveLength(1);
    expect(r03[0].actual).toBe('1,891');
    expect(run({}, b).filter((i) => i.rule === 'R01' && i.rowNumber === 15)).toEqual([]); // R03 owns it
  });

  it('R06: PLANT CODE not matching the file name is a warning', () => {
    const b = clone();
    b.files[0].meta.plantCode = 'S';
    const r06 = run({}, b).filter((i) => i.rule === 'R06');
    expect(r06).toHaveLength(1);
    expect(r06[0]).toMatchObject({ level: 'warning', plant: 'BP', fileName: b.files[0].name });
  });

  it('R08 levels: negative = error, bad packing = warning, all zero = info', () => {
    const b = clone();
    const [a, c, d] = b.data['SR Daily'];
    a.rawRow[a.colPositions.nCol - 31] = -4;
    c.packingSize = 0;
    ['n', 'n1', 'n2', 'n3'].forEach((k) => { d[k] = 0; });
    const r08 = run({}, b).filter((i) => i.rule === 'R08');
    expect(r08.find((i) => i.rowNumber === 14).level).toBe('error');
    expect(r08.find((i) => i.rowNumber === 15).level).toBe('warning');
    expect(r08.find((i) => i.rowNumber === 16).level).toBe('info');
  });

  it('R09: skipped rows are reported per file', () => {
    const b = clone();
    b.files[1].meta.skippedRows = [{ rowNumber: 20, values: ['AB'] }];
    expect(run({}, b).filter((i) => i.rule === 'R09')).toHaveLength(1);
  });

  it('a manually edited row downgrades R01 to info', () => {
    const b = clone();
    const row = b.data['BP Daily'][0];
    row.rawRow[row.colPositions.nCol] += 100;
    row.edited = true;
    const r01 = run({}, b).filter((i) => i.rule === 'R01');
    expect(r01).toHaveLength(1);
    expect(r01[0].level).toBe('info');
  });
});

describe('month, layout, consistency, template', () => {
  it('M01 is the only month error', () => {
    const b = clone();
    b.files[2].meta.productionMonthRaw = '202603';
    const m01 = run({}, b).filter((i) => i.rule === 'M01');
    expect(m01).toHaveLength(1);
    expect(m01[0].level).toBe('error');
    expect(run({}, b).filter((i) => i.group === 'month' && i.rule !== 'M01').every((i) => i.level !== 'error')).toBe(true);
  });

  it('M02 follows inspection.templateMonth and is skipped without it', () => {
    expect(run().filter((i) => i.rule === 'M02')).toHaveLength(0);
    const m02 = run({ productionMonth: { year: 2026, month: 3 } }).filter((i) => i.rule === 'M02');
    expect(m02).toHaveLength(1);
    expect(m02[0].level).toBe('warning');
    expect(run({ template: { inspection: { ...inspection, templateMonth: null } }, productionMonth: { year: 2026, month: 3 } }).filter((i) => i.rule === 'M02')).toHaveLength(0);
  });

  it('M03: injected today (2026-10-05 warning, 2026-01-25 none)', () => {
    expect(run({ today: new Date('2026-10-05T12:00:00') }).filter((i) => i.rule === 'M03')).toHaveLength(1);
    expect(run({ today: new Date('2026-01-25T12:00:00') }).filter((i) => i.rule === 'M03')).toHaveLength(0);
  });

  it('L01 flags a layout that differs from inspection.nCols; skipped without inspection', () => {
    const b = clone();
    b.data['BP Daily'].forEach((r) => { r.colPositions = { ...r.colPositions, n1Col: 72 }; });
    expect(run({}, b).filter((i) => i.rule === 'L01')).toHaveLength(1);
    expect(run({ template: null }, b).filter((i) => i.group === 'layout')).toEqual([]);
  });

  it('K01: trailing space on a Part Number gives exactly one error', () => {
    const b = clone();
    b.data['BP Daily'][0].partNumber += ' ';
    const k01 = run({}, b).filter((i) => i.rule === 'K01');
    expect(k01).toHaveLength(1);
    expect(k01[0].level).toBe('error');
  });

  it('K03 needs the dock map; K04 flags fractions', () => {
    const b = clone();
    const rows = b.data['BP Daily'];
    rows[1].partNumber = rows[0].partNumber;
    rows[1].dockCode = 'ZZ';
    const k03 = run({}, b).filter((i) => i.rule === 'K03');
    expect(k03.length).toBeGreaterThan(0);
    expect(run({ template: null }, b).filter((i) => i.rule === 'K03')).toHaveLength(0);
    b.data['SR Daily'][0].n = 10.5;
    expect(run({}, b).filter((i) => i.rule === 'K04')).toHaveLength(1);
  });

  it('C01: more rows than the Daily capacity', () => {
    const b = clone();
    const rows = b.data['BP Daily'];
    while (rows.length < 14) rows.push({ ...rows[0], id: `x${rows.length}` });
    const c01 = run({}, b).filter((i) => i.rule === 'C01');
    expect(c01).toHaveLength(1);
    expect(c01[0]).toMatchObject({ plant: 'BP', expected: '≤ 12 แถว', actual: 14, rowNumber: 26 });
  });

  it('T01 is clean on fixtures and flags an unknown part', () => {
    expect(run().filter((i) => i.rule === 'T01')).toEqual([]);
    const b = clone();
    b.data['BP Daily'][0].partNumber = '99999-ZZZZZ-00';
    expect(run({}, b).filter((i) => i.rule === 'T01')).toHaveLength(1);
  });
});

describe('settings, registry and model', () => {
  it('settings.rules[id] = false skips the rule', () => {
    const b = clone();
    const row = b.data['BP Daily'][0];
    row.rawRow[row.colPositions.nCol] += 1;
    expect(run({}, b).filter((i) => i.rule === 'R01')).toHaveLength(1);
    expect(run({ settings: { rules: { R01: false } } }, b).filter((i) => i.rule === 'R01')).toHaveLength(0);
  });

  it('a new rule is one registerRule call; a throwing rule becomes an info issue', () => {
    registerRule({ id: 'X01', group: 'row', level: 'warning', run: () => [{ message: 'hello', scope: 'run' }] });
    registerRule({ id: 'X02', group: 'row', level: 'warning', run: () => { throw new Error('boom'); } });
    const issues = run();
    expect(issues.find((i) => i.rule === 'X01')).toMatchObject({ level: 'warning', message: 'hello' });
    expect(issues.find((i) => i.rule === 'X02').level).toBe('info');
    expect(() => registerRule({ id: 'bad', group: 'row', level: 'warning', run: () => [] })).toThrow();
  });

  it('toCsvRows escapes formula prefixes', () => {
    const rows = toCsvRows([{ rule: 'R04', level: 'warning', message: '=HYPERLINK("x")', fix: '+1', partNumber: '@a', plant: '', fileName: '-b', dockCode: '', sheet: '', rowNumber: null, expected: null, actual: null }]);
    expect(rows[1][7]).toBe("'=HYPERLINK(\"x\")");
    expect(rows[1][8]).toBe("'+1");
    expect(rows[1][4]).toBe("'@a");
    expect(rows[1][3]).toBe("'-b");
  });

  it('filterIssues by level, plant, status and query', () => {
    const issues = [{ level: 'error', plant: 'BP', rule: 'R01', group: 'row', message: 'a', waived: false }, { level: 'info', plant: 'SR', rule: 'K05', group: 'consistency', message: 'b', waived: true }];
    expect(filterIssues(issues, { level: 'error' })).toHaveLength(1);
    expect(filterIssues(issues, { status: 'active' })).toHaveLength(1);
    expect(filterIssues(issues, { status: 'all', plant: 'SR' })).toHaveLength(1);
    expect(filterIssues(issues, { status: 'all', query: 'k05' })).toHaveLength(1);
  });
});

describe('waivers', () => {
  const warn = { rule: 'K05', scope: 'row', plant: 'BP', partNumber: 'P1', dockCode: 'D', month: "Mar'26", level: 'warning' };
  const NOW = new Date(2026, 1, 10);

  it('waive / unwaive with an in-memory adapter', () => {
    const store = createWaiverStore(memoryAdapter());
    expect(store.waive({ issue: warn, reason: 'ab', productionMonth: PM, today: NOW }).ok).toBe(false);
    expect(store.waive({ issue: { ...warn, level: 'error' }, reason: 'มีเหตุผล', productionMonth: PM, today: NOW }).ok).toBe(false);
    const res = store.waive({ issue: warn, reason: 'ลูกค้ายืนยันแล้ว', productionMonth: PM, today: NOW });
    expect(res.ok).toBe(true);
    const marked = applyWaivers([warn], store.active(NOW), { productionMonth: PM, today: NOW });
    expect(marked[0]).toMatchObject({ waived: true, reason: 'ลูกค้ายืนยันแล้ว' });
    expect(store.unwaive(res.key)).toBe(true);
    expect(applyWaivers([warn], store.active(NOW), { productionMonth: PM, today: NOW })[0].waived).toBeFalsy();
  });

  it('does not apply to another production month and ignores expired waivers', () => {
    const store = createWaiverStore(memoryAdapter());
    store.waive({ issue: warn, reason: 'ตกลงแล้ว', productionMonth: PM, today: NOW });
    const other = { year: 2026, month: 3 };
    expect(waiverKey(warn, PM)).not.toBe(waiverKey(warn, other));
    expect(applyWaivers([warn], store.all(), { productionMonth: other, today: NOW })[0].waived).toBeFalsy();
    expect(applyWaivers([warn], store.all(), { productionMonth: PM, today: new Date(2026, 2, 1) })[0].waived).toBeFalsy(); // expired
    expect(applyWaivers([warn], store.all(), { productionMonth: PM, today: new Date(2026, 1, 28) })[0].waived).toBe(true); // last day still valid
  });

  it('engine marks waived issues; errors can never be waived', () => {
    const b = clone();
    const issues = run({}, b);
    const target = issues.find((i) => i.level !== 'error');
    const store = createWaiverStore(memoryAdapter());
    store.waive({ issue: target, reason: 'รับทราบแล้ว', productionMonth: PM, today: TODAY });
    const again = run({ waivers: store.all() }, b);
    expect(again.filter((i) => i.waived).length).toBeGreaterThan(0);
    expect(again.filter((i) => i.waived).every((i) => i.level !== 'error')).toBe(true);
  });

  it('survives a throwing storage adapter', () => {
    const store = createWaiverStore({ read: () => { throw new Error('x'); }, write: () => { throw new Error('y'); } });
    expect(store.waive({ issue: warn, reason: 'ทดสอบ', productionMonth: PM, today: NOW }).ok).toBe(true);
    expect(Object.keys(store.all())).toHaveLength(1);
  });
});

describe('feature contract', () => {
  const state = () => ({ processedData: base.data, sourceFiles: base.files, productionMonth: PM, template, features: {}, profile: {} });
  const ctx = (over = {}) => ({ state: { ...state(), ...over }, actions: {}, today: TODAY });

  it('is a valid feature with validate, settings and exportSheets', () => {
    expect(validateFeature(feature)).toEqual([]);
    expect(feature.group).toBe('ตรวจสอบ');
    ['validate', 'exportSheets', 'onProcessed'].forEach((k) => expect(typeof feature[k]).toBe('function'));
    expect(feature.settings.defaults.rules).toEqual({});
    expect(feature.settings.Component).toBeTruthy();
  });

  it('badge counts only errors that are not waived', () => {
    const b = clone();
    const row = b.data['BP Daily'][0];
    row.rawRow[row.colPositions.nCol] += 3;
    const c = ctx({ processedData: b.data, sourceFiles: b.files });
    expect(feature.tab.badge(c)).toEqual({ count: 1, severity: 'error' });
    expect(ctx().state.processedData).not.toBe(c.state.processedData);
    expect(feature.tab.badge(ctx())).toEqual({ count: 0, severity: 'error' });
  });

  it('validate returns contract issues the runtime accepts (error -> confirm, warning -> info)', () => {
    const b = clone();
    const row = b.data['BP Daily'][0];
    row.rawRow[row.colPositions.nCol] += 3;
    const out = collectIssues([feature], ctx({ processedData: b.data, sourceFiles: b.files }));
    expect(out.filter((i) => i.level === 'confirm')).toHaveLength(1);
    expect(out.filter((i) => i.level === 'block')).toHaveLength(0);
    expect(out[0]).toMatchObject({ code: 'R01', featureId: 'qa-engine', qaLevel: 'error' });
    expect(toContractIssue({ rule: 'M03', level: 'warning' })).toMatchObject({ level: 'info', qaLevel: 'warning' });
    expect(toContractIssue({ rule: 'R01', level: 'error' })).toMatchObject({ level: 'confirm', qaLevel: 'error' });
    // the round trip is exact through qaLevel
    ['error', 'warning', 'info'].forEach((level) => expect(fromContractIssue(toContractIssue({ rule: 'X1', level })).level).toBe(level));
  });

  it('QA Report sheet: findings + 1 rows, follows the export option, keeps waived rows', () => {
    const on = feature.exportSheets(ctx());
    const issues = runRules({ processedData: base.data, sourceFiles: base.files, productionMonth: PM, template, today: TODAY });
    expect(on).toHaveLength(1);
    expect(on[0].name).toBe('QA Report');
    expect(on[0].aoa).toHaveLength(issues.length + 1);
    expect(on[0].aoa[0]).toEqual(['กฎ', 'ระดับ', 'โรงงาน', 'ไฟล์', 'Part Number', 'Dock', 'ชีต/แถว', 'รายละเอียด', 'วิธีแก้', 'ค่าที่คาด', 'ค่าจริง', 'สถานะ']);
    expect(on[0].defaultOn).toEqual({ internal: true, external: false });
    expect(feature.exportSheets(ctx({ features: { 'qa-engine': { exportSheet: false } } }))).toEqual([]);
    expect(feature.exportSheets(ctx({ profile: { exportTarget: 'external' } }))).toEqual([]);

    const target = issues.find((i) => i.level === 'info');
    const store = createWaiverStore(memoryAdapter());
    store.waive({ issue: target, reason: 'ตรวจแล้วปกติ', productionMonth: PM, today: TODAY });
    const withWaiver = feature.exportSheets(ctx({ features: { 'qa-engine': { waivers: store.all() } } }))[0];
    expect(withWaiver.aoa).toHaveLength(issues.length + 1);
    expect(withWaiver.aoa.some((r) => r[11] === 'รับทราบ: ตรวจแล้วปกติ')).toBe(true);
  });
});
