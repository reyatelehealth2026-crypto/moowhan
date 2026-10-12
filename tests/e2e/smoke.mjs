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
import JSZip from 'jszip';
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

  // ---- template-inspector: card under the upload tab, informational only ----
  const inspection = page.getByTestId('template-inspection');
  await inspection.getByText('ผลตรวจเทมเพลต').waitFor();
  const inspectRows = await inspection.getByTestId('inspection-sheet-row').count();
  if (inspectRows !== 11) errors.push(`template-inspector: expected 11 sheet rows, got ${inspectRows}`);
  if (!(await inspection.innerText()).includes('Analyze รองรับ 54 แถว')) errors.push('template-inspector: summary line missing "Analyze รองรับ 54 แถว"');
  if (!(await inspection.innerText()).includes('วิธีแก้')) errors.push('template-inspector: issues have no "วิธีแก้" line');
  await page.setViewportSize({ width: 390, height: 800 });
  const inspectOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (inspectOverflow > 0) errors.push(`template-inspector: horizontal page overflow ${inspectOverflow}px at 390px`);
  await page.setViewportSize({ width: 1280, height: 900 });
  if (await page.getByRole('button', { name: 'รวมข้อมูลและคำนวณ' }).isDisabled()) errors.push('template-inspector: process button disabled by the inspection');
  step('template inspection card: 11 rows, no overflow at 390px');
  await shot(page, '02-files');

  await page.getByRole('button', { name: 'รวมข้อมูลและคำนวณ', exact: true }).click();
  await page.getByRole('heading', { name: 'ตรวจสอบข้อมูล' }).waitFor({ timeout: 60000 });
  step('processed; header: ' + (await page.locator('header').innerText()).replace(/\s*\n\s*/g, ' | '));
  await shot(page, '03-preview', true);

  // ---- ui-kit: live region, shared grid (search, sort, '/' and Escape), focus trap ----
  const liveText = await page.getByTestId('live-region').textContent();
  if (!/ประมวลผลเสร็จ/.test(liveText || '')) errors.push(`ui-kit: live region did not announce processing (${liveText})`);
  const nHeader = page.getByRole('columnheader', { name: /^N \(/ });
  await nHeader.getByRole('button').click();
  await nHeader.getByRole('button').click();
  if ((await nHeader.getAttribute('aria-sort')) !== 'descending') errors.push('ui-kit: N header is not aria-sort=descending');
  if (await page.getByText('แสดงเพิ่ม').count()) errors.push('ui-kit: found a "แสดงเพิ่ม" paging button');
  await page.keyboard.press('/');
  if (!(await page.evaluate(() => document.activeElement?.hasAttribute('data-search-input')))) errors.push('ui-kit: "/" did not focus the search box');
  await page.keyboard.type('BN');
  await page.getByText(/พบ [\d,]+ จาก [\d,]+/).first().waitFor();
  await page.keyboard.press('Escape');
  if ((await page.locator('[data-search-input]').first().inputValue()) !== '') errors.push('ui-kit: Escape did not clear search');
  await page.getByTestId('preview-excel').focus();
  await page.getByTestId('preview-excel').click();
  const dlg = page.getByRole('dialog', { name: 'Preview Excel' });
  await dlg.waitFor();
  let escaped = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) escaped = true;
  }
  if (escaped) errors.push('ui-kit: focus escaped the dialog');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  if (!(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'preview-excel'))) errors.push('ui-kit: focus was not restored to the opener');
  step('ui-kit grid search/sort/hotkeys/focus trap ok');

  await page.getByRole('tab', { name: 'สรุปรวม', exact: true }).click();
  await page.getByText('สรุปยอดรวม').waitFor();
  await page.locator('[data-search-input]').first().fill('BN');
  await page.getByText(/พบ [\d,]+ จาก [\d,]+/).first().waitFor();
  await page.locator('[data-search-input]').first().fill('');
  await shot(page, '04-summary', true);

  await page.getByRole('button', { name: 'ดูกราฟวิเคราะห์', exact: true }).click();
  await page.getByText('ยอดรวมรายเดือน').waitFor();
  if ((await page.getByRole('tab', { name: 'แดชบอร์ด' }).getAttribute('aria-selected')) !== 'true') errors.push('dashboard: tab not selected after ดูกราฟวิเคราะห์');
  await page.getByTestId('dashboard-kpis').getByText('48,934').waitFor();
  await page.setViewportSize({ width: 390, height: 800 });
  const dashOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (dashOverflow > 0) errors.push(`dashboard: horizontal page overflow ${dashOverflow}px at 390px`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { window.print = () => { window.__printed = document.documentElement.dataset.print; }; });
  await page.getByTestId('dashboard-print').click();
  await page.waitForFunction(() => window.__printed === 'report');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  if (await page.evaluate(() => document.documentElement.dataset.print)) errors.push('dashboard: data-print not cleared on afterprint');
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('dashboard-png').click()]);
  const pngFile = path.join(OUT, png.suggestedFilename());
  await png.saveAs(pngFile);
  if (!/^Report_2026-02_/.test(png.suggestedFilename()) || fs.statSync(pngFile).size < 1000) errors.push('dashboard: PNG name/size wrong');
  step('dashboard tab, 390px, print and PNG ok');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.keyboard.press('Control+s'),
  ]);
  const outFile = path.join(OUT, download.suggestedFilename());
  await download.saveAs(outFile);
  await page.getByText(`ดาวน์โหลด ${download.suggestedFilename()}`).first().waitFor();
  step(`downloaded ${download.suggestedFilename()} (${fs.statSync(outFile).size} bytes)`);

  await page.getByRole('tab', { name: 'รายละเอียด Matching' }).click();
  await page.getByText('รายละเอียดการ Matching').waitFor();
  await page.locator('[data-search-input]').first().fill('BN');
  await page.getByText(/พบ [\d,]+ จาก [\d,]+/).first().waitFor();
  await page.getByRole('tab', { name: 'ประวัติการแก้ไข' }).click();
  await page.getByText('ประวัติการประมวลผล').waitFor();

  // ---- daily-grid ----
  await page.getByRole('tab', { name: 'ตารางรายวัน', exact: true }).first().click();
  await page.getByRole('heading', { name: 'ตารางรายวัน' }).waitFor();
  await page.getByRole('button', { name: 'รายวันทั้ง 4 เดือน', exact: true }).click();
  const numCols = await page.locator('th[data-col=num]').count();
  if (numCols !== 128) errors.push(`daily-grid: expected 128 numeric columns, got ${numCols}`);
  const scroller = page.getByTestId('daily-scroll');
  await scroller.evaluate((el) => { el.scrollLeft = 600; });
  const stickyLeft = await page.locator('th', { hasText: 'Part Number' }).first().evaluate((el) => el.getBoundingClientRect().left);
  const scrollerLeft = await scroller.evaluate((el) => el.getBoundingClientRect().left);
  if (Math.abs(stickyLeft - scrollerLeft) > 2) errors.push('daily-grid: Part Number column is not sticky');
  await page.getByLabel('กำลังรับต่อวัน').fill('1');
  if ((await page.locator('td[data-over="1"]').count()) === 0) errors.push('daily-grid: capacity did not shade any cell');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) errors.push('daily-grid: page overflows horizontally at 390px');
  if (!(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth))) errors.push('daily-grid: grid frame should scroll horizontally');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'พิมพ์แผนรายวัน', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'พิมพ์แผนรายวัน' }).waitFor();
  await page.emulateMedia({ media: 'print' });
  const printState = await page.evaluate(() => ({
    app: getComputedStyle(document.getElementById('root')).display,
    thead: getComputedStyle(document.querySelector('.print-overlay thead')).display,
    tools: getComputedStyle(document.querySelector('.print-overlay .no-print')).display,
  }));
  if (printState.app !== 'none' || printState.thead !== 'table-header-group' || printState.tools !== 'none') errors.push(`daily-grid: print css wrong ${JSON.stringify(printState)}`);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'ปิด', exact: true }).click();
  step('daily-grid tab, sticky column, capacity, 390px and print css ok');

  // ---- dock-analysis ----
  const dockTab = page.getByRole('tab', { name: 'วิเคราะห์ Dock/รุ่น/บรรจุภัณฑ์' });
  if (!(await dockTab.count())) {
    const more = page.getByRole('button', { name: /เพิ่มเติม/ });
    if (await more.count()) await more.click();
  }
  await (await dockTab.count() ? dockTab : page.getByRole('menuitem', { name: /วิเคราะห์ Dock/ })).first().click();
  await page.getByRole('heading', { name: 'วิเคราะห์ Dock/รุ่น/บรรจุภัณฑ์' }).waitFor();
  await page.getByRole('group', { name: 'จัดกลุ่มตาม' }).getByRole('button', { name: 'Dock', exact: true }).click();
  await page.getByText(/พบ 6 จาก 6|รวม 6 กลุ่ม/).first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) errors.push('dock-analysis: page overflows horizontally at 390px');
  await page.setViewportSize({ width: 1280, height: 900 });
  step('dock-analysis tab shows 6 dock groups, no overflow at 390px');

  // Ctrl+Enter on the upload tab processes the files again
  await page.getByRole('tab', { name: 'อัปโหลดไฟล์' }).click();
  await page.getByTestId('process').focus();
  await page.keyboard.press('Control+Enter');
  await page.getByRole('heading', { name: 'ตรวจสอบข้อมูล' }).waitFor({ timeout: 60000 });
  step('Ctrl+Enter processes');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'อัปโหลดไฟล์' }).click();
  await shot(page, '05-mobile', true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) errors.push('mobile viewport has horizontal overflow');
  step('mobile layout checked');

  // simple/advanced toggle must not break the tab bar (no feature tabs yet -> link hidden)
  await page.getByRole('button', { name: /โหมด/ }).click();
  await page.getByRole('tab', { name: 'อัปโหลดไฟล์' }).waitFor();
  await page.getByRole('button', { name: /โหมด/ }).click();
  step('simple/advanced toggle ok');

  // ---- storage-session: opt-in save, reload, restore, forget, wipe (fresh browser context = empty storage) ----
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => errors.push(`storage pageerror: ${e.message}`));
    await p2.goto(url, { waitUntil: 'networkidle' });
    const files2 = p2.locator('input[type=file]');
    await files2.nth(0).setInputFiles(path.join(ROOT, 'template.xlsx'));
    await p2.getByText('template.xlsx').first().waitFor();
    // default off: nothing is written until the user opts in
    await p2.getByTestId('storage-panel').waitFor();
    if (await p2.getByTestId('storage-inventory').count()) errors.push('storage: inventory should start empty');
    await p2.getByTestId('remember-template').click();
    await p2.getByTestId('template-card').waitFor();
    await p2.getByTestId('save-session-toggle').click();
    await files2.nth(1).setInputFiles(SOURCES);
    await p2.getByText('SR veh 481D.xls').waitFor();
    await p2.getByRole('button', { name: 'รวมข้อมูลและคำนวณ' }).click();
    await p2.getByRole('heading', { name: 'ตรวจสอบข้อมูล' }).waitFor({ timeout: 60000 });
    await p2.getByTestId('autosave-chip').waitFor({ timeout: 15000 });
    step('storage: opted in, autosave chip shown');

    await p2.reload({ waitUntil: 'networkidle' });
    await p2.getByTestId('restore-banner').waitFor({ timeout: 15000 });
    step('storage: restore banner after reload: ' + (await p2.getByTestId('restore-banner').innerText()).replace(/\s*\n\s*/g, ' | '));
    await p2.getByTestId('restore-session').click();
    await p2.getByRole('heading', { name: 'ตรวจสอบข้อมูล' }).waitFor({ timeout: 60000 });
    if (!(await p2.locator('table, [role=grid]').first().isVisible())) errors.push('storage: restored data not visible in preview');
    step('storage: restored without uploading again');

    await p2.getByRole('tab', { name: 'อัปโหลดไฟล์' }).click();
    await p2.setViewportSize({ width: 390, height: 844 });
    if (await p2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) errors.push('storage: panel overflows horizontally at 390px');
    await p2.setViewportSize({ width: 1280, height: 900 });
    await p2.getByTestId('forget-template').click();
    await p2.getByTestId('template-card').waitFor({ state: 'detached' });
    await p2.getByTestId('wipe-all').click();
    await p2.getByRole('button', { name: 'ล้างทั้งหมด' }).click();
    await p2.getByText('ล้างข้อมูลที่เก็บในเครื่องแล้ว').first().waitFor();
    if (await p2.getByTestId('save-session-toggle').isChecked()) errors.push('storage: wipe should reset the save toggle');
    await p2.reload({ waitUntil: 'networkidle' });
    await p2.getByTestId('storage-panel').waitFor();
    if (await p2.getByTestId('restore-banner').count()) errors.push('storage: restore banner should be gone after wipe');
    step('storage: forget template + wipe all ok');
    await ctx2.close();
  }

  // ---- provenance-manifest: Run Info sheet, mark as sent, chip, stale warning ----
  {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('tab', { name: 'อัปโหลดไฟล์' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.keyboard.press('Control+s')]);
    const f = path.join(OUT, `prov-${dl.suggestedFilename()}`);
    await dl.saveAs(f);
    const zip = await JSZip.loadAsync(fs.readFileSync(f));
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    if (!wbXml.includes('name="Run Info"')) errors.push('provenance: Run Info sheet missing from the download');
    await page.getByTestId('mark-sent').click();
    await page.getByTestId('sent-note').fill('ส่งให้ฝ่ายผลิต');
    await page.getByTestId('sent-confirm').click();
    const chip = await page.getByTestId('sent-chip').innerText();
    if (!/^ส่งแล้ว \d\d:\d\d · [0-9a-f]{8}$/.test(chip.trim())) errors.push(`provenance: unexpected chip "${chip}"`);
    if (await page.getByText('มีการแก้ไขหลังส่ง').count()) errors.push('provenance: stale warning shown without changes');
    await page.getByRole('button', { name: 'ลบ SR veh 481D.xls' }).click();
    await page.getByText('(มีการแก้ไขหลังส่ง)').first().waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: /ส่งแล้ว/ }).first().click();
    await page.getByRole('dialog', { name: 'รอบการประมวลผล' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) errors.push('provenance: horizontal overflow at 390px');
    await page.keyboard.press('Escape');
    step('provenance: Run Info sheet, sent chip, stale warning ok');
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log('[e2e] errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
