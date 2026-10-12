import { describe, it, expect } from 'vitest';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import { buildAnalyzeRows } from '../src/lib/excel/aggregate.js';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { makeSource } from './fixtures/makeSource.js';
import { makeTemplate, baseTemplate } from './fixtures/makeTemplate.js';
import { loadExpected } from './helpers.js';

const data = (bpRows) => ({ 'BP Daily': readSourceBuffer(makeSource({ rows: bpRows }).buffer).rows, 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] });
const run = (tpl, d, o = {}) => patchTemplate(tpl, { processedData: d, analyzeRows: buildAnalyzeRows(d), ...o });

describe('template capacity', () => {
  it('14 BP rows overflow the BP capacity and the report names the dropped rows', async () => {
    const cap = loadExpected().capacities['BP Daily'];
    const d = data(14);
    const { report } = await run(baseTemplate(), d);
    expect(report.overflow).toHaveLength(1);
    expect(report.overflow[0]).toMatchObject({ sheet: 'BP Daily', rows: 14, capacity: cap });
    expect(report.overflow[0].dropped).toHaveLength(14 - cap);
    expect(report.warnings.join('\n')).toMatch(/BP Daily/);
  });

  it('fits exactly at capacity', async () => {
    const cap = loadExpected().capacities['BP Daily'];
    const { report } = await run(baseTemplate(), data(cap));
    expect(report.overflow).toEqual([]);
  });

  it('spill mode moves the surplus to a values-only sheet', async () => {
    const { report } = await run(baseTemplate(), data(14), { overflow: 'spill' });
    expect(report.patched.some((p) => p.spilled > 0)).toBe(true);
  });

  it('a moved sum row is handled by the capacity check', async () => {
    const tpl = await makeTemplate({ sumRow: { sheet: 'BP Daily', moveTo: 30 } });
    const { report } = await run(tpl, data(14));
    expect(report.overflow).toEqual([]);
    const bp = report.patched.find((p) => p.sheet === 'BP Daily');
    expect(bp.rows).toBe(14);
  });
});
