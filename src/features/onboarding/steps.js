// Pure: derives the 5-step progress strip from app state (no React/DOM).
import { PLANTS } from '../../constants.js';

const countsOf = (state) => {
  const files = state?.sourceFiles || [];
  const fc = state?.fileCounts;
  return Object.fromEntries(PLANTS.map((p) => [p, fc?.[p] ?? files.filter((f) => f.category === p).length]));
};

/** QA findings, if a QA feature published any (defensive: shape and location may vary). */
export const readFindings = (state) => {
  const f = state?.features || {};
  const list = f.qa?.findings ?? f['qa-engine']?.findings ?? f.qa?.issues;
  return Array.isArray(list) ? list : undefined;
};

const unresolvedErrors = (findings) =>
  findings.filter((x) => x && x.level === 'error' && !(x.acknowledged || x.ack || x.status === 'acknowledged'));

/**
 * @returns {{ id: string, label: string, status: 'todo'|'current'|'done', hint: string }[]}
 */
export function computeSteps(state = {}, findings = readFindings(state)) {
  const files = state.sourceFiles || [];
  const usable = files.filter((f) => f.status === 'done' || f.status === 'ready');
  const hasFiles = usable.length > 0;
  const counts = countsOf(state);
  const processed = !!state.processedData;
  const stale = !!state.isStale;
  const fresh = processed && !stale;

  const missing = PLANTS.filter((p) => counts[p] === 0);
  const countHint = PLANTS.map((p) => `${p} ${counts[p]}`).join(' · ');

  const done1 = !!state.template;
  const done2 = hasFiles;
  const done3 = fresh;
  const open = fresh && findings ? unresolvedErrors(findings) : [];
  const done4 = fresh && open.length === 0;
  const done5 = fresh && !!state.lastExport && state.lastExport.signature === state.processedSignature;

  const hints = [
    done1 ? 'พร้อมแล้ว' : hasFiles ? 'ข้าม - จะสร้างไฟล์ใหม่' : 'ไม่บังคับ แต่แนะนำเพื่อรักษา pivot/สูตร',
    hasFiles ? `${countHint}${missing.length ? ` · ขาด: ${missing.join(', ')}` : ''}` : 'ลากไฟล์ BP / BPK / GW / SR มาวาง',
    stale ? 'ไฟล์เปลี่ยนไปแล้ว - กดประมวลผลใหม่' : done3 ? 'ประมวลผลแล้ว' : hasFiles ? 'กด “รวมข้อมูลและคำนวณ”' : 'รอไฟล์โรงงาน',
    !fresh ? 'รอประมวลผล' : open.length ? `มีข้อผิดพลาดที่ต้องตรวจ ${open.length} รายการ` : 'ไม่พบสิ่งที่ต้องแก้',
    done5 ? 'ดาวน์โหลดแล้ว' : fresh ? 'พร้อมดาวน์โหลด' : 'รอประมวลผล',
  ];

  const defs = [
    ['template', 'ไฟล์หลัก', done1],
    ['sources', 'ไฟล์โรงงาน', done2],
    ['process', 'ประมวลผล', done3],
    ['review', 'ตรวจสอบ', done4],
    ['export', 'ดาวน์โหลด', done5],
  ];
  // the template step is optional: it is only "current" while nothing else has been added yet
  const currentIdx = defs.findIndex(([id, , done], i) => !done && (i !== 0 || !hasFiles));
  return defs.map(([id, label, done], i) => ({
    id, label, hint: hints[i],
    status: done ? 'done' : i === currentIdx ? 'current' : 'todo',
  }));
}
