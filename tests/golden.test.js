// Golden regression: the exported workbook is compared cell-by-cell with tests/golden/export-cells.json.
//   UPDATE_GOLDEN=1 npm test   re-baselines export-cells.json and export.sha256
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { buildSummary } from '../src/lib/excel/aggregate.js';
import { snapshotWorkbook, diffSnapshots } from './helpers/snapshot.js';
import { fixture, loadProcessedData } from './helpers.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');
const CELLS = path.join(dir, 'export-cells.json');
const SHA = path.join(dir, 'export.sha256');
const NOW = new Date('2026-01-23T00:00:00Z');
const update = process.env.UPDATE_GOLDEN === '1';

const exportOnce = async (extra = {}) => {
  const processedData = await loadProcessedData();
  const { summary } = buildSummary(processedData);
  const { blob, report } = await buildExport({ template: { buffer: fixture('template.xlsx') }, processedData, summaryData: summary, ...extra });
  return { buffer: await blob.arrayBuffer(), report };
};
const sha = (buffer) => crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

let out;
beforeAll(async () => { out = await exportOnce({ now: NOW }); });

describe('golden export', () => {
  it('re-baselines when UPDATE_GOLDEN=1', async () => {
    if (!update) return;
    fs.mkdirSync(dir, { recursive: true });
    const snap = await snapshotWorkbook(out.buffer);
    const lines = Object.entries(snap.cells).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    fs.writeFileSync(CELLS, `{\n"meta": ${JSON.stringify(snap.meta)},\n"parts": ${JSON.stringify(snap.parts)},\n"cells": {\n${lines.join(',\n')}\n}}\n`);
    fs.writeFileSync(SHA, `${sha(out.buffer)}\n`);
  });

  it('matches the committed cell snapshot', async () => {
    const expected = JSON.parse(fs.readFileSync(CELLS, 'utf8'));
    const diff = diffSnapshots(expected, await snapshotWorkbook(out.buffer));
    expect(diff, `golden diff (UPDATE_GOLDEN=1 npm test to accept):\n${diff.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('a changed written value fails naming the cell', async () => {
    const expected = JSON.parse(fs.readFileSync(CELLS, 'utf8'));
    const actual = await snapshotWorkbook(out.buffer);
    const first = actual.cells['BP Daily!A14'];
    expect(first).toBeTruthy();
    const tampered = { ...actual, cells: { ...actual.cells, 'BP Daily!A14': { ...first, v: 'CHANGED' } } };
    const diff = diffSnapshots(expected, tampered);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toContain('BP Daily!A14');
  });

  it('is byte-identical for the same injected now (sha256) and matches the committed hash', async () => {
    const again = await exportOnce({ now: NOW });
    expect(sha(again.buffer)).toBe(sha(out.buffer));
    if (!update) expect(sha(out.buffer)).toBe(fs.readFileSync(SHA, 'utf8').trim());
  });

  it('without now the export is still a valid workbook', async () => {
    const free = await exportOnce();
    const snap = await snapshotWorkbook(free.buffer);
    expect(Object.keys(snap.cells).length).toBeGreaterThan(100);
    expect(free.report.mode).toBe('template');
  });
});
