// Optional: open the exported workbook in LibreOffice headless and check it converts.
// Skips (exit 0) when `soffice` is not on PATH. Usage: npm run build-export first via smoke (.e2e-out/*.xlsx).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const which = spawnSync('soffice', ['--version'], { encoding: 'utf8' });
if (which.error || which.status !== 0) {
  console.log('[office] skipped: soffice not found on PATH');
  process.exit(0);
}
const dir = path.join(ROOT, '.e2e-out');
const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => /^Production_.*\.xlsx$/.test(f)) : null;
if (!file) {
  console.log('[office] skipped: no exported workbook in .e2e-out (run npm run e2e first)');
  process.exit(0);
}
const out = path.join(dir, 'office');
fs.mkdirSync(out, { recursive: true });
const r = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, path.join(dir, file)], { encoding: 'utf8', timeout: 120000 });
const pdf = path.join(out, file.replace(/\.xlsx$/, '.pdf'));
if (r.status !== 0 || !fs.existsSync(pdf)) {
  console.error('[office] ✗ LibreOffice could not open the workbook', r.stderr);
  process.exit(1);
}
console.log(`[office] ok: ${file} opened and converted (${fs.statSync(pdf).size} bytes)`);
