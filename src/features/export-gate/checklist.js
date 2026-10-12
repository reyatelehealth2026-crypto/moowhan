// ==================== POST-EXPORT CHECKLIST (pure) ====================
// buildChecklist({ report, verification, expected, highlight, plannedCellWrites }) -> items
//   item: { kind: 'written'|'skipped'|'warning'|'check'|'info', ok?: boolean|null, text, detail? }
import { formatNumber } from '../../utils/format.js';

export const KIND_LABEL = { written: 'เขียนแล้ว', skipped: 'ข้าม', warning: 'คำเตือน', check: 'ผลตรวจไฟล์', info: 'ขั้นตอนถัดไป' };

const SKIP_REASON = { protected: 'ชื่อซ้ำกับชีตของเทมเพลต', duplicate: 'ชื่อซ้ำกับชีตอื่นที่ส่งออก' };
const CELL_SKIP = { 'skipped-formula': 'เป็นสูตร', 'skipped-sheet': 'ไม่พบชีต', 'skipped-ref': 'ตำแหน่งเซลล์ไม่ถูกต้อง' };

export const buildChecklist = ({ report, verification = null, expected = null, highlight = true, plannedCellWrites = [] } = {}) => {
  const items = [];
  const add = (kind, text, extra = {}) => items.push({ kind, text, ...extra });
  const patched = report?.patched || [];

  patched.filter((p) => !p.created && p.startRow !== 1).forEach((p) =>
    add('written', `${p.sheet}: ${formatNumber(p.rows)} แถว (เริ่มแถว ${p.startRow})`, { sheet: p.sheet }));
  patched.filter((p) => p.created || p.startRow === 1).forEach((p) =>
    add('written', `ชีตเสริม ${p.sheet}: ${formatNumber(p.rows)} แถว`, { sheet: p.sheet }));
  const cells = report?.cellWrites || [];
  if (cells.some((c) => c.status === 'written')) add('written', `เซลล์หัวเทมเพลต ${cells.filter((c) => c.status === 'written').length} รายการ`);

  (report?.skipped || []).forEach((s) => add('skipped', `${s}: ไม่พบชีตนี้ในเทมเพลต จึงไม่ได้เขียน`, { sheet: s }));
  (report?.skippedSheets || []).forEach((s) => add('skipped', `ชีตเสริม ${s.name}: ${SKIP_REASON[s.reason] || s.reason}`, { sheet: s.name }));
  (report?.overflow || []).forEach((o) =>
    add('skipped', `${o.sheet}: ข้อมูล ${formatNumber(o.rows)} แถว เกินพื้นที่ ${formatNumber(o.capacity)} แถว — ไม่ได้เขียน ${formatNumber(o.dropped.length)} แถว`, { sheet: o.sheet }));
  cells.filter((c) => c.status !== 'written').forEach((c) =>
    add('skipped', `เซลล์ ${c.sheet}!${c.ref}: ${CELL_SKIP[c.status] || c.status}`, { sheet: c.sheet }));
  // header cells planned but never reported as written (the patcher did not run them at all)
  const done = new Set(cells.map((c) => `${c.sheet}!${c.ref}`));
  plannedCellWrites.filter((w) => w?.sheet && !done.has(`${w.sheet}!${String(w.ref).toUpperCase()}`) && !done.has(`${w.sheet}!${w.ref}`)).forEach((w) =>
    add('skipped', `เซลล์หัว ${w.sheet}!${w.ref}: ยังไม่ได้เขียน`, { sheet: w.sheet }));

  (report?.warnings || []).forEach((w) => add('warning', w));

  if (verification) {
    const checks = verification.checks || [];
    const pass = checks.filter((c) => c.ok === true).length;
    const fail = checks.filter((c) => c.ok === false);
    const na = checks.filter((c) => c.ok === null).length;
    add('check', `ตรวจไฟล์หลังส่งออก: ผ่าน ${pass} • ไม่ผ่าน ${fail.length} • ข้าม ${na}${verification.sampled ? ' (สุ่มตรวจแถวเพราะไฟล์ใหญ่)' : ''}`, { ok: fail.length === 0 });
    fail.forEach((c) => add('warning', `${c.label}: คาดว่า ${c.expected} แต่พบ ${c.actual}${c.detail ? ` (${c.detail})` : ''}`, { check: c.id, sheet: c.sheet }));
  } else {
    add('check', 'ยังไม่ได้ตรวจไฟล์หลังส่งออก', { ok: null });
  }

  if (expected?.cells?.length) {
    const first = expected.cells.filter((c) => c.month === 'n').map((c) => `${c.sheet}!${c.ref} = ${formatNumber(c.value)}`);
    add('info', `ยอด N ที่ Excel ควรแสดงเมื่อคำนวณใหม่ (advisory, สำหรับ SUM ธรรมดา): ${first.join(' • ')}`);
  }
  add('info', 'เปิดไฟล์แล้วกด Enable Editing จากนั้น Data → Refresh All เพื่ออัปเดต pivot และสูตรทั้งหมด');
  if (highlight && patched.length) add('info', 'แถวที่เขียนใหม่ถูกไฮไลต์สีฟ้าอ่อน ใช้ตรวจเทียบแล้วลบสีได้ตามต้องการ');
  return items;
};
