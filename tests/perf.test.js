import { describe, it, expect } from 'vitest';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import { buildAnalyzeRows } from '../src/lib/excel/aggregate.js';
import { makeSource } from './fixtures/makeSource.js';
import { baseTemplate } from './fixtures/makeTemplate.js';

const skip = process.env.CI_PERF === '0';

describe.skipIf(skip)('performance', () => {
  it('1000-row parse + patch stays under 3 s', async () => {
    const t0 = performance.now();
    const { buffer } = makeSource({ rows: 1000 });
    const { rows } = readSourceBuffer(buffer);
    const d = { 'BP Daily': rows, 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
    await patchTemplate(baseTemplate(), { processedData: d, analyzeRows: buildAnalyzeRows(d), overflow: 'spill' });
    const ms = performance.now() - t0;
    expect(rows).toHaveLength(1000);
    expect(ms).toBeLessThan(3000);
  });
});
