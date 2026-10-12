import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeSteps } from '../src/features/onboarding/steps.js';
import { loadSamples } from '../src/features/onboarding/loadSamples.js';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { categorizeFile } from '../src/lib/excel/categorize.js';
import { PLANTS } from '../src/constants.js';

const file = (name, category, status = 'ready') => ({ id: name, name, category, status });
const base = (o = {}) => {
  const sourceFiles = o.sourceFiles || [];
  return {
    template: null, sourceFiles, processedData: null, isStale: false, processedSignature: 'sig', lastExport: null, features: {},
    fileCounts: Object.fromEntries(PLANTS.map((p) => [p, sourceFiles.filter((f) => f.category === p).length])),
    ...o,
  };
};
const cur = (steps) => steps.find((s) => s.status === 'current')?.id;
const st = (steps, id) => steps.find((s) => s.id === id);
const files = [file('BP a.xls', 'BP'), file('BPK a.xls', 'BPK'), file('GW a.xls', 'GW'), file('GW b.xls', 'GW')];

describe('computeSteps', () => {
  it('empty state: 5 steps, step 1 current', () => {
    const s = computeSteps(base());
    expect(s).toHaveLength(5);
    expect(cur(s)).toBe('template');
  });
  it('template only -> step 2 current', () => {
    const s = computeSteps(base({ template: { name: 't.xlsx' } }));
    expect(st(s, 'template').status).toBe('done');
    expect(cur(s)).toBe('sources');
  });
  it('files without template -> step 3 current, step 1 hints skip', () => {
    const s = computeSteps(base({ sourceFiles: files }));
    expect(cur(s)).toBe('process');
    expect(st(s, 'template').hint).toContain('ข้าม');
  });
  it('stale -> step 3 current with "ประมวลผลใหม่"', () => {
    const s = computeSteps(base({ sourceFiles: files, processedData: {}, isStale: true }));
    expect(cur(s)).toBe('process');
    expect(st(s, 'process').hint).toContain('ประมวลผลใหม่');
  });
  it('processed with error finding -> step 4 current; acknowledged -> done', () => {
    const state = base({ sourceFiles: files, processedData: {} });
    expect(cur(computeSteps(state, [{ level: 'error' }]))).toBe('review');
    const ack = computeSteps(state, [{ level: 'error', acknowledged: true }, { level: 'warning' }]);
    expect(st(ack, 'review').status).toBe('done');
    expect(cur(ack)).toBe('export');
  });
  it('review step follows the export gate: confirm items stay open, warnings are amber information', () => {
    const state = base({ sourceFiles: files, processedData: {} });
    const needs = computeSteps(state, undefined, { issues: [{ level: 'confirm', qaLevel: 'error' }, { level: 'info', qaLevel: 'warning' }] });
    expect(cur(needs)).toBe('review');
    expect(st(needs, 'review').hint).toBe('ต้องยืนยัน 1 รายการก่อนดาวน์โหลด');
    const warned = computeSteps(state, undefined, { issues: [{ level: 'info', qaLevel: 'warning' }, { level: 'info', qaLevel: 'warning' }, { level: 'info' }] });
    expect(st(warned, 'review')).toMatchObject({ status: 'done', hint: 'ไม่มีข้อผิดพลาด · มีคำเตือน 2 รายการ', note: 'warning' });
    const clean = computeSteps(state, undefined, { issues: [{ level: 'info' }] });
    expect(st(clean, 'review')).toMatchObject({ status: 'done', hint: 'ไม่พบสิ่งที่ต้องแก้' });
  });
  it('no findings store counts as reviewed', () => {
    expect(st(computeSteps(base({ sourceFiles: files, processedData: {} })), 'review').status).toBe('done');
  });
  it('lastExport matching the signature -> step 5 done', () => {
    const s = computeSteps(base({ sourceFiles: files, processedData: {}, lastExport: { signature: 'sig' } }));
    expect(st(s, 'export').status).toBe('done');
    expect(cur(s)).toBeUndefined();
    const other = computeSteps(base({ sourceFiles: files, processedData: {}, lastExport: { signature: 'old' } }));
    expect(st(other, 'export').status).toBe('current');
  });
  it('hint lists plants with zero files only', () => {
    const hint = st(computeSteps(base({ sourceFiles: files })), 'sources').hint;
    expect(hint).toContain('BP 1 · BPK 1 · GW 2 · SR 0');
    expect(hint).toContain('ขาด: SR');
    expect(hint).not.toMatch(/ขาด:.*(BP|GW)/);
    const all = st(computeSteps(base({ sourceFiles: [...files, file('SR a.xls', 'SR')] })), 'sources').hint;
    expect(all).not.toContain('ขาด');
  });
  it('tolerates a nearly empty state object', () => {
    expect(computeSteps({})).toHaveLength(5);
    expect(computeSteps()).toHaveLength(5);
  });
});

describe('fetch isolation', () => {
  it('fetch( appears only in src/features/onboarding/loadSamples.js (relative URLs)', () => {
    const hits = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(e.name) && /\bfetch\s*\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative('src', p));
    });
    walk('src');
    expect(hits).toEqual([path.join('features', 'onboarding', 'loadSamples.js')]);
    expect(fs.readFileSync('src/features/onboarding/loadSamples.js', 'utf8')).not.toMatch(/https?:\/\//);
  });
});

describe('sample set', () => {
  const dir = 'public/samples';
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  it('manifest matches categorizeFile and parsed rows', () => {
    expect(manifest.demo).toBe(true);
    const parts = new Set();
    manifest.sources.forEach((name) => {
      expect(categorizeFile(name)).toBeTruthy();
      const b = fs.readFileSync(path.join(dir, name));
      const { rows, meta } = readSourceBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      expect(rows.length).toBe(manifest.expected.rows[name]);
      expect(meta.productionMonthRaw).toBe(manifest.productionMonth);
      rows.forEach((r) => parts.add(r.partNumber));
    });
    expect([...parts].sort()).toEqual(manifest.expected.partNumbers);
  });
  it('covers every plant', () => {
    expect(new Set(manifest.sources.map(categorizeFile))).toEqual(new Set(PLANTS));
  });
});

describe('loadSamples', () => {
  const mkActions = () => {
    const calls = [];
    const rec = (n) => (...a) => { calls.push([n, ...a]); };
    return { calls, clearSourceFiles: rec('clear'), setTemplateFile: rec('tpl'), setDemo: rec('demo'), addSourceFiles: rec('add'), setFeatureData: rec('fd'), setNotice: rec('notice') };
  };
  it('notices in Thai instead of throwing when the manifest is missing', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    try {
      const a = mkActions();
      expect(await loadSamples(a)).toBe(false);
      expect(a.calls.find((c) => c[0] === 'notice')[1]).toContain('ไม่พบข้อมูลตัวอย่าง');
    } finally { globalThis.fetch = orig; }
  });
  it('loads files with relative URLs and flags demo', async () => {
    const orig = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async (u) => {
      urls.push(u);
      if (u.endsWith('manifest.json')) return { ok: true, json: async () => JSON.parse(fs.readFileSync('public/samples/manifest.json', 'utf8')) };
      return { ok: true, blob: async () => new Blob(['x']) };
    };
    try {
      const a = mkActions();
      expect(await loadSamples(a)).toBe(true);
      expect(urls.every((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('/'))).toBe(true);
      const names = a.calls.map((c) => c[0]);
      expect(names).toContain('demo');
      expect(a.calls.find((c) => c[0] === 'add')[1]).toHaveLength(5);
      expect(a.calls.find((c) => c[0] === 'fd')[2].demoNotice).toContain('ข้อมูลสังเคราะห์');
    } finally { globalThis.fetch = orig; }
  });
});
