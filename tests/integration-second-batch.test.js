import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGate } from '../src/features/runtime.js';
import { buildGate } from '../src/features/export-gate/gate.js';
import { fileNameFor } from '../src/features/export-gate/flow.js';
import qa from '../src/features/qa-engine/index.jsx';
import { createStorage, createMemoryBackend } from '../src/lib/storage/index.js';
import { createWaiverStore, storageAdapter, loadSavedWaivers } from '../src/features/qa-engine/waivers.js';
import { defaultProfile } from '../src/features/settings-profile/profile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PM = { year: 2026, month: 2 };
const newStorage = () => createStorage({ backend: createMemoryBackend(), prefsBackend: createMemoryBackend() });

describe('second-batch integration', () => {
  it('export-gate collects qa-engine issues through the feature contract', () => {
    const issue = { rule: 'R01', group: 'data', level: 'error', scope: 'row', plant: 'BP', partNumber: '1', message: 'x', fix: 'y' };
    const fake = { ...qa, validate: () => [{ ...issue, level: 'block', qaLevel: 'error', code: 'R01' }] };
    const out = collectGate([fake], { state: { processedData: {} } }, undefined, buildGate({ state: { isStale: false }, features: [] }));
    expect(out.find((i) => i.code === 'R01')).toMatchObject({ level: 'block', featureId: 'qa-engine' });
  });

  it('qa waivers persist through src/lib/storage (prefs tier)', async () => {
    const storage = newStorage();
    const store = createWaiverStore(storageAdapter(storage));
    const res = store.waive({ issue: { rule: 'M03', level: 'warning', scope: 'row', plant: 'BP', partNumber: 'P1' }, reason: 'ตรวจแล้ว', productionMonth: PM, today: new Date(2026, 1, 3) });
    expect(res.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(Object.keys(await loadSavedWaivers(storage))).toEqual([res.key]);
  });

  it('export-gate file name honours a customised settings-profile pattern, else its own default', () => {
    const custom = { ...defaultProfile(), export: { ...defaultProfile().export, fileNamePattern: 'Production_Custom_{month}.xlsx' } };
    expect(fileNameFor({ productionMonth: PM, profile: custom, template: { kind: 'xlsx' } })).toBe('Production_Custom_202602.xlsx');
    expect(fileNameFor({ productionMonth: PM, profile: defaultProfile(), template: { kind: 'xlsx' } })).toMatch(/^Production_Updated_Feb26_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('xlsx / jszip are imported only inside src/lib/excel', () => {
    const bad = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (!/\.(jsx?|mjs)$/.test(e.name) || p.includes(`${path.sep}lib${path.sep}excel${path.sep}`)) return;
      if (/from\s+['"](xlsx|jszip)['"]|import\(\s*['"](xlsx|jszip)['"]/.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(root, p));
    });
    walk(path.join(root, 'src'));
    expect(bad).toEqual([]);
  });
});
