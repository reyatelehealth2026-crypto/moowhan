import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { buildSummary, computeTotals } from '../src/lib/excel/aggregate.js';
import { createStorage, createMemoryBackend } from '../src/lib/storage/index.js';
import { toSnapshot, upsertRun, loadRuns, saveRuns, importRuns, exportRuns, patchLatest, MAX_RUNS } from '../src/features/run-history/logic.js';
import { buildTrend } from '../src/features/run-history/trend.js';
import { accuracy, EMPTY_MESSAGE } from '../src/features/run-history/accuracy.js';
import { runStore } from '../src/features/run-history/store.js';

let input; let summary;
beforeAll(() => {
  const processedData = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  const files = [];
  SOURCE_FILES.forEach((f, i) => {
    const name = f.split('/')[1];
    const { rows, meta } = readSourceBuffer(fixture(f));
    const plant = categorizeFile(name);
    processedData[`${plant} Daily`].push(...rows);
    files.push({ id: `f${i}`, name, category: plant, size: 1000 + i, sha256: `${i}`.repeat(64), rows: rows.length, meta });
  });
  summary = buildSummary(processedData).summary;
  input = { processedData, productionMonth: { year: 2026, month: 2 }, files, changeLog: [] };
});

const mk = (month, over = {}) => {
  const base = { n: 100, n1: 110, n2: 120, n3: 130 };
  return {
    schemaVersion: 1, id: `${month}-${over.at || 'a'}`, createdAt: over.createdAt || `2026-01-01T00:00:0${over.s || 0}Z`, productionMonth: month,
    revision: over.revision ?? '1', files: [{ name: `f-${month}-${over.at || 'a'}`, plant: 'BP', rows: 1, size: 1 }],
    totals: { ...base, ...over.n }, byPlant: { BP: { ...base, ...over.n } }, sent: over.sent || null, qa: null, editsCount: 0, export: null,
  };
};

describe('toSnapshot', () => {
  it('matches fixtures: month, files, totals; Tier A is small and has no parts', () => {
    const s = toSnapshot(input, { now: '2026-01-30T01:00:00Z' });
    expect(s.productionMonth).toBe('202602');
    expect(s.files).toHaveLength(5);
    expect(s.files.every((f) => f.rows > 0 && f.plant)).toBe(true);
    expect(s.totals).toEqual(computeTotals(summary));
    expect(s.parts).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/rawRow|partDesc/);
    expect(JSON.stringify(s).length).toBeLessThan(3 * 1024);
  });
  it('Tier B adds aggregated parts under 20 KB', () => {
    const s = toSnapshot(input, { withParts: true, now: '2026-01-30T01:00:00Z' });
    expect(s.parts.length).toBeGreaterThan(0);
    expect(JSON.stringify(s).length).toBeLessThan(20 * 1024);
  });
});

describe('upsertRun', () => {
  it('replaces the same file set + month, keeps count', () => {
    const a = toSnapshot(input, { now: '2026-01-30T01:00:00Z' });
    const b = toSnapshot(input, { now: '2026-01-31T01:00:00Z' });
    expect(upsertRun(upsertRun([], a), b)).toHaveLength(1);
  });
  it('caps at 24 and drops the oldest', () => {
    let list = [];
    for (let i = 0; i < 30; i++) list = upsertRun(list, mk('202602', { at: `x${i}` }));
    expect(list).toHaveLength(MAX_RUNS);
    expect(list[0].id).toBe('202602-x29');
    expect(list.some((r) => r.id === '202602-x0')).toBe(false);
  });
});

describe('persistence', () => {
  it('saveRuns survives QuotaExceeded by halving', async () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const storage = { put: async (t, k, v) => { if (v.length > 3) throw quota; return true; }, get: async () => undefined };
    const list = Array.from({ length: 12 }, (_, i) => mk('202601', { at: `q${i}` }));
    const kept = await saveRuns(list, { storage });
    expect(kept.length).toBeLessThanOrEqual(3);
    expect(kept.length).toBeGreaterThan(0);
  });
  it('round-trips through the real storage layer and wipeAll clears it', async () => {
    const storage = createStorage({ backend: createMemoryBackend(), prefsBackend: createMemoryBackend() });
    await saveRuns([mk('202602')], { storage });
    expect(await loadRuns({ storage })).toHaveLength(1);
    await storage.wipeAll();
    expect(await loadRuns({ storage })).toHaveLength(0);
  });
  it('store: record, onExported-style patch, history survives', async () => {
    const storage = createStorage({ backend: createMemoryBackend(), prefsBackend: createMemoryBackend() });
    runStore.configure({ storage });
    await runStore.record(input);
    expect((await loadRuns({ storage }))).toHaveLength(1);
    await runStore.patchLatest({ export: { fileName: 'out.xlsx', sha256: 'ab', exportedAt: null } });
    const runs = await loadRuns({ storage });
    expect(runs[0].export.fileName).toBe('out.xlsx');
    expect(runs[0].productionMonth).toBe('202602');
  });
  it('patchLatest only touches the first entry', () => {
    const out = patchLatest([mk('202601'), mk('202602')], { editsCount: 3 });
    expect(out[0].editsCount).toBe(3); expect(out[1].editsCount).toBe(0);
  });
});

describe('import / export', () => {
  it('round trips and rejects bad input in Thai', () => {
    const list = [mk('202601'), mk('202602')];
    const res = importRuns(exportRuns(list), []);
    expect(res.ok).toBe(true); expect(res.list).toHaveLength(2);
    const bad = importRuns('{nope', []);
    expect(bad.ok).toBe(false); expect(bad.error).toMatch(/JSON/);
    expect(importRuns(JSON.stringify({ runs: [{ schemaVersion: 2 }] }), []).ok).toBe(false);
    expect(importRuns('[]', []).ok).toBe(false);
  });
});

describe('buildTrend', () => {
  const runs = [mk('202603', { n: { n: 130 } }), mk('202601'), mk('202602'), mk('202604', { n: { n: 99 } })];
  it('orders by calendar month', () => {
    expect(buildTrend(runs).points.map((p) => p.month)).toEqual(['202601', '202602', '202603', '202604']);
  });
  it('prefers signed-off, else latest, for a shared month', () => {
    const r = [mk('202601', { at: 'old', s: 1, sent: { at: 'x' }, n: { n: 5 } }), mk('202601', { at: 'new', s: 9, n: { n: 7 } })];
    expect(buildTrend(r).points[0].total.n).toBe(5);
    const r2 = [mk('202601', { at: 'old', s: 1, n: { n: 5 } }), mk('202601', { at: 'new', s: 9, n: { n: 7 } })];
    expect(buildTrend(r2).points[0].total.n).toBe(7);
  });
  it('drift = N vs N+3 of the run 3 months earlier; null without overlap', () => {
    const t = buildTrend(runs);
    expect(t.drift.total[0]).toBeNull();
    expect(t.drift.total[3].prev).toBe(130);
    expect(t.drift.total[3].pct).toBeCloseTo((99 - 130) / 130);
    expect(t.drift.total[1]).toBeNull();
  });
});

describe('accuracy', () => {
  it('empty with fewer than 2 runs', () => {
    const a = accuracy([mk('202601')]);
    expect(a.empty).toBe(true); expect(a.message).toBe(EMPTY_MESSAGE);
  });
  it('pairs earlier N+k with Firm N, highest revision only, "-" (null) when no pair', () => {
    const runs = [
      mk('202601', { n: { n1: 120, n2: 150 } }),
      mk('202602', { n: { n: 100 } }),
      mk('202602', { at: 'rev2', revision: '2', s: 1, n: { n: 200 } }),
      mk('202602', { at: 'rev0', revision: '0', s: 5, n: { n: 999 } }),
    ];
    const a = accuracy(runs);
    const p1 = a.pairs.filter((p) => p.horizon === 1);
    expect(p1).toHaveLength(1);
    expect(p1[0].firm).toBe(200); // revision 2 wins over revision 0 even though rev 0 is newer
    expect(p1[0].error).toBeCloseTo((120 - 200) / 200);
    expect(a.summary[2].total).toBeNull();
    expect(a.summary[3].byPlant.BP).toBeNull();
    expect(a.summary[1].total.bias).toBeCloseTo(-0.4);
    expect(a.summary[1].total.mape).toBeCloseTo(0.4);
  });
  it('part level uses Tier B parts', () => {
    const parts = (n, n1) => [{ plant: 'BP', part: 'P1', dock: 'D', n, n1, n2: 0, n3: 0 }];
    const r = [{ ...mk('202601'), parts: parts(1, 50) }, { ...mk('202602'), parts: parts(40, 0) }];
    const a = accuracy(r, { level: 'part' });
    expect(a.pairs[0].part).toBe('P1'); expect(a.pairs[0].error).toBeCloseTo(0.25);
  });
});
