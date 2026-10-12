import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { groupRows, multiDockParts, deliveryDays, basePartNumber, allRows } from '../src/features/dock-analysis/logic.js';
import { toBoxes, isExactMultiple, buildBoxRows, readPackingTypeMap, packingTypeFor } from '../src/features/dock-analysis/packaging.js';
import { parseMasterJson, validateMaster, emptyMaster, exportMasterJson, dockLabel, loadMaster, saveMaster, setPallet } from '../src/features/dock-analysis/master.js';
import { buildSheets, buildByDockAoa } from '../src/features/dock-analysis/sheets.js';

let data;
beforeAll(() => {
  data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  SOURCE_FILES.forEach((f) => {
    const { rows, meta } = readSourceBuffer(fixture(f));
    const plant = categorizeFile(f.split('/')[1]);
    rows.forEach((r) => { r.plant = plant; r.partType = meta.partType || ''; });
    data[`${plant} Daily`].push(...rows);
  });
});
const find = (gs, f) => gs.find(f);

describe('groupRows', () => {
  it('by dock: 6 groups with plant+dock key', () => {
    const gs = groupRows(data, { by: 'dock' });
    expect(gs).toHaveLength(6);
    const g = (p, d) => find(gs, (x) => x.plant === p && x.dockCode === d);
    expect([g('BPK', 'D1').parts, g('BPK', 'D1').n]).toEqual([8, 22450]);
    expect([g('BPK', 'BN').parts, g('BPK', 'BN').n]).toEqual([4, 1210]);
    expect([g('GW', 'Z1').parts, g('GW', 'Z1').n, g('GW', 'Z1').shippingDocks]).toEqual([2, 10298, []]);
    expect([g('GW', 'G2').parts, g('GW', 'G2').n, g('GW', 'G2').shippingDocks]).toEqual([3, 7296, ['R1']]);
    expect([g('BP', 'P1').parts, g('BP', 'P1').n]).toEqual([8, 5399]);
    expect([g('SR', 'S1').parts, g('SR', 'S1').n]).toEqual([4, 2281]);
  });
  it('by plant, carFamily, basePart', () => {
    expect(groupRows(data, { by: 'plant' })).toHaveLength(4);
    const cf = groupRows(data, { by: 'carFamily' });
    const n = (k) => cf.find((x) => x.key === k).n;
    expect([n('024J'), n('D33H'), n('D41H')]).toEqual([31340, 10298, 7296]);
    const bp = groupRows(data, { by: 'basePart' });
    expect(bp).toHaveLength(15);
    expect(bp.reduce((s, g) => s + g.n, 0)).toBe(48934);
    const g = bp.find((x) => x.key === '86790-0K051');
    expect([g.n, g.n1, g.n2, g.n3]).toEqual([9673, 12094, 8906, 3950]);
  });
  it('basePartNumber and filters', () => {
    expect(basePartNumber('86790-0K051-00')).toBe('86790-0K051');
    expect(basePartNumber('AB')).toBe('AB');
    expect(groupRows(data, { by: 'plant', plants: ['SR'] })).toHaveLength(1);
    expect(allRows(data, { partType: 'P' }).length).toBeGreaterThan(0);
  });
});

describe('multiDockParts / deliveryDays', () => {
  it('3 BPK parts only', () => {
    const m = multiDockParts(data);
    expect(m).toHaveLength(3);
    expect(m.every((x) => x.plant === 'BPK')).toBe(true);
    expect(m.map((x) => x.partNumber.slice(6, 11)).sort()).toEqual(['0K051', '0K110', '0K190']);
  });
  it('delivery days', () => {
    const sr = data['SR Daily'].find((r) => r.partNumber.includes('0K141'));
    expect(deliveryDays([sr], 0).days).toBe(2);
    const d1 = groupRows(data, { by: 'dock' }).find((g) => g.plant === 'BPK' && g.dockCode === 'D1');
    expect(deliveryDays(d1.rows, 0).days).toBe(22);
    expect(deliveryDays([], 0)).toEqual({ days: 0, peak: 0, peakDay: null });
  });
});

describe('packaging', () => {
  it('toBoxes', () => {
    expect(toBoxes(640, 25)).toBe(26);
    expect(toBoxes(5790, 30)).toBe(193);
    [0, '', 'abc', null, undefined, -5, 2.5].forEach((s) => expect(toBoxes(100, s)).toBeNull());
    expect(isExactMultiple(600, 30)).toBe(true);
    expect(isExactMultiple(640, 25)).toBe(false);
  });
  it('group boxes = sum of per-row ceil', () => {
    const g = groupRows(data, { by: 'dock' }).find((x) => x.plant === 'BPK' && x.dockCode === 'BN');
    expect(g.boxes.n).toBe(g.rows.reduce((s, r) => s + toBoxes(r.n, r.packingSize), 0));
  });
  it('not-exact counts', () => {
    const count = (rows) => buildBoxRows(rows, null, null).filter((b) => !b.exact).length;
    expect(count(allRows(data, { partType: 'P' }))).toBe(3);
    expect(count(allRows(data))).toBe(17);
  });
  it('template map and inference', async () => {
    const map = await readPackingTypeMap(fixture('template.xlsx'));
    expect(map.size).toBe(8);
    expect(packingTypeFor(map, null, { basePart: '86790-0K051', plant: 'BPK', dock: 'D1' })).toEqual({ type: 'SN1', inferred: false });
    expect(packingTypeFor(map, null, { basePart: '86790-0K051', plant: 'BPK', dock: 'BN' }).type).toBe('TP1');
    expect(packingTypeFor(map, null, { basePart: '86790-XXXXX', plant: 'BPK', dock: 'BN' })).toEqual({ type: 'TP1', inferred: true });
    expect(packingTypeFor(map, null, { basePart: '86790-0K051', plant: 'BP', dock: 'P1' })).toEqual({ type: '', inferred: false });
    const master = { docks: { 'BPK|D1': { packingType: 'ZZ' } }, pallets: {} };
    expect(packingTypeFor(map, master, { basePart: '86790-0K051', plant: 'BPK', dock: 'D1' }).type).toBe('ZZ');
    expect(await readPackingTypeMap(new ArrayBuffer(8))).toEqual(new Map());
  });
  it('pallets need master', () => {
    const rows = data['BPK Daily'].filter((r) => r.partNumber.includes('0K051') && r.dockCode === 'D1');
    expect(buildBoxRows(rows, null, null)[0].pallets.n).toBeNull();
    const master = setPallet(emptyMaster(), 'BPK|86790-0K051|D1', 20);
    const b = buildBoxRows(rows, master, null)[0];
    expect(b.pallets.n).toBe(Math.ceil(b.boxes.n / 20));
  });
});

describe('master', () => {
  it('validates, round trips and rejects bad input', () => {
    const m = { docks: { 'BPK|BN': { alias: 'CPN-TP', packingType: 'TP1' } }, pallets: { 'BPK|86790-0K051|D1': 20 } };
    const r = parseMasterJson(exportMasterJson(m));
    expect(r.ok).toBe(true);
    expect(r.master).toEqual(m);
    expect(dockLabel(m, 'BPK', 'BN')).toBe('BN (CPN-TP)');
    expect(dockLabel(m, 'BPK', '')).toBe('-');
    ['{bad', 'null', '[]', JSON.stringify({ docks: { a: { alias: 'x'.repeat(41) } } }), JSON.stringify({ pallets: { a: 0 } }), JSON.stringify({ pallets: { a: 10001 } })].forEach((t) => {
      const x = parseMasterJson(t);
      expect(x.ok).toBe(false);
      expect(x.error).toMatch(/[ก-๙]/);
      expect(x.master).toEqual(emptyMaster());
    });
    expect(parseMasterJson('x'.repeat(200 * 1024 + 1)).ok).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`P|${i}`, { alias: 'a' }]));
    expect(validateMaster({ docks: many }).ok).toBe(false);
  });
  it('storage failures do not throw', () => {
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadMaster(bad)).toEqual(emptyMaster());
    expect(saveMaster(emptyMaster(), bad)).toBe(false);
    const mem = new Map();
    const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    saveMaster({ docks: {}, pallets: { 'a|b|c': 5 } }, st);
    expect(loadMaster(st).pallets['a|b|c']).toBe(5);
  });
});

describe('sheets', () => {
  it('By Dock shape', () => {
    const aoa = buildByDockAoa(data);
    expect(aoa).toHaveLength(30);
    expect(aoa[0].slice(0, 4)).toEqual(['PART NUMBER', 'PLANT', 'DOCK CODE', 'SHIPPING DOCK']);
    const r = aoa.find((x) => x[0] === '86790-0K051-00' && x[1] === 'BPK' && x[2] === 'BN');
    expect([r[4], r[5]]).toEqual([640, 650]);
  });
  it('off unless opted in; unique names', () => {
    expect(buildSheets(data, {})).toEqual([]);
    const s = buildSheets(data, { dock: true, carFamily: true, boxes: true }, null, null);
    expect(s.map((x) => x.name)).toEqual(['By Dock', 'By Car Family', 'Boxes']);
  });
});
