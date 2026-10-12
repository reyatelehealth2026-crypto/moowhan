# moowhan — คู่มือสำหรับผู้พัฒนา / agents

เว็บแอป (React 19 + Vite 7 + Tailwind v4, รันในเบราว์เซอร์ล้วน ไม่มี backend) สำหรับรวมไฟล์แผนการผลิตรายเดือนจากโรงงาน Toyota 4 แห่ง
(BP, BPK, GW, SR) ลงในเทมเพลต Excel ของบริษัท (`template.xlsx`) **ภาษา UI เป็นภาษาไทย**

## คำสั่ง
- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` — vitest (ใช้ fixture จริง `template.xlsx` + `input/*.xls`); ต้องผ่านก่อน commit ทุกครั้ง (~13 วินาที: โปรเจกต์ `node` ใช้ worker ร่วมกัน, โปรเจกต์ `ui` = `*.test.jsx` แยก worker — ดู `vite.config.js`)
- `npm run typecheck` — `tsc -p jsconfig.json` (JSDoc + checkJs ตามขอบเขต `include`)
- `npm run check:bundle` — รันหลัง `npm run build`: xlsx/jszip ต้องแยก chunk และ **entry chunk ≤ 300 kB** (`ENTRY_BUDGET_BYTES` ใน `scripts/check-bundle.mjs`; ห้ามปิดเช็ก/ห้ามเพิ่มงบโดยไม่มีเหตุผล)
- `npm run e2e` — Playwright smoke (`tests/e2e/smoke.mjs`, ต้องมี Chromium: `npx playwright install chromium` หรือ `PLAYWRIGHT_CHROMIUM=/path`); `npm run e2e:office` เปิดไฟล์ส่งออกใน LibreOffice (ข้ามเองถ้าไม่มี `soffice`)
- `npm run consolidate -- --input <dir> --template <xlsx>` — CLI แบบ batch (ดู `docs/cli.md`); `npm run fixtures:expected` สร้าง `tests/fixtures/expected.json` ใหม่

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
- `src/features/settings-profile/` — โปรไฟล์เดียว (`state.profile`, `ctx.profile`; `actions.setProfile/replaceProfile/resetProfile`) เก็บใน `moowhan.prefs.profile.v1` ผ่าน `src/lib/storage`; `profile.js` (DEFAULT_PROFILE, validateProfile, import/export) และ `calendar.js` (isWorkingDay, workingDaysInMonth, addWorkingDays, suggestNonWorkingDays) เป็น pure ให้ฟีเจอร์อื่นเรียกใช้; ไม่ฝังวันหยุดราชการ; `renderFileName` อยู่ใน `utils/format.js`
- `src/features/ui-kit/` — UI กลาง (Button, Chip, KpiCard, Toast, ConfirmDialog, EmptyState, InfoTip, DataGrid, hotkeys, strings); กติกา: error = Banner, success/info = Toast (ดู README ในโฟลเดอร์); วันที่ใช้ `formatDate` ใน `utils/format.js`
- `src/constants.js` — รายชื่อโรงงาน, layout ของ template, สี; `src/utils/format.js` — formatNumber, month labels, column letters, safeSheetName

## ฟีเจอร์ที่มีในแอป (`src/features/<id>/`)
| id | กลุ่ม/order | หน้าที่ |
|---|---|---|
| `onboarding` | core 10 | แถบ 5 ขั้นตอน (ขั้น "ตรวจสอบ" อ่านจาก `actions.gate` ชุดเดียวกับปุ่มดาวน์โหลด) และ "ลองข้อมูลตัวอย่าง" |
| `import-cli` | core 15 | นำเข้า .zip/.eml/โฟลเดอร์ + CLI (ดูหัวข้อถัดไป) |
| `daily-grid` | core 25 | แท็บ "ตารางรายวัน", พิมพ์แผนรายวัน, ชีต `Daily Total` (เลือกส่งออก) |
| `dashboard` | core 45 | แดชบอร์ดผู้บริหาร พิมพ์/บันทึกเป็นรูป |
| `export-gate` | core 48 | ด่านตรวจก่อนดาวน์โหลด, หน้าต่างส่งออก, ตรวจไฟล์หลังส่งออก, ปลายทางบันทึก (ดาวน์โหลด หรือ "บันทึกลงโฟลเดอร์" เฉพาะเบราว์เซอร์ที่มี `showDirectoryPicker`) |
| `storage-session` | core 49 | จำเทมเพลต/งานค้างในเครื่อง (opt-in) ผ่าน `src/lib/storage` |
| `flat-export` | ตรวจสอบ 50 | CSV long/wide, JSON, ปุ่ม zip แยก, ชีต `Data (flat)` (ปิดเป็นค่าเริ่มต้น) |
| `manual-edit` | ตรวจสอบ 52 | แก้ N..N+3 ด้วยมือ + เหตุผล + เลิกทำ + replay หลังประมวลผลใหม่, ชีต `Manual Edits` |
| `qa-engine` | ตรวจสอบ 55 | กฎตรวจคุณภาพกลาง (R/M/L/K/…); **เฉพาะ error ที่ขอให้ยืนยันก่อนส่งออก** (ดู "ระดับ QA ↔ ด่านส่งออก") |
| `provenance-manifest` | ตรวจสอบ 62 | Manifest รอบรัน, ชีต `Run Info`, "ส่งแล้ว" |
| `template-inspector` | ตรวจสอบ 66 | สรุปโครงสร้างเทมเพลตใต้แท็บอัปโหลด |
| `qa-file-guards` | วิเคราะห์ 70 | ไฟล์ซ้ำ/revision เก่า/ไฟล์ที่ขาดเทียบรอบก่อน (กฎ D01–D04, F01 ลงทะเบียนใน qa-engine) |
| `dock-analysis` | วิเคราะห์ 75 | สรุปตาม Dock / Car Family / Part หลัก / บรรจุภัณฑ์ |
| `share-clipboard` | วิเคราะห์ 75 | แชร์สรุป (LINE/อีเมล/TSV), คัดลอกตาราง (ล้มเหลว → `ManualCopyModal`) |
| `compare` | วิเคราะห์ 78 | เทียบกับรอบก่อน (xlsx/TMT/baseline JSON/JSON จาก flat-export) |
| `runout-alerts` | วิเคราะห์ 78 | สัญญาณ Run-out (กฎ B01 ใน qa-engine) |
| `settings-profile` | ตั้งค่า 95 | โปรไฟล์เดียว (ชื่อไฟล์ ปฏิทิน ฟีเจอร์ที่เปิด) |
| `test-infra` | ตั้งค่า 96 | type/ฟิกซ์เจอร์/CI (ไม่มีหน้าจอ) |
| `help-center` | ตั้งค่า 99 | วิธีใช้ คำศัพท์ รายงานปัญหา (`buildDiagnostics` อยู่ที่ `src/lib/diagnostics.js`) |
| `run-history` | ประวัติ 91 | ประวัติการรัน แนวโน้ม ความแม่นยำ forecast (ชีต `FC Accuracy` เลือกส่งออก) |

### Lazy loading (สัญญาของ `index.jsx`)
- `src/features/index.js` ใช้ `import.meta.glob('./*/index.jsx', { eager: true })` เก็บ **เมตาดาตาเท่านั้นใน entry chunk**: `id, order, group, tab.label/Icon/badge/enabled`, hook ที่ต้องเรียกแบบ sync (`validate`, `headerActions`, `slots`)
- Component ของแท็บ/โมดัล/พาเนลและ logic หนักต้องโหลดตามต้องการ: `const X = lazyComponent(() => import('./X.jsx'))` (`src/features/lazy.js`) และ `await import('./logic.js')` ภายใน hook ที่เป็น async (`exportSheets`, `onProcessed`, `onExported`)
- `App.jsx` ห่อ Component ด้วย `<Suspense fallback={<LoadingFallback />}>` ภายใน `FeatureErrorBoundary`; slot/โหนด header ใช้ `<Suspense fallback={null}>`
- ค่าคงที่ที่ `index.jsx` ต้องใช้ (ID, DEFAULTS, ฯลฯ) ไว้ในไฟล์เล็ก (`meta.js`/`settings.js`) แล้วให้ Component import จากไฟล์นั้น — ห้าม import Component จาก `index.jsx` แบบ static
- `src/lib/storage/index.js` ห้าม import แบบ static จาก module ที่อยู่ใน entry; ใช้ `registerKey` จาก `src/lib/storage/registry.js` (เล็ก) และ `import('../../lib/storage/index.js')` ตอนใช้งาน
- ตรวจด้วย `npm run build` (ดูคำเตือน "dynamically imported … but also statically imported") และ `npm run check:bundle`

### ระดับ QA ↔ ด่านส่งออก
- QA level → contract level: `error→confirm`, `warning→info`, `info→info` (`toContractIssue` ใน `qa-engine/model.js`, `qaLevel` ติดไปด้วยเพื่อให้ย้อนกลับได้แน่นอน)
- `block` มีเฉพาะกฎของด่านเอง (G01 ไฟล์เปลี่ยนหลังประมวลผล, G04 เดือนผลิตต่างกัน, G06/G09 …) — คำเตือน QA เป็นข้อมูลและไม่ขัดจังหวะการดาวน์โหลด; ถ้าไม่มี block/confirm ปุ่มดาวน์โหลดคลิกเดียวไม่มีหน้าต่างยืนยัน
- หน้าจออื่นที่บอกว่า "พร้อม/ไม่พบปัญหา" ต้องอ่านจาก `actions.gate` (`reviewCounts` ใน `export-gate/gate.js`) ห้ามคำนวณเอง

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
- CI (`.github/workflows/ci.yml`, actions pin SHA): job `build-test` (Node 20/22) = `npm ci` → `typecheck` → `npm test` → `build` → `check:bundle`; job `e2e` = Playwright chromium + `npm run e2e` (อัปโหลดภาพ `.e2e-out` เมื่อล้ม); typedef ของ typecheck อยู่ `src/features/test-infra/types.js`
- e2e: ไฟล์ตัวอย่างจริงมีแค่ "คำเตือน" จึงต้องดาวน์โหลดได้คลิกเดียวไม่มี dialog; สถานการณ์ QA error (R01) ต้องเปิด dialog ยืนยัน — แท็บ/พาเนลที่เป็น lazy ให้ `waitFor` เนื้อหาก่อนอ่านข้อความ
- `CI_PERF=0` ข้าม `tests/perf.test.js`
