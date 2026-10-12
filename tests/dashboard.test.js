import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { buildSummary, computeTotals } from '../src/lib/excel/aggregate.js';
import { buildKpis } from '../src/lib/analytics/kpis.js';
import { plantMonthMatrix } from '../src/lib/analytics/matrix.js';
import { topMovers } from '../src/lib/analytics/movers.js';
import { paretoByPart } from '../src/lib/analytics/pareto.js';
import { th, en, partLabel } from '../src/lib/analytics/labels.js';
import { buildReportModel, buildSummaryCardSvg, reportFileName } from '../src/features/dashboard/report.js';
import { attentionItems } from '../src/features/dashboard/panels/AttentionCard.jsx';
import { buildAnalytics } from '../src/lib/analytics/index.js';

let data; let summary; let files;
beforeAll(() => {
  data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  files = [];
  SOURCE_FILES.forEach((f) => {
    const { rows, meta } = readSourceBuffer(fixture(f));
    const plant = categorizeFile(f.split('/')[1]);
    rows.forEach((r) => { r.plant = plant; });
    data[`${plant} Daily`].push(...rows);
    files.push({ category: plant, status: 'done', meta });
  });
  summary = buildSummary(data).summary;
});

const clock = () => new Date(2026, 0, 30);

describe('buildKpis', () => {
  it('matches computeTotals and fixture figures', () => {
    const k = buildKpis(data, summary, { files, clock });
    expect(k.totals).toEqual(computeTotals(summary));
    expect(k.totals.n).toBe(48934);
    expect(k.total4).toBe(177042);
    expect(k.parts).toBe(15);
    expect(k.rows).toBe(29);
    expect(k.plantsWithFiles).toHaveLength(4);
    expect([k.issueDate, k.revision, k.forecastType]).toEqual(['23/01/2026', '0', 'F']);
    expect(k.revisionConsistent).toBe(true);
    expect(k.dataAgeDays).toBe(7);
  });
  it('flags differing revisions and tolerates missing meta', () => {
    const f2 = files.map((f, i) => (i === 0 ? { ...f, meta: { ...f.meta, revision: '1' } } : f));
    expect(buildKpis(data, summary, { files: f2, clock }).revisionConsistent).toBe(false);
    const k = buildKpis({}, [], { files: [], clock });
    expect(k.issueDate).toBeNull();
    expect(k.dataAgeDays).toBeNull();
    expect(k.total4).toBe(0);
  });
});

describe('plantMonthMatrix', () => {
  it('has per-plant, total and share', () => {
    const m = plantMonthMatrix(data);
    expect(m.rows.find((r) => r.plant === 'BPK').n).toBe(23660);
    expect(m.rows.find((r) => r.plant === 'BPK').share.toFixed(1)).toBe('48.5');
    expect(m.total).toMatchObject({ n: 48934, n1: 51986, n2: 40646, n3: 35476 });
    expect({ n: m.total.n, n1: m.total.n1, n2: m.total.n2, n3: m.total.n3 }).toEqual(computeTotals(summary));
  });
  it('empty data gives zero shares, no NaN', () => {
    const m = plantMonthMatrix({});
    expect(m.rows.every((r) => r.share === 0)).toBe(true);
    expect(m.total.share).toBe(0);
  });
});

describe('topMovers', () => {
  it('ranks parts', () => {
    const { up, down } = topMovers(summary, 'n', 'n1', 5);
    expect(down[0]).toMatchObject({ key: '86790-BZ280-00', diff: -2780 });
    expect(down[0].pct.toFixed(1)).toBe('-33.9');
    expect(up[0]).toMatchObject({ key: '86790-0K051-00', diff: 2421 });
    expect(up.length).toBeLessThanOrEqual(5);
  });
  it('base 0 gives pct null; row level keys Part|Plant|Dock', () => {
    const s = [{ partNumber: 'X', n: 0, n1: 10, n2: 0, n3: 0 }];
    expect(topMovers(s, 'n', 'n1').up[0].pct).toBeNull();
    const { up, down } = topMovers(summary, 'n', 'n1', 3, { level: 'row', processedData: data });
    expect(up[0].key.split('|')).toHaveLength(3);
    expect(down[0].diff).toBeLessThan(0);
  });
});

describe('paretoByPart', () => {
  it('top5Share and countToReach', () => {
    const p = paretoByPart(summary);
    expect((p.top5Share * 100).toFixed(1)).toBe('72.9');
    expect(p.countToReach(0.8)).toBe(7);
    expect(p.items.at(-1).cumulative).toBeCloseTo(1, 9);
    expect(paretoByPart([]).countToReach(0.8)).toBe(0);
  });
});

describe('labels', () => {
  it('th and en share keys', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    expect(th.n).toBe('N (Firm)');
    expect(th.total4).toBe('รวม 4 เดือน (Firm+FC)');
  });
  it('partLabel uses alias when present', () => {
    expect(partLabel('A', { A: 'กล้อง' })).toBe('กล้อง (A)');
    expect(partLabel('A', undefined)).toBe('A');
  });
});

describe('report', () => {
  it('model is pure and the card svg has the numbers', () => {
    const a = buildAnalytics({ processedData: data, summaryData: summary, files, clock });
    const opts = { monthLabels: ['N (Feb\'26)', 'N+1', 'N+2', 'N+3'], productionMonth: { year: 2026, month: 2 } };
    const m1 = buildReportModel(a, opts);
    expect(buildReportModel(a, opts)).toEqual(m1);
    const svg = buildSummaryCardSvg(m1, { width: 1080 });
    expect(svg).toContain('48,934');
    expect(svg).toContain('BPK');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(reportFileName({ year: 2026, month: 2 }, new Date('2026-01-30T00:00:00Z'))).toBe('Report_2026-02_2026-01-30.png');
  });
  it('attention card degrades to local facts', () => {
    const k = buildKpis({ ...data, 'SR Daily': [] }, summary, { files: files.filter((f) => f.category !== 'SR'), clock });
    expect(attentionItems({}, k).some((i) => i.text.includes('ยังไม่มีไฟล์'))).toBe(true);
    const withQa = attentionItems({ features: { 'qa-engine': { findings: [{ level: 'block' }, { level: 'info' }] } } }, buildKpis(data, summary, { files, clock }));
    expect(withQa).toHaveLength(2);
  });
});
