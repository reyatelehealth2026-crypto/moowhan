// Bundle guard for `npm run check:bundle` (run after `npm run build`).
//  - xlsx and jszip must be separate chunks, loaded only on demand
//  - the entry chunk must not statically import them or contain their code
//  - the entry chunk stays under a size budget
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTRY_BUDGET_BYTES = 300 * 1024;
const HEAVY = ['xlsx', 'jszip'];

/** @returns {{ errors: string[], info: string[] }} */
export const checkBundle = (distDir, { budget = ENTRY_BUDGET_BYTES } = {}) => {
  const errors = [];
  const info = [];
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const entryRel = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  if (!entryRel) return { errors: ['ไม่พบ entry script ใน dist/index.html'], info };
  const entryFile = path.join(distDir, entryRel.replace(/^\//, ''));
  const entry = fs.readFileSync(entryFile, 'utf8');
  const assets = fs.readdirSync(path.join(distDir, 'assets'));

  for (const lib of HEAVY) {
    const chunk = assets.find((f) => f.startsWith(`${lib}-`) && f.endsWith('.js'));
    if (!chunk) { errors.push(`ไม่พบ chunk แยกของ ${lib} (ควรเป็น assets/${lib}-*.js)`); continue; }
    info.push(`${lib}: ${chunk} (${Math.round(fs.statSync(path.join(distDir, 'assets', chunk)).size / 1024)} kB)`);
    if (new RegExp(`(?:from|import)\\s*["'][^"']*/${lib}-[^"']+\\.js["']`).test(entry)) errors.push(`entry chunk import ${lib} แบบ static`);
    if (html.includes(`/${chunk}`)) errors.push(`index.html preload ${chunk} ทั้งที่ควร lazy`);
  }
  // library fingerprints inside the entry chunk itself
  if (/SheetJS|XLSX\.version|"0\.20\.\d"/.test(entry) && /sheet_to_json|book_new/.test(entry)) errors.push('พบโค้ด xlsx อยู่ใน entry chunk');
  if (/JSZip|zipEntries|_compressWorker/.test(entry)) errors.push('พบโค้ด jszip อยู่ใน entry chunk');

  const size = Buffer.byteLength(entry);
  info.push(`entry: ${path.basename(entryFile)} (${Math.round(size / 1024)} kB, งบ ${Math.round(budget / 1024)} kB)`);
  if (size > budget) errors.push(`entry chunk ใหญ่เกินงบ: ${Math.round(size / 1024)} kB > ${Math.round(budget / 1024)} kB`);
  return { errors, info };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('ไม่พบ dist/ — รัน npm run build ก่อน'); process.exit(1); }
  const { errors, info } = checkBundle(dist);
  info.forEach((l) => console.log(`[bundle] ${l}`));
  if (errors.length) { errors.forEach((e) => console.error(`[bundle] ✗ ${e}`)); process.exit(1); }
  console.log('[bundle] ok');
}
