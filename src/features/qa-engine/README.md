# qa-engine — เครื่องมือตรวจคุณภาพกลางของแอป

Engine เดียว (pure, ไม่ใช้ DOM/React, รันใน Node ได้) + แท็บ “ตรวจคุณภาพ” + ชีต “QA Report” + การรับทราบ (waiver)
ฟีเจอร์อื่นไม่สร้าง engine / แท็บ / badge ของตัวเอง ให้เพิ่ม **กฎ** เข้า engine นี้

```js
import { runRules } from './engine.js';
runRules({ processedData, sourceFiles, productionMonth, template, inspection, settings, today, waivers }) // -> Issue[]
```

## Issue (ดู `model.js`)
`{ rule, group, level: 'error'|'warning'|'info', scope: 'row'|'file'|'plant'|'template'|'run', plant, fileName, partNumber, dockCode, sheet, rowNumber, month, message, fix, expected, actual, helpKey, action?, waived?, reason? }`
ป้ายไทย: error = ต้องแก้ · warning = ควรดู · info = ข้อมูล
ผ่าน feature contract (`validate`) จะถูกแปลงด้วย `toContractIssue`: error→`block`, warning→`confirm`, info→`info`, `code` = id กฎ, `qaLevel` = ระดับเดิม (export-gate อ่านจากตรงนี้)

## เพิ่มกฎใหม่ (ใช้เวลาไม่ถึงนาที)
1. สร้างไฟล์ `rules/<ชื่อ>.js` (หรือเพิ่มในไฟล์กลุ่มที่มีอยู่) ที่ export **array ของกฎ**
   ```js
   export default [{
     id: 'D01',                 // ตัวอักษร 1-3 ตัว + เลข 2-3 หลัก ห้ามซ้ำ
     group: 'file',             // row | file | month | layout | consistency | template
     level: 'warning',          // ระดับเริ่มต้นของ Issue (rule แต่ละ issue override ด้วย level: ... ได้)
     defaultOn: true,           // ผู้ใช้ปิดได้ที่ settings.rules[id] = false
     title: 'ชื่อกฎ (แสดงใน QA tab และหน้าตั้งค่า)',
     run(ctx) {                 // คืน array ของ Issue บางส่วน; engine เติม rule/group/level/ค่าเริ่มต้นให้
       return ctx.entries.filter(...).map((e) => ({ ...ctx.rowRef(e), message: '...', fix: '...', expected, actual }));
     },
   }];
   ```
2. ลงทะเบียนในบรรทัดเดียว: เพิ่ม `import` และใส่ในอ็อบเจ็กต์ `RULE_MODULES` ของ `rules/index.js`
   (หรือเรียก `registerRule(rule)` จาก `registry.js` ตรง ๆ — id เดิมจะถูกแทนที่)
3. เขียนเทสใน `tests/<feature>.test.js` ด้วย `runRules` + fixture จริง

`ctx` มี: `entries` (ทุกแถว: `{ row, sheet, plant, rowNumber, file, pm }`), `sourceFiles` (+ `meta`), `processedData`, `productionMonth`, `inspection` (ผลจาก template-inspector — กฎต้องข้ามเงียบถ้าไม่มีข้อมูล ห้าม parse ซ้ำ), `settings`, `today`, `monthLabel(pm,k)`, `monthCols(row)`, `rowRef(entry)`
กฎที่ throw จะกลายเป็น issue ระดับข้อมูล 1 รายการ ไม่ทำให้การตรวจล้ม

## กฎที่มี
| กลุ่ม | กฎ |
|---|---|
| row | R01 ผลรวม 31 วัน ≠ ยอดรวมเดือน · R02 ปริมาณในวันที่ไม่มีในปฏิทิน · R03 ค่าไม่ใช่ตัวเลข · R04 รูปแบบ Part Number · R05 SUPP CODE · R08 ค่าผิดปกติ/PACKING SIZE · R09 แถวที่ถูกข้าม |
| file | R06 PLANT CODE ≠ ชื่อไฟล์ · R07 FORECAST/REVISION · R10 คอลัมน์สำรอง · R11 โรงงานไม่มีไฟล์/อ่านไม่สำเร็จ |
| month | M01 เดือนผลิตต่างกัน (error เพียงข้อเดียว) · M02 เทมเพลต≠ไฟล์ · M03 เดือนที่ผ่านแล้ว (warning เสมอ) · M04 ISSUE DATE |
| layout | L01 ตำแหน่ง N..N+3 · L02 ไม่พบ sheet · L03 คอลัมน์ Plant ของ Analyze · L04 แถวหัวตาราง · L05 ข้อสังเกตจาก inspector |
| consistency | K01 Part Number ต่างกันแค่ช่องว่าง/ตัวพิมพ์ · K02 ข้อมูลหลักขัดกัน · K03 Dock · K04 ทศนิยม · K05/K06 ยอดผิดปกติ |
| template | T01 Part ไม่อยู่ใน By Plant · C01 แถวเกินความจุ Daily |

ยังไม่ทำที่นี่ (ของฟีเจอร์อื่น): D01 ซ้ำ part+dock, expected-files, stale revision → `qa-file-guards`; run-out → `runout-alerts`.

## Waivers (`waivers.js`)
`createWaiverStore(adapter)` · `waive({ issue, reason (≥3 ตัว), expires, productionMonth })` · `unwaive(key)` · `applyWaivers`
คีย์ = `rule|scopeKey|เดือนผลิต` → ไม่ข้ามเดือน, หมดอายุสิ้นเดือนผลิต, “ต้องแก้” รับทราบไม่ได้, waived ออกจาก badge/validate แต่ยังอยู่ใน QA Report
Storage ฉีดผ่าน `setWaiverAdapter({ read, write })`; ค่าเริ่มต้นเก็บผ่าน `src/lib/storage` (tier `prefs`, key `qa.waivers`) และ QaTab โหลดค่าที่บันทึกไว้ด้วย `loadSavedWaivers()`

## ตั้งค่า (`settings.js`)
`settings.rules[id] === false` ข้ามกฎ · `suppCode` · `partPattern` · `allowedForecastTypes` · `thresholds.swingRatio` · (ไม่บังคับ) `knownDocks`
UI อยู่ใน `SettingsPanel.jsx` (feature.settings.Component) แสดงใต้ “ขั้นสูง” เท่านั้น
