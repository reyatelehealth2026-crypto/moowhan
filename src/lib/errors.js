// ==================== USER-FACING ERRORS (pure, Thai) ====================
// toUserError maps low-level library messages to { title, cause, fix, helpKey, technical }.
// The raw message is kept in `technical` only; cell values are never echoed.

export const ERROR_CATALOG = {
  'zip-corrupt': { title: 'อ่านไฟล์ Excel ไม่ได้', cause: 'ไฟล์เสียหาย ไม่ครบ หรือไม่ใช่ไฟล์ .xlsx จริง (อาจเปลี่ยนนามสกุลเฉยๆ)', fix: 'เปิดไฟล์ใน Excel แล้ว “บันทึกเป็น” .xlsx ใหม่ จากนั้นอัปโหลดอีกครั้ง', helpKey: 'sheet-analyze' },
  'xls-unreadable': { title: 'อ่านไฟล์ต้นทางไม่ได้', cause: 'รูปแบบไฟล์ไม่ตรงกับไฟล์พยากรณ์ของ TMT', fix: 'ตรวจว่าเป็นไฟล์ .xls/.xlsx ที่ดาวน์โหลดจากระบบ TMT โดยไม่ได้แก้ไขโครงสร้าง', helpKey: 'file-name-rule' },
  'no-sheet': { title: 'ไม่พบชีทที่ต้องการ', cause: 'ไฟล์ไม่มีชีทข้อมูล หรือชื่อชีทไม่ตรงกับที่แอปคาดไว้', fix: 'ตรวจชื่อชีทในเทมเพลต (เช่น BP Daily, Analyze) ให้ตรงกับคู่มือ', helpKey: 'sheet-analyze' },
  'plant-mismatch': { title: 'ชื่อไฟล์ไม่ตรงกับโรงงานในไฟล์', cause: 'ชื่อไฟล์ขึ้นต้นด้วยโรงงานหนึ่ง แต่ PLANT CODE ในหัวไฟล์เป็นอีกโรงงาน', fix: 'ตรวจว่าเลือกไฟล์ถูกโรงงาน หรือเปลี่ยนชื่อไฟล์ให้ขึ้นต้น BP/BPK/GW/SR ตรงกับข้อมูล', helpKey: 'file-name-rule' },
  'template-missing-sheet': { title: 'เทมเพลตไม่มีชีทที่แอปต้องเขียน', cause: 'ชื่อชีทในเทมเพลตถูกเปลี่ยนหรือลบ', fix: 'คืนชื่อชีทเป็น BP Daily, BPK Daily, GW Daily, SR Daily และ Analyze', helpKey: 'sheet-bp-daily' },
  'empty-rows': { title: 'ไม่พบแถวข้อมูล', cause: 'ไม่พบแถวหัวตาราง “PART NUMBER” หรือไฟล์ไม่มีข้อมูล', fix: 'เปิดไฟล์ตรวจว่ามีแถวหัวตารางและข้อมูลต่อจากนั้น', helpKey: 'part-number' },
  generic: { title: 'เกิดข้อผิดพลาดที่ไม่คาดคิด', cause: 'แอปไม่รู้จักสาเหตุของข้อผิดพลาดนี้', fix: 'ลองอัปโหลดไฟล์ใหม่ หากยังเป็นอยู่ให้กด “รายงานปัญหา” แล้วส่งไฟล์รายงานให้ผู้ดูแล', helpKey: null },
};

const RULES = [
  [/end of central directory|zip|corrupt|not a valid|invalid.*(zip|signature)|bad compressed/i, 'zip-corrupt'],
  [/unsupported file|cfb|not.*spreadsheet|bad .*header/i, 'xls-unreadable'],
  [/sheet.*(not found|missing)|no worksheet|ไม่มี worksheet/i, 'no-sheet'],
];

/** err: Error|string. ctx: optional { fileName }. Never throws. */
export const toUserError = (err, ctx = {}) => {
  const raw = String(err?.message ?? err ?? '');
  const hit = RULES.find(([re]) => re.test(raw));
  const code = hit ? hit[1] : 'generic';
  return { code, ...ERROR_CATALOG[code], technical: raw, fileName: ctx.fileName || undefined };
};

/** Flat Thai text of a user error (for string-only consumers such as logs). */
export const userErrorText = (e) => `${e.title}${e.fileName ? ` (${e.fileName})` : ''}: ${e.cause} ${e.fix}`;

/** Export notice from a patcher report. Skipped sheets => warning tone. */
export const buildExportNotice = (report, fileName) => {
  const skipped = [...new Set(report?.skipped || [])].filter(Boolean); // template sheets that were not found
  const parts = report?.mode === 'template'
    ? `เขียนลงเทมเพลต: ${(report.patched || []).map((p) => `${p.sheet} ${p.rows} แถว`).join(', ')}`
    : 'สร้างไฟล์ใหม่ (ไม่มีเทมเพลต .xlsx)';
  const lines = [`ดาวน์โหลด ${fileName} แล้ว • ${parts}`];
  if (skipped.length) lines.push(`ข้ามชีท (ไม่พบในเทมเพลต): ${skipped.join(', ')}`);
  if (report?.warnings?.length) lines.push(...report.warnings);
  return { tone: skipped.length || report?.warnings?.length ? 'warning' : 'success', message: lines.join('\n') };
};
