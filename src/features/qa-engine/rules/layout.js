// Layout rules. Everything comes from template.inspection (template-inspector); silently skipped when it has no data.
import { ANALYZE_SHEET, DAILY_SHEETS, MONTH_HEADERS, TEMPLATE } from '../../../constants.js';

const L01 = {
  id: 'L01', group: 'layout', level: 'error', title: 'ตำแหน่ง N..N+3 ไม่ตรงกับเทมเพลต',
  run(ctx) {
    const nCols = ctx.inspection?.nCols; // 1-based columns of the 4 totals on a Daily sheet
    if (!Array.isArray(nCols) || nCols.length !== 4) return [];
    const want = nCols.map((c) => c - 1);
    const seen = new Set();
    const out = [];
    ctx.entries.forEach((e) => {
      if (seen.has(e.row.fileName)) return;
      seen.add(e.row.fileName);
      const pos = ctx.monthCols(e.row);
      const bad = pos.filter(({ k, col }) => col !== want[k]);
      if (!bad.length) return;
      out.push({
        scope: 'file', plant: e.plant, fileName: e.row.fileName, sheet: e.sheet,
        expected: want.map((c) => c + 1).join(', '), actual: pos.map(({ col }) => col + 1).join(', '),
        message: `ตำแหน่งคอลัมน์ ${bad.map(({ k }) => MONTH_HEADERS[k]).join(', ')} ในไฟล์ไม่ตรงกับเทมเพลต (คาดคอลัมน์ ${want.map((c) => c + 1).join('/')}) ข้อมูลที่เขียนลงเทมเพลตจะเลื่อนผิดช่อง`,
        fix: 'ใช้ไฟล์ต้นทางที่มีผังคอลัมน์มาตรฐาน หรืออัปเดตเทมเพลตให้ตรงกับผังใหม่ก่อนส่งออก',
      });
    });
    return out;
  },
};

const L02 = {
  id: 'L02', group: 'layout', level: 'warning', title: 'ไม่พบ sheet ในเทมเพลต',
  run(ctx) {
    const missing = ctx.inspection?.missingSheets;
    if (!Array.isArray(missing) || !missing.length) return [];
    return missing.map((name) => ({
      scope: 'template', sheet: name, plant: DAILY_SHEETS.includes(name) ? name.split(' ')[0] : '',
      expected: name, actual: 'ไม่พบ',
      message: `เทมเพลตไม่มี sheet "${name}" ข้อมูลของ sheet นี้จะไม่ถูกเขียน`,
      fix: `ใช้เทมเพลตล่าสุดของบริษัท หรือเพิ่ม sheet ชื่อ "${name}" ให้ตรงตัวอักษร`,
    }));
  },
};

const L03 = {
  id: 'L03', group: 'layout', level: 'warning', title: 'คอลัมน์ Plant ของ Analyze ย้ายตำแหน่ง',
  run(ctx) {
    const col = ctx.inspection?.analyze?.plantCol;
    if (!col || col === TEMPLATE.analyzePlantCol) return [];
    return [{
      scope: 'template', sheet: ANALYZE_SHEET, expected: TEMPLATE.analyzePlantCol, actual: col,
      message: `คอลัมน์ Plant ใน ${ANALYZE_SHEET} อยู่ที่คอลัมน์ ${col} ไม่ใช่ ${TEMPLATE.analyzePlantCol} (EH)`,
      fix: 'ตรวจว่าเทมเพลตไม่ถูกแทรก/ลบคอลัมน์ ถ้าเปลี่ยนผังจริงให้แจ้งผู้ดูแลระบบ',
    }];
  },
};

const L04 = {
  id: 'L04', group: 'layout', level: 'info', title: 'แถวหัวตารางต่างจากมาตรฐาน',
  run(ctx) {
    const out = [];
    (ctx.inspection?.sheets || []).forEach((s) => {
      const std = s.role === 'daily' ? [TEMPLATE.dailyHeaderRow, TEMPLATE.dailyDataStartRow] : s.role === 'analyze' ? [TEMPLATE.analyzeHeaderRow, TEMPLATE.analyzeDataStartRow] : null;
      if (!std || !s.headerRow || (s.headerRow === std[0] && s.dataStartRow === std[1])) return;
      out.push({
        scope: 'template', sheet: s.name, expected: `หัว ${std[0]} / ข้อมูล ${std[1]}`, actual: `หัว ${s.headerRow} / ข้อมูล ${s.dataStartRow}`,
        message: `${s.name}: แถวหัวตารางอยู่ที่แถว ${s.headerRow} (มาตรฐานแถว ${std[0]})`,
        fix: 'ตรวจว่าไม่มีการแทรกแถวเหนือหัวตารางในเทมเพลต',
      });
    });
    return out;
  },
};

// Structural facts of the template inspector, surfaced here so everything is on one QA screen (capped at warning).
const L05 = {
  id: 'L05', group: 'layout', level: 'info', title: 'ข้อสังเกตโครงสร้างเทมเพลต',
  run(ctx) {
    return (ctx.inspection?.issues || [])
      .filter((i) => i.code !== 'SHEET_MISSING')
      .map((i) => ({
        scope: 'template', level: i.level === 'info' ? 'info' : 'warning', sheet: i.sheet || '', actual: i.code,
        message: i.message, fix: i.fix || '', helpKey: i.code,
      }));
  },
};

export default [L01, L02, L03, L04, L05];
