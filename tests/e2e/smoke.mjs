// End-to-end smoke test: upload template + 5 plant files -> process -> export.
//
//   npm run build && npm run e2e            (starts `vite preview` itself)
//   APP_URL=http://localhost:5173/ npm run e2e   (against a running dev server)
//
// Requires a Chromium for Playwright: `npx playwright install chromium`
// (or set PLAYWRIGHT_CHROMIUM to an existing binary).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, '.e2e-out');
fs.mkdirSync(OUT, { recursive: true });
const SOURCES = ['BP veh 481D.xls', 'BPK packing 481D.xls', 'GW packing B-MPV.xls', 'GW veh DG7.xls', 'SR veh 481D.xls'].map((f) => path.join(ROOT, 'input', f));

const step = (s) => console.log(`[e2e] ${s}`);
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });

// ---------- server ----------
let server = null;
let url = process.env.APP_URL;
if (!url) {
  const port = 4173 + Math.floor(Math.random() * 500);
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  url = `http://localhost:${port}/`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(url); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, headless: true });
const errors = [];
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(url, { waitUntil: 'networkidle' });
  step(`loaded ${url} — ${await page.title()}`);
  await shot(page, '01-upload');

  const inputs = page.locator('input[type=file]');
  await inputs.nth(0).setInputFiles(path.join(ROOT, 'template.xlsx'));
  await page.getByText('template.xlsx').waitFor();
  await inputs.nth(1).setInputFiles(SOURCES);
  await page.getByText('SR veh 481D.xls').waitFor();
  step('template + 5 source files listed');
  await shot(page, '02-files');

  await page.getByRole('button', { name: 'รวมข้อมูลและคำนวณ' }).click();
  await page.getByRole('heading', { name: 'ตรวจสอบข้อมูล' }).waitFor({ timeout: 60000 });
  step('processed; header: ' + (await page.locator('header').innerText()).replace(/\s*\n\s*/g, ' | '));
  await shot(page, '03-preview', true);

  await page.getByRole('button', { name: 'สรุปรวม' }).click();
  await page.getByText('สรุปยอดรวม').waitFor();
  await shot(page, '04-summary', true);

  await page.getByRole('button', { name: 'ดูกราฟวิเคราะห์' }).click();
  await page.getByText('ยอดรวมรายเดือน').waitFor();
  await page.keyboard.press('Escape');
  await page.getByText('ยอดรวมรายเดือน').waitFor({ state: 'detached' });
  step('chart modal opens and closes with Escape');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: 'ดาวน์โหลด' }).click(),
  ]);
  const outFile = path.join(OUT, download.suggestedFilename());
  await download.saveAs(outFile);
  await page.getByText(/ดาวน์โหลด Production_/).waitFor();
  step(`downloaded ${download.suggestedFilename()} (${fs.statSync(outFile).size} bytes)`);

  await page.getByRole('button', { name: 'รายละเอียด Matching' }).click();
  await page.getByText('รายละเอียดการ Matching').waitFor();
  await page.getByRole('button', { name: 'ประวัติการแก้ไข' }).click();
  await page.getByText('ประวัติการประมวลผล').waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'อัปโหลดไฟล์' }).click();
  await shot(page, '05-mobile', true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) errors.push('mobile viewport has horizontal overflow');
  step('mobile layout checked');

  // simple/advanced toggle must not break the tab bar (no feature tabs yet -> link hidden)
  await page.getByRole('button', { name: /โหมด/ }).click();
  await page.getByRole('button', { name: 'อัปโหลดไฟล์' }).waitFor();
  await page.getByRole('button', { name: /โหมด/ }).click();
  step('simple/advanced toggle ok');
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log('[e2e] errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
