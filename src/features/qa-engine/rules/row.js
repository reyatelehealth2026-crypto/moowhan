// Row rules R01-R05, R08, R09. Day columns are the 31 columns just before each month total
// (total column from row.colPositions, never hard-coded).
import { PART_NUMBER_PATTERN } from '../../../constants.js';
import { THAI_MONTHS, formatNumber } from '../../../utils/format.js';

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const num = (v) => (typeof v === 'number' ? v : Number(String(v).trim()));
const isNumeric = (v) => !isBlank(v) && Number.isFinite(num(v));
const DAYS = 31;

/** [{ day: 1..31, col, value }] raw cells of one month block */
export const dayCells = (row, totalCol) => {
  const first = totalCol - DAYS;
  if (first < 0) return [];
  return Array.from({ length: DAYS }, (_, i) => ({ day: i + 1, col: first + i, value: row.rawRow?.[first + i] }));
};

const daysInMonth = (pm, k) => {
  const idx = pm.month - 1 + k;
  const year = pm.year + Math.floor(idx / 12);
  const month = ((idx % 12) + 12) % 12;
  return { n: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), month };
};

const R01 = {
  id: 'R01', group: 'row', level: 'error', title: 'ผลรวม 31 วัน ไม่เท่ากับยอดรวมเดือน',
  run(ctx) {
    const out = [];
    ctx.entries.forEach((e) => {
      ctx.monthCols(e.row).forEach(({ k, col }) => {
        const total = e.row.rawRow?.[col];
        if (!isBlank(total) && !isNumeric(total)) return; // R03 reports it
        const cells = dayCells(e.row, col);
        if (!cells.length) return;
        const sum = cells.reduce((s, c) => s + (isNumeric(c.value) ? num(c.value) : 0), 0);
        const actual = isBlank(total) ? 0 : num(total);
        if (sum === actual) return;
        const edited = !!e.row.edited;
        out.push({
          ...ctx.rowRef(e), scope: 'row', month: ctx.monthLabel(e.pm, k),
          level: edited ? 'info' : 'error',
          expected: sum, actual,
          message: `${ctx.monthLabel(e.pm, k)}: ผลรวมรายวัน ${formatNumber(sum)} ไม่เท่ากับยอดรวมเดือน ${formatNumber(actual)} (ต่าง ${formatNumber(actual - sum)})${edited ? ' — แถวนี้ถูกแก้มือ' : ''}`,
          fix: edited ? 'ยอดรวมถูกแก้มือจึงไม่ตรงกับรายวัน ตรวจว่าตั้งใจ หรือแก้ให้ตรงกับไฟล์ต้นทาง' : 'เปิดไฟล์ต้นทางตรวจยอดรายวันและยอดรวมของแถวนี้ ขอไฟล์ใหม่จากผู้ส่งถ้าตัวเลขไม่ตรงกัน',
          action: { kind: 'goTo', payload: { tab: 'preview' } },
        });
      });
    });
    return out;
  },
};

const R02 = {
  id: 'R02', group: 'row', level: 'error', title: 'มีปริมาณในวันที่ไม่มีในปฏิทิน',
  run(ctx) {
    const out = [];
    ctx.entries.forEach((e) => {
      if (!e.pm) return;
      ctx.monthCols(e.row).forEach(({ k, col }) => {
        const { n, month } = daysInMonth(e.pm, k);
        if (n >= DAYS) return;
        const bad = dayCells(e.row, col).filter((c) => c.day > n && isNumeric(c.value) && num(c.value) !== 0);
        if (!bad.length) return;
        const list = bad.map((c) => `${c.day} ${THAI_MONTHS[month]}`).join(', ');
        out.push({
          ...ctx.rowRef(e), scope: 'row', month: ctx.monthLabel(e.pm, k), expected: 0, actual: bad.reduce((s, c) => s + num(c.value), 0),
          message: `${ctx.monthLabel(e.pm, k)}: มีปริมาณในวันที่ไม่มีในเดือนนี้ (${list})`,
          fix: 'ตรวจว่าไฟล์ต้นทางเลื่อนคอลัมน์หรือเลือกเดือนผิด แล้วขอไฟล์ใหม่',
          action: { kind: 'goTo', payload: { tab: 'preview' } },
        });
      });
    });
    return out;
  },
};

const R03 = {
  id: 'R03', group: 'row', level: 'warning', title: 'ค่าที่ไม่ใช่ตัวเลขถูกนับเป็น 0',
  run(ctx) {
    const out = [];
    ctx.entries.forEach((e) => {
      ctx.monthCols(e.row).forEach(({ k, col }) => {
        const cells = [...dayCells(e.row, col), { day: 0, col, value: e.row.rawRow?.[col] }];
        const bad = cells.filter((c) => !isBlank(c.value) && !isNumeric(c.value));
        if (!bad.length) return;
        const first = bad[0];
        out.push({
          ...ctx.rowRef(e), scope: 'row', month: ctx.monthLabel(e.pm, k), expected: 'ตัวเลข', actual: String(first.value),
          message: `${ctx.monthLabel(e.pm, k)}: พบค่าที่ไม่ใช่ตัวเลข ${bad.length} ช่อง (เช่น "${first.value}" ใน${first.day ? `วันที่ ${first.day}` : 'ยอดรวม'}) ระบบนับเป็น 0`,
          fix: 'แก้ช่องนั้นในไฟล์ต้นทางให้เป็นตัวเลขล้วน (ไม่มีเครื่องหมายจุลภาคหรือข้อความ) แล้วอัปโหลดใหม่',
        });
      });
    });
    return out;
  },
};

const R04 = {
  id: 'R04', group: 'row', level: 'warning', title: 'รูปแบบ Part Number',
  run(ctx) {
    let re = PART_NUMBER_PATTERN;
    if (ctx.settings.partPattern) { try { re = new RegExp(ctx.settings.partPattern); } catch { /* keep default */ } }
    return ctx.entries.filter((e) => !re.test(String(e.row.partNumber || ''))).map((e) => ({
      ...ctx.rowRef(e), scope: 'row', expected: 'เช่น 86790-0K051-00', actual: e.row.partNumber,
      message: `Part Number "${e.row.partNumber}" ไม่ตรงรูปแบบที่คาด`,
      fix: 'ตรวจตัวอักษรและขีดกลางของ Part Number กับไฟล์ต้นทาง (ถ้ารูปแบบนี้ถูกต้อง ปรับรูปแบบในตั้งค่าขั้นสูง)',
    }));
  },
};

const R05 = {
  id: 'R05', group: 'row', level: 'warning', title: 'SUPP CODE ไม่ตรง',
  run(ctx) {
    const want = String(ctx.settings.suppCode || '').trim().toUpperCase();
    if (!want) return [];
    const groups = new Map();
    ctx.entries.forEach((e) => {
      const got = String(e.row.suppCode ?? '').trim();
      if (got.toUpperCase() === want) return;
      const key = `${e.row.fileName}|${got}`;
      if (!groups.has(key)) groups.set(key, { ...ctx.rowRef(e), got, count: 0 });
      groups.get(key).count += 1;
    });
    return [...groups.values()].map(({ got, count, ...ref }) => ({
      ...ref, scope: 'file', expected: want, actual: got || '(ว่าง)',
      message: `SUPP CODE "${got || 'ว่าง'}" ไม่ตรงกับ ${want} (${count} แถว)`,
      fix: 'ตรวจว่าเป็นไฟล์ของผู้ผลิตที่ถูกต้อง ถ้าเปลี่ยนรหัสจริงให้ปรับ SUPP CODE ในตั้งค่าขั้นสูง',
    }));
  },
};

const R08 = {
  id: 'R08', group: 'row', level: 'warning', title: 'ค่าผิดปกติของปริมาณ / PACKING SIZE',
  run(ctx) {
    const out = [];
    ctx.entries.forEach((e) => {
      const { row } = e;
      const months = ctx.monthCols(row);
      // negative quantities (days or totals) -> error
      const negatives = [];
      months.forEach(({ k, col }) => {
        [...dayCells(row, col), { day: 0, col, value: row.rawRow?.[col] }].forEach((c) => {
          if (isNumeric(c.value) && num(c.value) < 0) negatives.push({ k, ...c });
        });
      });
      if (negatives.length) {
        const f = negatives[0];
        out.push({
          ...ctx.rowRef(e), level: 'error', month: ctx.monthLabel(e.pm, f.k), expected: '≥ 0', actual: num(f.value),
          message: `พบปริมาณติดลบ ${negatives.length} ช่อง (เริ่มที่ ${ctx.monthLabel(e.pm, f.k)} ${f.day ? `วันที่ ${f.day}` : 'ยอดรวม'} = ${num(f.value)})`,
          fix: 'ตรวจไฟล์ต้นทาง ปริมาณแผนผลิตต้องไม่ติดลบ',
        });
      }
      const ps = Number(row.packingSize);
      const badPack = !Number.isFinite(ps) || ps <= 0 || !Number.isInteger(ps);
      if (badPack) {
        out.push({
          ...ctx.rowRef(e), level: 'warning', expected: 'จำนวนเต็ม > 0', actual: row.packingSize,
          message: `PACKING SIZE "${row.packingSize}" ต้องเป็นจำนวนเต็มมากกว่า 0`,
          fix: 'ตรวจ PACKING SIZE ในไฟล์ต้นทาง',
        });
      }
      const totals = ['n', 'n1', 'n2', 'n3'].map((key) => Number(row[key]) || 0);
      if (totals.every((t) => t === 0)) {
        out.push({ ...ctx.rowRef(e), level: 'info', expected: '> 0', actual: 0, message: 'ยอด N ถึง N+3 เป็น 0 ทั้งหมด', fix: 'ถ้าไม่มีแผนผลิตจริง ไม่ต้องทำอะไร ถ้าไม่ใช่ให้ตรวจไฟล์ต้นทาง' });
      } else if (!badPack) {
        const off = totals.map((t, k) => ({ t, k })).filter(({ t }) => t % ps !== 0);
        if (off.length) {
          out.push({
            ...ctx.rowRef(e), level: 'info', month: ctx.monthLabel(e.pm, off[0].k), expected: `ทวีคูณของ ${ps}`, actual: off.map(({ t }) => t).join(', '),
            message: `ยอดไม่ลงตัวกับ PACKING SIZE ${ps}: ${off.map(({ t, k }) => `${ctx.monthLabel(e.pm, k)} = ${formatNumber(t)}`).join(', ')}`,
            fix: 'ปกติยอดรวมควรหารด้วยขนาดบรรจุลงตัว ตรวจกับไฟล์ต้นทางถ้าสงสัย',
          });
        }
      }
    });
    return out;
  },
};

const R09 = {
  id: 'R09', group: 'row', level: 'warning', title: 'แถวที่ถูกข้ามตอนอ่านไฟล์',
  run(ctx) {
    return ctx.sourceFiles.filter((f) => f.meta?.skippedRows?.length).map((f) => {
      const rows = f.meta.skippedRows;
      return {
        scope: 'file', plant: f.category, fileName: f.name, rowNumber: rows[0].rowNumber, expected: 0, actual: rows.length,
        message: `ข้าม ${rows.length} แถวที่มีข้อมูลแต่ Part Number สั้นเกินไป (แถวต้นทาง ${rows.slice(0, 5).map((r) => r.rowNumber).join(', ')}${rows.length > 5 ? ' ...' : ''})`,
        fix: 'เปิดไฟล์ต้นทางที่แถวนั้น ถ้าเป็นแถวข้อมูลจริงให้แก้ Part Number แล้วอัปโหลดใหม่',
      };
    });
  },
};

export default [R01, R02, R03, R04, R05, R08, R09];
