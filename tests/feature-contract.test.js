import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defineFeature, validateFeatureList } from '../src/features/defineFeature.js';
import { runHook, collectGate, collectExportSheets, collectCellWrites, collectIssues } from '../src/features/runtime.js';
import { visibleFeatures } from '../src/features/visibility.js';
import { splitTabs } from '../src/components/TabBar.jsx';

const ok = { id: 'my-feature', order: 75, tab: { label: 'ทดสอบ', Component: () => null } };

describe('defineFeature', () => {
  it('accepts a valid spec and defaults group to วิเคราะห์', () => {
    expect(defineFeature(ok, { dev: true }).group).toBe('วิเคราะห์');
  });
  it('throws Thai errors in DEV for bad id / band / key / tab.label / order', () => {
    expect(() => defineFeature({ id: 'Bad Id', order: 75 }, { dev: true })).toThrow(/kebab-case/);
    expect(() => defineFeature({ ...ok, group: 'ตรวจสอบ' }, { dev: true })).toThrow(/อยู่นอกช่วง/);
    expect(() => defineFeature({ ...ok, foo: 1 }, { dev: true })).toThrow(/ไม่รู้จักคีย์ "foo"/);
    expect(() => defineFeature({ ...ok, tab: { Component: () => null } }, { dev: true })).toThrow(/tab\.label/);
    expect(() => defineFeature({ id: 'x' }, { dev: true })).toThrow(/order/);
  });
  it('warns and returns null outside DEV', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(defineFeature({ id: 'Bad Id' }, { dev: false })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('detects duplicate ids and passes an empty list', () => {
    expect(validateFeatureList([ok, { ...ok }]).join()).toMatch(/ซ้ำ/);
    expect(validateFeatureList([])).toEqual([]);
  });
});

describe('runHook', () => {
  it('swallows exceptions and reports', () => {
    const report = vi.fn();
    const f = { id: 'boom', tab: { label: 'บูม' }, onProcessed: () => { throw new Error('x'); } };
    expect(runHook(f, 'onProcessed', [{}], report)).toBeUndefined();
    expect(report.mock.calls[0][0].message).toBe('ฟีเจอร์ "บูม" ทำงานผิดพลาด (onProcessed) — ข้ามไปก่อน');
  });
  it('passes args and ignores missing hooks', () => {
    expect(runHook({ id: 'a', validate: (c) => c.v }, 'validate', [{ v: 3 }])).toBe(3);
    expect(runHook({ id: 'a' }, 'validate', [{}])).toBeUndefined();
  });
});

describe('collectExportSheets', () => {
  const sheet = (name) => ({ name, aoa: [[1]] });
  it('handles async, throwing, duplicate, long and protected names', async () => {
    const report = vi.fn();
    const features = [
      { id: 'a', exportSheets: async () => [sheet('Async')] },
      { id: 'b', exportSheets: () => { throw new Error('no'); } },
      { id: 'c', exportSheets: () => [sheet('async'), sheet('x'.repeat(32)), sheet('Summary'), sheet('Fine')] },
    ];
    const { sheets, rejected } = await collectExportSheets(features, {}, { protectedSheets: ['Summary', 'BP Daily'], report });
    expect(sheets.map((s) => s.name)).toEqual(['Async', 'Fine']);
    expect(rejected).toHaveLength(3);
    expect(report.mock.calls.some(([r]) => r.feature.id === 'b')).toBe(true);
    expect(rejected.map((r) => r.reason).join()).toMatch(/31|ซ้ำ/);
  });
  it('collects cell writes', async () => {
    expect(await collectCellWrites([{ id: 'a', exportCellWrites: () => [{ sheet: 'S', ref: 'A1', value: 1 }] }], {})).toHaveLength(1);
  });
});

describe('collectGate', () => {
  it('orders block > confirm > info and merges templateIssues', () => {
    const features = [
      { id: 'a', validate: () => [{ level: 'info', code: 'i', message: 'i' }], beforeExport: () => [{ level: 'block', code: 'b', message: 'b' }] },
      { id: 'b', validate: () => [{ level: 'confirm', code: 'c', message: 'c' }] },
    ];
    const gate = collectGate(features, {}, undefined, [{ level: 'block', code: 't', message: 't' }, { level: 'info', code: 't2', message: 't2' }]);
    expect(gate.map((i) => i.level)).toEqual(['block', 'block', 'confirm', 'info', 'info']);
    expect(gate.map((i) => i.code)).toContain('t');
    expect(collectIssues(features, {}).every((i) => i.featureId)).toBe(true);
  });
});

describe('visibleFeatures', () => {
  const list = [
    { id: 'core1', group: 'core' }, { id: 'qa', group: 'ตรวจสอบ' }, { id: 'ana', group: 'วิเคราะห์' },
    { id: 'hist', group: 'ประวัติ' }, { id: 'nogroup' },
  ];
  const ids = (p, o) => visibleFeatures(list, p, o).map((f) => f.id);
  it('simple keeps only core/ตรวจสอบ; no group counts as วิเคราะห์', () => {
    expect(ids({ ui: { mode: 'simple' } })).toEqual(['core1', 'qa']);
    expect(ids({ ui: { mode: 'advanced' } })).toHaveLength(5);
  });
  it('enabled:false removes in both modes; keepIds overrides mode', () => {
    expect(ids({ ui: { mode: 'advanced' }, features: { qa: { enabled: false } } })).not.toContain('qa');
    expect(ids({ ui: { mode: 'simple' }, features: { qa: { enabled: false } } })).not.toContain('qa');
    expect(ids({ ui: { mode: 'simple' } }, { keepIds: new Set(['ana']) })).toContain('ana');
  });
});

describe('TabBar.splitTabs', () => {
  const tabs = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
  it('shows at most 7 and keeps the active tab visible', () => {
    const { visible, overflow } = splitTabs(tabs, 't0');
    expect(visible).toHaveLength(7);
    expect(overflow).toHaveLength(3);
    const r = splitTabs(tabs, 't9');
    expect(r.visible).toHaveLength(7);
    expect(r.visible.map((t) => t.id)).toContain('t9');
  });
  it('no overflow when <= 7', () => expect(splitTabs(tabs.slice(0, 7), 't0').overflow).toEqual([]));
});

describe('registry', () => {
  it('every src/features/*/index.jsx satisfies the contract', async () => {
    const mods = import.meta.glob('../src/features/*/index.jsx', { eager: true });
    const list = Object.values(mods).map((m) => m.default);
    expect(validateFeatureList(list)).toEqual([]);
  });
  it('no static xlsx/jszip imports outside src/lib/excel', () => {
    const bad = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!p.endsWith(path.join('src', 'lib', 'excel'))) walk(p); }
      else if (/\.(jsx?|mjs)$/.test(e.name) && /^\s*import[^'"]*['"](xlsx|jszip)['"]/m.test(fs.readFileSync(p, 'utf8'))) bad.push(p);
    });
    walk(path.resolve('src'));
    expect(bad).toEqual([]);
  });
});
