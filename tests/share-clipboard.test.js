import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { buildSummary, computeTotals } from '../src/lib/excel/aggregate.js';
import { formatNumber } from '../src/utils/format.js';
import { escapeCellText, toTsv, toCsv, jsonSafe } from '../src/utils/serialize.js';
import { copyText, canShare, shareText } from '../src/utils/clipboard.js';
import { buildShareModel, buildShareText, buildShareTsv, SHORT_LIMIT } from '../src/features/share-clipboard/logic.js';

let state;
beforeAll(() => {
  const data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  const files = [];
  SOURCE_FILES.forEach((f) => {
    const { rows, meta } = readSourceBuffer(fixture(f));
    const plant = categorizeFile(f.split('/')[1]);
    data[`${plant} Daily`].push(...rows);
    files.push({ name: f.split('/')[1], category: plant, status: 'done', meta });
  });
  state = { processedData: data, summaryData: buildSummary(data).summary, sourceFiles: files, productionMonth: files[0].meta.productionMonth };
});
const labels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.'];

describe('serialize', () => {
  it('escapes formula prefixes but leaves numbers; flattens tabs/newlines', () => {
    expect(toTsv([['a', '=SUM(1)'], ['-5', '@x']])).toBe("a\t'=SUM(1)\n'-5\t'@x");
    expect(toTsv([[-5, 1234567, null, true, 'a\tb\nc']])).toBe('-5\t1234567\t\ttrue\ta b c');
  });
  it('strips bidi and control characters', () => {
    expect(escapeCellText('a‮b\u0001c')).toBe('abc');
    expect(escapeCellText('‮=1')).toBe("'=1");
    expect(escapeCellText(7)).toBe(7);
  });
  it('toCsv quotes per RFC 4180 with CRLF and BOM', () => {
    expect(toCsv([['a,b', 'q"x', 'l1\nl2', 3]])).toBe('﻿"a,b","q""x","l1\nl2",3');
    expect(toCsv([[1], [2]], { bom: false })).toBe('1\r\n2');
    expect(toCsv([['a;b', 'c']], { bom: false, delimiter: ';' })).toBe('"a;b";c');
  });
  it('jsonSafe sanitises nested strings', () => {
    expect(jsonSafe({ a: ['=1', { b: '‮x' }], n: -3 })).toEqual({ a: ["'=1", { b: 'x' }], n: -3 });
  });
});

describe('buildShareText', () => {
  it('short mode: totals match computeTotals, per-plant %, <= 1000 chars', () => {
    const m = buildShareModel(state, labels);
    const t = buildShareText(m, { mode: 'short' });
    const totals = computeTotals(state.summaryData);
    ['n', 'n1', 'n2', 'n3'].forEach((k) => expect(t).toContain(formatNumber(totals[k])));
    expect(t).toMatch(/• BP: [\d,]+ \(\d+\.\d%\)/);
    expect(t.length).toBeLessThanOrEqual(SHORT_LIMIT);
  });
  it('short mode drops movers then file, hard-caps length', () => {
    const m = { ...buildShareModel(state, labels), fileName: 'x'.repeat(2000) };
    expect(buildShareText(m, { mode: 'short' }).length).toBeLessThanOrEqual(SHORT_LIMIT);
  });
  it('full and en modes add detail', () => {
    const m = buildShareModel(state, labels);
    const full = buildShareText(m, { mode: 'full', lang: 'en', now: new Date(2026, 0, 1) });
    expect(full).toContain('Source files');
    expect(full).toContain('Generated');
    expect(buildShareText(m, { mode: 'short', lang: 'th' })).toContain('สรุปแผนการผลิต');
  });
  it('optional sections appear only when present and never throw when absent', () => {
    const base = buildShareText(buildShareModel(state, labels), { mode: 'full' });
    expect(base).not.toContain('QA:');
    const withQa = buildShareText(buildShareModel({ ...state, features: { qa: { findings: [{ level: 'block' }, { level: 'info' }] }, manifest: { hash: 'abcdef1234567' } } }, labels), { mode: 'full' });
    expect(withQa).toContain('QA: 2 (block 1)');
    expect(withQa).toContain('abcdef12');
    expect(() => buildShareModel({}, [])).not.toThrow();
    expect(() => buildShareModel({ features: { qa: 5, compare: null } }, undefined)).not.toThrow();
  });
  it('empty data gives a Thai placeholder; failed files are warned', () => {
    expect(buildShareText(buildShareModel({}, []), { mode: 'short' })).toBe('ยังไม่มีข้อมูลสรุป');
    const m = buildShareModel({ ...state, sourceFiles: [...state.sourceFiles, { name: 'bad.xls', status: 'error' }] }, labels);
    expect(buildShareText(m, { mode: 'short' })).toContain('bad.xls');
  });
  it('tsv mode: header + one row per part, tabs, no thousand separators', () => {
    const lines = buildShareText(buildShareModel(state, labels), { mode: 'tsv' }).split('\n');
    expect(lines).toHaveLength(state.summaryData.length + 1);
    expect(lines[0].split('\t')).toEqual(['Part Number', 'Plants', ...labels, 'รวม']);
    expect(lines[1]).not.toMatch(/\d,\d{3}/);
    expect(lines[1].split('\t')).toHaveLength(7);
    expect(buildShareTsv(buildShareModel(state, labels), { lang: 'en' }).split('\n')[0]).toContain('Total');
  });
});

describe('clipboard', () => {
  const g = globalThis;
  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('hi')).toEqual({ ok: true, method: 'clipboard' });
    expect(writeText).toHaveBeenCalledWith('hi');
    vi.unstubAllGlobals();
  });
  it('falls back to execCommand, then reports failure without throwing', async () => {
    const ta = { setAttribute() {}, select() {}, setSelectionRange() {}, remove() {}, style: {} };
    let exec = true;
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    vi.stubGlobal('document', { createElement: () => ta, body: { appendChild() {} }, execCommand: () => exec });
    expect(await copyText('x')).toEqual({ ok: true, method: 'execCommand' });
    exec = false;
    expect(await copyText('x')).toEqual({ ok: false, method: null });
    vi.unstubAllGlobals();
    expect(g.document).toBeUndefined();
    expect(await copyText('x')).toEqual({ ok: false, method: null });
  });
  it('canShare / shareText', async () => {
    vi.stubGlobal('navigator', {});
    expect(canShare()).toBe(false);
    expect(await shareText('a')).toBe(false);
    vi.stubGlobal('navigator', { share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) });
    expect(canShare()).toBe(true);
    expect(await shareText('a')).toBe(false);
    vi.stubGlobal('navigator', { share: () => Promise.resolve() });
    expect(await shareText('a')).toBe(true);
    vi.unstubAllGlobals();
  });
  it('navigator.clipboard is referenced only in src/utils/clipboard.js', () => {
    const hits = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('navigator.clipboard')) hits.push(path.relative('src', p));
    });
    walk('src');
    expect(hits).toEqual([path.join('utils', 'clipboard.js')]);
  });
});
