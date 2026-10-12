# CLI รวมแผนการผลิต (โหมด batch)

รันขั้นตอนเดียวกับหน้าเว็บ — อ่านไฟล์ต้นทาง → ตรวจคุณภาพ (QA engine) → ด่านตรวจก่อนส่งออก (export gate) → เขียนลงเทมเพลต → ตรวจไฟล์ที่ส่งออก (verify) — โดยไม่ต้องเปิดเบราว์เซอร์
**ไม่มีไฟล์ใดออกจากเครื่อง** (ไม่เรียก network) และไม่เขียนไฟล์ผลลัพธ์หากยังไม่ผ่านด่านตรวจ

> **หมายเหตุสำหรับ IT:** เครื่องที่รัน batch จะเก็บไฟล์พยากรณ์ของลูกค้า (ข้อมูลลับทางธุรกิจ) และไฟล์ผลลัพธ์ไว้ในโฟลเดอร์ `--input` / `--out` ควรจำกัดสิทธิ์โฟลเดอร์และลบไฟล์เก่าตามนโยบายของบริษัท

## ติดตั้ง
ต้องการ Node.js **>= 20.19**

```bash
npm ci
npm run consolidate -- --input ./input --template ./template.xlsx --out ./out
# หรือ
node scripts/consolidate.mjs --input ./input --template ./template.xlsx --out ./out
```

## ตัวเลือก
| ตัวเลือก | ความหมาย |
|---|---|
| `--input <dir>` | โฟลเดอร์ไฟล์ `.xls/.xlsx` ของโรงงาน (ชื่อต้องขึ้นต้น BP / BPK / GW / SR; ไฟล์อื่นถูกข้ามพร้อมคำเตือน) |
| `--template <file>` | เทมเพลต `.xlsx` ของบริษัท |
| `--out <dir>` | โฟลเดอร์ผลลัพธ์ (ค่าเริ่มต้น `./out`) |
| `--profile <json>` | โปรไฟล์ตั้งค่า (เช่น `export.fileNamePattern`, `features["qa-engine"].settings`) |
| `--name <pattern>` | รูปแบบชื่อไฟล์ เช่น `Production_Updated_{month}_{date}.xlsx` |
| `--csv` / `--json` / `--bundle` | ส่งออกข้อมูลแบบ flat (CSV long + summary / JSON / zip รวม) |
| `--allow-warnings` | ยอมให้รายการระดับ "ควรดู" (confirm) ผ่านด่าน — รายการ "ต้องแก้" (block) ยังบล็อกเสมอ |
| `--now <ISO>` | กำหนดเวลาปัจจุบัน ทำให้ไฟล์ผลลัพธ์เหมือนเดิมทุกครั้ง (sha256 เท่ากัน) |
| `--quiet` | ไม่พิมพ์รายละเอียดทาง stderr |

คำสั่งย่อย: `consolidate verify <ไฟล์.xlsx> --input <dir> [--template <file>]` ตรวจไฟล์ที่ส่งออกกับไฟล์ต้นทางอีกครั้ง

## Exit code
| code | ความหมาย |
|---|---|
| `0` | สำเร็จ สร้างไฟล์และตรวจผ่าน |
| `1` | ผิดพลาดร้ายแรง (หาโฟลเดอร์/เทมเพลตไม่เจอ, ตัวเลือกผิด) |
| `2` | ไม่ผ่านด่านตรวจ — **ไม่สร้างไฟล์ .xlsx** (รายละเอียดภาษาไทยที่ stderr) |
| `3` | สร้างไฟล์แล้วแต่ตรวจไฟล์ส่งออกไม่ผ่าน — ชื่อไฟล์ลงท้าย `_UNVERIFIED.xlsx` อย่าส่งต่อ |

## JSON บน stdout
stdout มี **JSON หนึ่งบรรทัดเท่านั้น** (ข้อความอ่านง่ายอยู่ที่ stderr)

```json
{
  "schemaVersion": 1,
  "outputs":  [{ "path": "out/Production_Updated_Feb26_2026-02-05.xlsx", "sha256": "…", "bytes": 221229 }],
  "files":    [{ "name": "BP veh 481D.xls", "plant": "BP", "rows": 8, "productionMonth": "202602", "revision": "0", "sha256": "…" }],
  "totals":   { "overall": { "n": 48934, "n1": 51986, "n2": 40646, "n3": 35476 }, "rows": { "BP": 8, "BPK": 12, "GW": 5, "SR": 4 } },
  "findings": [{ "source": "qa", "level": "confirm", "code": "L05", "message": "…", "sheet": "GW Daily", "fix": "…" }],
  "verification": { "ok": true, "mode": "template", "failed": [] },
  "warnings": ["ข้ามไฟล์ download.xlsx: …"],
  "exitCode": 0
}
```
`findings[].level` = `block` | `confirm` | `info` (รายการ info รวมเป็นหนึ่งแถวต่อกฎ พร้อม `count`) · `outputs` รวม manifest `run_{เดือน}.json` ด้วย

## ตัวอย่าง n8n (Execute Command)
```text
node /srv/moowhan/scripts/consolidate.mjs --input /data/forecast/2026-02 --template /data/template.xlsx --out /data/out --allow-warnings --quiet
```
ต่อด้วยโหนด **IF** ที่ดู `exitCode` จาก stdout (parse JSON): `0` → ส่งไฟล์ต่อ · `2` → แจ้งผู้ดูแลพร้อม `findings` · `3`/`1` → แจ้งเตือนทันที
