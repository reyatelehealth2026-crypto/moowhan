import { describe, it, expect } from 'vitest';
import { buildExport } from '../src/lib/excel/exportWorkbook.js';
import { workbookToRawSheets } from '../src/lib/excel/readSource.js';
import { buildSummary } from '../src/lib/excel/aggregate.js';
import { makeTemplate } from './fixtures/makeTemplate.js';
import { loadProcessedData } from './helpers.js';

describe('fallback export', () => {
  it('an .xls template gives mode fallback with Sheet1 preserved and all core sheets', async () => {
    const buf = await makeTemplate({ format: 'xls' });
    const processedData = await loadProcessedData();
    const { summary } = buildSummary(processedData);
    const { blob, report, fileName } = await buildExport({ template: { buffer: buf, rawSheets: workbookToRawSheets(buf).rawSheets }, processedData, summaryData: summary });
    expect(report.mode).toBe('fallback');
    expect(fileName).toMatch(/^Production_Summary_/);
    const { sheetNames } = workbookToRawSheets(await blob.arrayBuffer());
    expect(sheetNames).toEqual(['Sheet1', 'BP Daily', 'BPK Daily', 'GW Daily', 'SR Daily', 'Summary', 'Analyze']);
  });

  it('no template at all also falls back', async () => {
    const { report } = await buildExport({ template: null, processedData: await loadProcessedData(), summaryData: [] });
    expect(report.mode).toBe('fallback');
  });
});
