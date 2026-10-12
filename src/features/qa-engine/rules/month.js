// Month rules. M01 is the only one that can be an error; M03 is a warning at most.
import { formatMonth } from '../../../utils/format.js';

const doneFiles = (ctx) => ctx.sourceFiles.filter((f) => f.status === 'done' && f.meta?.productionMonthRaw);
const monthIndex = (pm) => pm.year * 12 + pm.month;

// "23/01/2026" | "2026-01-23" | "20260123" -> Date | null
export const parseIssueDate = (s) => {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  let y; let mo; let d;
  if (m) [, d, mo, y] = m;
  else if ((m = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/) || t.match(/^(\d{4})(\d{2})(\d{2})$/))) [, y, mo, d] = m;
  else return null;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d) ? date : null;
};

const M01 = {
  id: 'M01', group: 'month', level: 'error', title: 'เดือนผลิตต่างกันระหว่างไฟล์',
  run(ctx) {
    const files = doneFiles(ctx);
    const counts = new Map();
    files.forEach((f) => counts.set(f.meta.productionMonthRaw, (counts.get(f.meta.productionMonthRaw) || 0) + 1));
    if (counts.size < 2) return [];
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return files.filter((f) => f.meta.productionMonthRaw !== main).map((f) => ({
      scope: 'file', plant: f.category, fileName: f.name, expected: main, actual: f.meta.productionMonthRaw,
      message: `PRODUCTION MONTH ของไฟล์นี้คือ ${f.meta.productionMonthRaw} แต่ไฟล์ส่วนใหญ่เป็น ${main}`,
      fix: 'เอาไฟล์ที่เป็นคนละเดือนออก (หรือขอไฟล์เดือนที่ถูกต้อง) แล้วกดรวมข้อมูลอีกครั้ง',
      action: { kind: 'removeFile', payload: { name: f.name } },
    }));
  },
};

const M02 = {
  id: 'M02', group: 'month', level: 'warning', title: 'เดือนในเทมเพลตต่างจากไฟล์',
  run(ctx) {
    const tm = ctx.inspection?.templateMonth;
    if (!tm || !ctx.productionMonth) return [];
    const want = formatMonth(ctx.productionMonth);
    if (String(tm).trim().toLowerCase() === want.toLowerCase()) return [];
    return [{
      scope: 'template', expected: want, actual: tm,
      message: `เทมเพลตระบุเดือน ${tm} แต่ไฟล์ต้นทางเป็นเดือน ${want}`,
      fix: 'ถ้าตั้งใจใช้เทมเพลตเดือนเดิม ให้แก้หัวเดือนในเทมเพลตหลังส่งออก หรือเลือกเทมเพลตของเดือนนี้',
    }];
  },
};

const M03 = {
  id: 'M03', group: 'month', level: 'warning', title: 'ไฟล์เดือนที่ผ่านมาแล้ว',
  run(ctx) {
    const pm = ctx.productionMonth;
    if (!pm) return [];
    const now = { year: ctx.today.getFullYear(), month: ctx.today.getMonth() + 1 };
    if (monthIndex(pm) >= monthIndex(now)) return [];
    return [{
      scope: 'run', level: 'warning', month: formatMonth(pm), expected: `เดือน ${formatMonth(now)} หรือหลังจากนั้น`, actual: formatMonth(pm),
      message: `เดือนผลิต ${formatMonth(pm)} ผ่านมาแล้ว`,
      fix: 'ถ้าตั้งใจทำย้อนหลังให้กดรับทราบ ถ้าไม่ใช่ให้ตรวจว่าเลือกไฟล์ถูกเดือน',
    }];
  },
};

const M04 = {
  id: 'M04', group: 'month', level: 'warning', title: 'ISSUE DATE ผิดปกติ',
  run(ctx) {
    return doneFiles(ctx).flatMap((f) => {
      const raw = f.meta.issueDate;
      if (raw === undefined || raw === '') return [];
      const d = parseIssueDate(raw);
      const base = { scope: 'file', plant: f.category, fileName: f.name, actual: raw };
      if (!d) return [{ ...base, expected: 'วัน/เดือน/ปี', message: `ISSUE DATE "${raw}" อ่านเป็นวันที่ไม่ได้`, fix: 'ตรวจส่วนหัวของไฟล์ต้นทาง' }];
      if (d.getTime() > ctx.today.getTime() + 24 * 3600 * 1000) return [{ ...base, expected: `ไม่เกินวันนี้`, message: `ISSUE DATE ${raw} เป็นวันในอนาคต`, fix: 'ตรวจวันที่ออกไฟล์ และนาฬิกาของเครื่อง' }];
      const pm = f.meta.productionMonth;
      if (pm && d.getFullYear() * 12 + d.getMonth() + 1 > monthIndex(pm)) {
        return [{ ...base, expected: `ก่อนสิ้นเดือน ${formatMonth(pm)}`, message: `ISSUE DATE ${raw} อยู่หลังเดือนผลิต ${formatMonth(pm)}`, fix: 'ตรวจว่าไฟล์เป็นฉบับของเดือนผลิตนี้' }];
      }
      return [];
    });
  },
};

export default [M01, M02, M03, M04];
