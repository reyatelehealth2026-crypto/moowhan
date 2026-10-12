// Template rules. Data comes only from template.inspection (template-inspector); nothing is parsed here
// and unknown values skip the rule. D01 (duplicate part+dock) lives in qa-file-guards.
import { DAILY_SHEETS } from '../../../constants.js';
import { templateCapacityReport } from '../../template-inspector/capacity.js';

const keyOf = (e) => `${String(e.row.partNumber ?? '').trim().slice(0, 11)}${e.plant}`;

const T01 = {
  id: 'T01', group: 'template', level: 'warning', title: 'Part ไม่อยู่ใน By Plant',
  run(ctx) {
    const keys = ctx.inspection?.masters?.byPlantKeys; // deep inspection only
    if (!Array.isArray(keys) || !keys.length) return [];
    const set = new Set(keys);
    return ctx.entries.filter((e) => !set.has(keyOf(e))).map((e) => ({
      ...ctx.rowRef(e), scope: 'row', expected: keyOf(e), actual: 'ไม่พบ',
      message: `${e.row.partNumber} (${e.plant}) ไม่อยู่ในตาราง By Plant ของเทมเพลต ยอดจะไม่ขึ้นในสรุป`,
      fix: 'เพิ่ม Part นี้ใน sheet By Plant ของเทมเพลต แล้วกด Data > Refresh All หลังส่งออก',
    }));
  },
};

const C01 = {
  id: 'C01', group: 'template', level: 'warning', title: 'แถวเกินความจุของ Daily',
  run(ctx) {
    if (!ctx.inspection?.sheets?.length) return [];
    const counts = Object.fromEntries(DAILY_SHEETS.filter((s) => ctx.processedData[s]).map((s) => [s, ctx.processedData[s].length]));
    return templateCapacityReport(ctx.inspection, counts)
      .filter((r) => r.over && DAILY_SHEETS.includes(r.sheet))
      .map((r) => ({
        scope: 'plant', plant: r.sheet.split(' ')[0], sheet: r.sheet, rowNumber: r.sumRow, expected: `≤ ${r.capacity} แถว`, actual: r.rows,
        message: `${r.sheet}: มี ${r.rows} แถว แต่เทมเพลตรับได้ ${r.capacity} แถว (แถว ${r.sumRow} เป็นสูตรรวม)`,
        fix: 'เพิ่มแถวว่างในเทมเพลตก่อนแถวสูตรรวม (Insert Row ให้สูตรขยายตาม) แล้วอัปโหลดเทมเพลตใหม่ มิฉะนั้นแถวที่เกินจะไม่ถูกเขียน',
      }));
  },
};

export default [T01, C01];
