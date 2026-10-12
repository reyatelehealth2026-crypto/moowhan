import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(root, '.github', 'workflows');
const files = fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));

/** every `uses:` line that is not a local action ("./...") */
export const usesLines = (yml) => yml.split('\n').map((l, i) => ({ l: l.trim(), n: i + 1 })).filter(({ l }) => /^-?\s*uses:/.test(l.replace(/^-\s*/, '')) || l.startsWith('- uses:') || l.startsWith('uses:'));
export const unpinned = (yml) => usesLines(yml)
  .map(({ l, n }) => ({ ref: l.replace(/^-\s*/, '').replace(/^uses:\s*/, '').split('#')[0].trim(), n }))
  .filter(({ ref }) => !ref.startsWith('./') && !/@[0-9a-f]{40}$/.test(ref));

describe('CI workflow', () => {
  it('has a workflow file', () => expect(files).toContain('ci.yml'));

  for (const f of files) {
    it(`${f}: every uses: is pinned to a 40-char commit SHA`, () => {
      const yml = fs.readFileSync(path.join(workflowDir, f), 'utf8');
      expect(usesLines(yml).length).toBeGreaterThan(0);
      expect(unpinned(yml), 'ไม่ได้ pin SHA').toEqual([]);
    });
  }

  it('detects an unpinned action', () => {
    expect(unpinned('steps:\n  - uses: actions/checkout@v4\n')).toHaveLength(1);
    expect(unpinned(`  - uses: actions/checkout@${'a'.repeat(40)} # v4\n`)).toEqual([]);
  });

  it('runs typecheck, test, build, check:bundle on Node 20 and 22, plus an e2e job', () => {
    const yml = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');
    for (const cmd of ['npm ci', 'npm run typecheck', 'npm test', 'npm run build', 'npm run check:bundle', 'npm run e2e', 'playwright install --with-deps chromium']) expect(yml).toContain(cmd);
    expect(yml).toMatch(/node:\s*\[20,\s*22\]/);
    expect(yml).toMatch(/^\s{2}e2e:/m);
  });

  it('package.json requires node >=20.19', () => {
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).engines.node).toBe('>=20.19');
  });
});
