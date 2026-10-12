import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { buildPrintSections } from '../src/features/daily-grid/print.js';
import {
  DEFAULT_SETTINGS, loadSettings, saveSettings, tsvCell, toTsv, buildColumns, buildGridItems, overDays, plantKpis, sumItems,
} from '../src/features/daily-grid/views.js';
import { computeWindow } from '../src/features/daily-grid/useWindowedRows.js';
import feature from '../src/features/daily-grid/index.jsx';

let data;
beforeAll(() => {
  data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  SOURCE_FILES.forEach((f) => {
    const { rows } = readSourceBuffer(fixture(f));
    data[`${categorizeFile(f.split('/')[1])} Daily`].push(...rows);
  });
});

describe('settings', () => {
  it('falls back to defaults when storage throws', () => {
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, bad)).toBe(false);
  });
  it('ignores garbage and round-trips valid values', () => {
    expect(loadSettings({ getItem: () => 'not json' })).toEqual(DEFAULT_SETTINGS);
    let saved;
    saveSettings({ ...DEFAULT_SETTINGS, preset: 'all', capacity: '500' }, { setItem: (_, v) => { saved = v; } });
    expect(loadSettings({ getItem: () => saved })).toMatchObject({ preset: 'all', capacity: '500', includeInExport: false });
  });
});

describe('grid', () => {
  it('all-months preset has 128 numeric columns', () => {
    expect(buildColumns('all', { year: 2026, month: 2 })).toHaveLength(128);
    expect(buildColumns('total', null)).toHaveLength(4);
    expect(buildColumns('m1', null)).toHaveLength(32);
  });
  it('merged view: one row per part', () => {
    const items = buildGridItems(data, { view: 'merged' });
    expect(items).toHaveLength(15);
    const p = items.find((i) => i.partNumber === '86790-0K051-00');
    expect(p.days[0][1]).toBe(446);
    expect(p.totals[0]).toBe(9673);
  });
  it('dock view has group rows and search filters', () => {
    const items = buildGridItems(data, { view: 'dock', plant: 'BPK' });
    expect(items.filter((i) => i.type === 'group').length).toBeGreaterThanOrEqual(2);
    expect(buildGridItems(data, { view: 'merged', search: '86790-0k051' }).length).toBeGreaterThan(0);
    expect(buildGridItems(data, { view: 'merged', search: 'zzzz' })).toHaveLength(0);
  });
  it('capacity counts days over and KPIs', () => {
    const items = buildGridItems(data, { view: 'plant', plant: 'BP' });
    expect(overDays(items, 'plant', 0)).toBe(0);
    expect(overDays(items, 'plant', 1)).toBeGreaterThan(0);
    const k = plantKpis(data, 0).find((x) => x.plant === 'BP');
    expect(k.total).toBe(sumItems(items).totals[0]);
    expect(k.peak).toBeGreaterThan(0);
  });
  it('windowing only above the threshold', () => {
    expect(computeWindow(50, 0, 600).windowed).toBe(false);
    const w = computeWindow(1000, 2800, 600, { rowHeight: 28, overscan: 5 });
    expect(w.start).toBe(95);
    expect(w.padTop).toBe(95 * 28);
    expect(w.end).toBeLessThan(1000);
  });
});

describe('TSV', () => {
  it('prefixes formula-looking cells with a quote', () => {
    expect(tsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(tsvCell('-5x')).toBe("'-5x");
    expect(tsvCell('+1')).toBe("'+1");
    expect(tsvCell('@a')).toBe("'@a");
    expect(tsvCell('86790-0K051-00')).toBe('86790-0K051-00');
    expect(tsvCell(12)).toBe('12');
    expect(toTsv([['a', '=b'], [1, 2]])).toBe("a\t'=b\n1\t2");
  });
});

describe('print sections', () => {
  it('orders BP, BPK, GW, SR and splits by dock', () => {
    const s = buildPrintSections(data, { groupByDock: true });
    const plants = s.map((x) => x.plant);
    expect(plants).toEqual([...plants].sort((a, b) => ['BP', 'BPK', 'GW', 'SR'].indexOf(a) - ['BP', 'BPK', 'GW', 'SR'].indexOf(b)));
    expect(new Set(plants)).toEqual(new Set(['BP', 'BPK', 'GW', 'SR']));
    expect(s.filter((x) => x.plant === 'BPK').length).toBeGreaterThanOrEqual(2);
    expect(buildPrintSections(data, { groupByDock: false }).filter((x) => x.plant === 'BPK')).toHaveLength(1);
  });
  it('drops all-zero rows unless includeZero', () => {
    const copy = { 'BP Daily': [{ ...data['BP Daily'][0], rawRow: new Array(150).fill(0) }, data['BP Daily'][1]] };
    expect(buildPrintSections(copy, { plant: 'BP', groupByDock: false })[0].rows).toHaveLength(1);
    expect(buildPrintSections(copy, { plant: 'BP', groupByDock: false, includeZero: true })[0].rows).toHaveLength(2);
  });
});

describe('feature export', () => {
  const mk = (include, view = 'merged') => ({
    state: { processedData: data, features: { 'daily-grid': { settings: { ...DEFAULT_SETTINGS, view, includeInExport: include } } } },
    actions: {},
    monthLabels: ['N', 'N+1', 'N+2', 'N+3'],
  });
  it('is off by default and has 15 rows in merged mode when on', () => {
    expect(feature.exportSheets(mk(false))).toEqual([]);
    const sheets = feature.exportSheets(mk(true));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('Daily Total');
    expect(sheets[0].aoa).toHaveLength(16);
    expect(sheets[0].aoa[0].slice(0, 3)).toEqual(['Part Number', 'Plant', 'Dock']);
  });
});
