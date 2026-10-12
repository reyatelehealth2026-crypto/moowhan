# moowhan — คู่มือสำหรับผู้พัฒนา / agents

เว็บแอป (React 19 + Vite 7 + Tailwind v4, รันในเบราว์เซอร์ล้วน ไม่มี backend) สำหรับรวมไฟล์แผนการผลิตรายเดือนจากโรงงาน Toyota 4 แห่ง
(BP, BPK, GW, SR) ลงในเทมเพลต Excel ของบริษัท (`template.xlsx`) **ภาษา UI เป็นภาษาไทย**

## คำสั่ง
- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` — vitest (ใช้ fixture จริง `template.xlsx` + `input/*.xls`); ต้องผ่านก่อน commit ทุกครั้ง
- `npm run e2e` — Playwright smoke (`tests/e2e/smoke.mjs`, ต้องมี Chromium: `npx playwright install chromium` หรือ `PLAYWRIGHT_CHROMIUM=/path`)

## โครงสร้าง
- `src/lib/excel/` — logic ล้วน (ห้ามใช้ DOM/React) เพื่อให้ทดสอบใน Node ได้
  - `readSource.js` อ่านไฟล์ต้นทาง → `{ rows, meta }` (`meta.productionMonth` จาก `PRODUCTION MONTH`)
  - `aggregate.js` รวมยอด/ matching / แถวสำหรับ Analyze
  - `templatePatcher.js` **เขียนลง template .xlsx แบบแก้ XML เฉพาะ cell** (รักษา pivot/สูตร/สไตล์/comment); `upsertSheet` เพิ่ม/แทนที่ sheet แบบค่าล้วน
  - `exportWorkbook.js` เลือกโหมด template (patcher) หรือ fallback (SheetJS สร้างไฟล์ใหม่); รับ `extraSheets: [{ name, aoa }]`
  - `index.js` barrel ที่ UI **import แบบ lazy** (`import('../lib/excel/index.js')`) — ห้าม import `xlsx`/`jszip` แบบ static จาก component/state
- `src/state/useConsolidator.js` — state + actions ทั้งหมด (`setTemplateFile, addSourceFiles, processAll, updateRowValues, exportExcel, log, setNotice, ...`)
- `src/components/` — UI กลาง (Icons, Modal, Banner, FileDropZone, ProgressBar, ChartDashboard, ExcelPreview และแท็บหลัก)
- `src/features/<id>/index.jsx` — **ฟีเจอร์เสริม auto‑discover** (ดู `src/features/index.js`): `export default { id, order, tab, headerActions, exportSheets, onProcessed }`
  - logic ของฟีเจอร์ไว้ไฟล์ข้างเคียง (เช่น `src/features/<id>/logic.js`) และเขียน test ใน `tests/<id>.test.js`
  - ฟีเจอร์ได้รับ `ctx = { state, actions, monthLabels }`
  - **Feature contract**: ห่อด้วย `defineFeature({...})` (`src/features/defineFeature.js`) — ตรวจ id (kebab-case, ไม่ซ้ำ), `group` (`core` 10-49, `ตรวจสอบ` 50-69, `วิเคราะห์` 70-89 [default], `ประวัติ` 90-94, `ตั้งค่า` 95-99), `order` ในช่วงของกลุ่ม, คีย์ที่รู้จักเท่านั้น (DEV: throw ข้อความไทย; production: warn แล้วตัดฟีเจอร์ออก) รายละเอียด hooks ดู JSDoc ใน `src/features/index.js`
  - ทุก hook เรียกผ่าน `runtime.js` (`runHook`, `collectExportSheets` ฯลฯ) — error ถูกกลืนและรายงานเป็นภาษาไทย ไม่ทำให้แอป/การส่งออกล้ม; `exportSheets` เป็น async ได้; ชื่อ sheet ห้ามเกิน 31 ตัวอักษร/ซ้ำ/ซ้ำกับ sheet ในเทมเพลต
  - `visibility.js` `visibleFeatures` ถูกเรียกครั้งเดียวใน `App.jsx` (ซ่อนตาม `profile.features[id].enabled` และโหมดเริ่มต้น); เก็บข้อมูลฟีเจอร์ด้วย `actions.setFeatureData(id, patch)` → `state.features[id]`
  - `processAll` คืน `ProcessResult` `{ processedData, summary, matching, productionMonth, files }`; `onProcessed(ctx, result)` ได้ ctx ใหม่เสมอ
- `src/features/ui-kit/` — UI กลาง (Button, Chip, KpiCard, Toast, ConfirmDialog, EmptyState, InfoTip, DataGrid, hotkeys, strings); กติกา: error = Banner, success/info = Toast (ดู README ในโฟลเดอร์); วันที่ใช้ `formatDate` ใน `utils/format.js`
- `src/constants.js` — รายชื่อโรงงาน, layout ของ template, สี; `src/utils/format.js` — formatNumber, month labels, column letters, safeSheetName

## import-cli (นำเข้า .zip/.eml, โฟลเดอร์, CLI)
- `src/features/import-cli/` — `zip.js`/`eml.js`/`intake.js` (pure) ให้ hook `expandFiles`; `addSourceFiles` รับ `.zip/.eml` (ไฟล์ปกติยังทำงานแบบ sync); `folder.js` (`planFolderImport`, `writeNoOverwrite`) + ปุ่มเปิดโฟลเดอร์ (เฉพาะเบราว์เซอร์ที่มี `showDirectoryPicker`)
- `scripts/consolidate.mjs` → `cli.js`: QA gate + verifyExport ชุดเดียวกับ UI, exit code 0/1/2/3, stdout เป็น JSON บรรทัดเดียว — ดู `docs/cli.md`; CLI ห้าม import React/components/`features/index.js`/network (มี contract test ใน `tests/import-cli.test.js`) และ `.js` ที่ CLI ใช้ต้องรันใน Node ล้วน (ไม่ใช้ `import.meta.glob` นอก try/catch)

## กติกา
- **ห้ามใช้ ExcelJS ตอน runtime** (เป็น devDependency สำหรับ test เท่านั้น) — มันทำ pivot table ในเทมเพลตหาย
- ห้ามเขียนทับ cell ที่มีสูตรใน template; ทุกการเขียนลง template ต้องผ่าน `templatePatcher.js`
- ข้อมูลผู้ใช้ไม่ออกจากเบราว์เซอร์ (ไม่มีการเรียก API ภายนอก)
- ข้อความ UI/ข้อความ error เป็นภาษาไทย อ่านแล้วรู้ว่าต้องทำอะไรต่อ; ศัพท์เทคนิค (N, N+1, Part Number, Pivot) ทับศัพท์ได้
- Tailwind v4 (ไม่มี `tailwind.config.js`); ใช้ class ที่มีอยู่ในโค้ดเป็นแนวทางสี/ระยะ; ต้องใช้งานได้บนจอมือถือ (ไม่ล้นแนวนอน)
- Icon ใช้จาก `components/Icons.jsx` (SVG inline) — ไม่เพิ่ม icon library
- เพิ่ม dependency ใหม่เฉพาะเมื่อจำเป็นจริง และต้องเป็น ESM ที่ใช้ในเบราว์เซอร์ได้
- ก่อน commit: `npm test` และ `npm run build` ต้องผ่าน; ห้าม skip/ลบ test เพื่อให้ผ่าน
- commit message เป็น conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)

## โครงสร้างไฟล์ต้นทาง (TMT forecast .xls)
แถว 1–12 เป็น key/value (PLANT CODE, PART TYPE, PRODUCTION MONTH=YYYYMM, REVISION TYPE, FORECAST TYPE, WOC WEEK, REVISION NUMBER, ISSUE DATE, REMARKS, DETAILS)
แถว 13 (index 12) หัวตาราง: `PART NUMBER, PART CODE, PART DESC, SUPP CODE, SHIPPING DOCK, DOCK CODE, CAR FAMILY, PACKING SIZE` ตามด้วย 4 เดือน × (วันที่ 1–31 + ยอดรวม N / N+1 / N+2 / N+3) → ยอดรวมอยู่ index 39, 71, 103, 135

## โครงสร้าง template.xlsx
- `BP/BPK/GW/SR Daily`: หัวตารางแถว 13, ข้อมูลเริ่มแถว 14 (คัดลอก 1:1 จากไฟล์ต้นทาง), แถวสูตรรวมด้านล่าง
- `Analyze`: หัวตารางแถว 2, ข้อมูลเริ่มแถว 3, คอลัมน์ B.. = คอลัมน์ A.. ของต้นทาง, คอลัมน์ EH = Plant, คอลัมน์ A/EI/EL/EM เป็นสูตร key สำหรับ pivot
- `Summary`, `By Plant`, `Total`, `Sheet2` มี pivot/สูตรอ้างถึง sheet ข้างบน — ห้ามแตะ ยกเว้น value cell ผ่าน `cellWrites` เท่านั้น (`writeCells` ข้ามเซลล์สูตรเสมอ)
- patcher: เขียนเฉพาะคอลัมน์ 1..N+3 และเหนือแถวสูตรแรกของตาราง (แถวที่เกินไปอยู่ใน `report.overflow`, ตัวเลือก `overflow:'spill'`); sheet ของเทมเพลตเป็น protected (ดู `sheetNames.js`) — extraSheets ทับไม่ได้

## โครงสร้างทดสอบ (test-infra)
- `tests/fixtures/makeSource.js` / `makeTemplate.js` สร้างไฟล์ต้นทาง/เทมเพลตสังเคราะห์ในหน่วยความจำ; ตัวเลขที่ได้จากฟิกซ์เจอร์จริงอยู่ที่ `tests/fixtures/expected.json` เท่านั้น (สร้างใหม่ด้วย `npm run fixtures:expected`) อ่านผ่าน `loadExpected()` ใน `tests/helpers.js`
- Golden: `tests/golden.test.js` เทียบทีละ cell กับ `tests/golden/export-cells.json` + sha256 (ส่ง `now` ให้ `buildExport`/`patchTemplate` เพื่อให้ zip ซ้ำได้); เปลี่ยนจงใจแล้ว `UPDATE_GOLDEN=1 npm test`
- `tests/ooxmlValidator.js` ตรวจโครงสร้าง OOXML; `tests/ui/*.test.jsx` เปิด jsdom รายไฟล์ด้วย `// @vitest-environment jsdom` (ใช้ `makeCtx`/`seriousViolations` จาก `tests/ui/`)
- `npm run typecheck` (JSDoc + checkJs, ขอบเขตอยู่ใน `jsconfig.json` `include`; typedef อยู่ `src/features/test-infra/types.js`) และ `npm run check:bundle` (หลัง build) รันใน CI (`.github/workflows/ci.yml`, actions pin SHA) ร่วมกับ e2e
- `CI_PERF=0` ข้าม `tests/perf.test.js`
