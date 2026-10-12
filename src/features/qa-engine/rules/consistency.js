// Consistency rules K01-K06 (across rows / plants / months).
import { formatNumber } from '../../../utils/format.js';

const squash = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();
const MONTH = ['n', 'n1', 'n2', 'n3'];

const K01 = {
  id: 'K01', group: 'consistency', level: 'error', title: 'Part Number ต่างกันแค่ช่องว่างหรือตัวพิมพ์',
  run(ctx) {
    // group the distinct spellings that mean the same part
    const groups = new Map();
    ctx.entries.forEach((e) => {
      const spelling = String(e.row.partNumber ?? '');
      const norm = squash(spelling);
      if (!groups.has(norm)) groups.set(norm, new Map());
      const sp = groups.get(norm);
      sp.set(spelling, (sp.get(spelling) || 0) + 1);
    });
    const odd = new Map(); // spelling -> canonical
    groups.forEach((sp, norm) => {
      const canonical = sp.has(norm) ? norm : [...sp.entries()].sort((a, b) => b[1] - a[1])[0][0];
      sp.forEach((_, spelling) => { if (spelling !== canonical) odd.set(spelling, canonical); });
    });
    return ctx.entries.filter((e) => odd.has(String(e.row.partNumber ?? ''))).map((e) => {
      const canonical = odd.get(String(e.row.partNumber ?? ''));
      return {
        ...ctx.rowRef(e), scope: 'row', expected: canonical, actual: e.row.partNumber,
        message: `Part Number "${e.row.partNumber}" ต่างจาก "${canonical}" เพียงช่องว่างหรือตัวพิมพ์ ระบบจะนับเป็นคนละชิ้นส่วน`,
        fix: 'แก้ Part Number ให้เหมือนกันในไฟล์ต้นทาง แล้วอัปโหลดใหม่',
      };
    });
  },
};

const K02 = {
  id: 'K02', group: 'consistency', level: 'warning', title: 'ข้อมูลหลักของ Part เดียวกันขัดกัน',
  run(ctx) {
    const byPart = new Map();
    ctx.entries.forEach((e) => {
      // same part + plant + dock only: PART CODE legitimately differs between plants
      const p = `${squash(e.row.partNumber)}|${e.plant}|${e.row.dockCode}`;
      if (!byPart.has(p)) byPart.set(p, []);
      byPart.get(p).push(e);
    });
    const out = [];
    byPart.forEach((list) => {
      [['partCode', 'PART CODE'], ['partDesc', 'PART DESC']].forEach(([key, label]) => {
        const values = [...new Set(list.map((e) => String(e.row[key] ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
        if (values.length < 2) return;
        out.push({
          ...ctx.rowRef(list[0]), scope: 'row', expected: values[0], actual: values.slice(1).join(' | '),
          message: `${label} ของ ${list[0].row.partNumber} (${list[0].plant} ${list[0].row.dockCode}) ไม่ตรงกันระหว่างแถว: ${values.join(' | ')}`,
          fix: 'ตรวจว่าเป็นชิ้นส่วนเดียวกันจริง ถ้ารหัสถูกต้องทั้งสองแบบ กดรับทราบ',
        });
      });
    });
    return out;
  },
};

const K03 = {
  id: 'K03', group: 'consistency', level: 'info', title: 'Dock ไม่อยู่ในแผนที่ Dock',
  run(ctx) {
    const map = ctx.inspection?.masters?.dockSuffixMap; // only present on a deep inspection
    const known = ctx.settings.knownDocks; // optional { BP: ['P1'], ... }
    if (!Array.isArray(map) && !known) return [];
    const keys = Array.isArray(map) ? new Set(map.map((m) => m.key)) : null;
    const out = [];
    const perPart = new Map(); // part+plant -> Set(dock)
    ctx.entries.forEach((e) => {
      const k = `${String(e.row.partNumber).slice(0, 11)}${e.plant}`;
      if (!perPart.has(k)) perPart.set(k, new Set());
      perPart.get(k).add(e.row.dockCode);
    });
    ctx.entries.forEach((e) => {
      const k = `${String(e.row.partNumber).slice(0, 11)}${e.plant}`;
      if (known) {
        if (known[e.plant] && !known[e.plant].includes(e.row.dockCode)) {
          out.push({ ...ctx.rowRef(e), scope: 'row', expected: known[e.plant].join(', '), actual: e.row.dockCode, message: `Dock "${e.row.dockCode}" ไม่อยู่ในรายการ Dock ของ ${e.plant}`, fix: 'ตรวจ DOCK CODE ในไฟล์ต้นทาง หรือเพิ่ม Dock ใหม่ในตั้งค่า' });
        }
        return;
      }
      // the map lists suffixes for parts that ship from several docks: only those parts need an entry
      if (perPart.get(k).size > 1 && !keys.has(`${k}${e.row.dockCode}`)) {
        out.push({ ...ctx.rowRef(e), scope: 'row', expected: `${k}${e.row.dockCode}`, actual: 'ไม่พบ', message: `Part นี้ส่งจากหลาย Dock แต่ Dock "${e.row.dockCode}" ไม่อยู่ในแผนที่ Dock ของเทมเพลต`, fix: 'เพิ่มคู่ Part/Plant/Dock นี้ในตาราง Dock ของเทมเพลต (Analyze คอลัมน์ EN:ER)' });
      }
    });
    return out;
  },
};

const K04 = {
  id: 'K04', group: 'consistency', level: 'warning', title: 'ปริมาณไม่ใช่จำนวนเต็ม',
  run(ctx) {
    return ctx.entries.flatMap((e) => {
      const bad = MONTH.map((key, k) => ({ k, v: Number(e.row[key]) })).filter(({ v }) => Number.isFinite(v) && !Number.isInteger(v));
      if (!bad.length) return [];
      return [{
        ...ctx.rowRef(e), scope: 'row', month: ctx.monthLabel(e.pm, bad[0].k), expected: 'จำนวนเต็ม', actual: bad.map(({ v }) => v).join(', '),
        message: `ปริมาณเป็นทศนิยม: ${bad.map(({ k, v }) => `${ctx.monthLabel(e.pm, k)} = ${v}`).join(', ')}`,
        fix: 'ตรวจไฟล์ต้นทาง จำนวนชิ้นต้องเป็นจำนวนเต็ม',
      }];
    });
  },
};

const K05 = {
  id: 'K05', group: 'consistency', level: 'info', title: 'ยอดเปลี่ยนแรงระหว่างเดือน',
  run(ctx) {
    const ratio = Number(ctx.settings.thresholds?.swingRatio) || 3;
    return ctx.entries.flatMap((e) => {
      for (let k = 1; k < 4; k++) {
        const a = Number(e.row[MONTH[k - 1]]) || 0;
        const b = Number(e.row[MONTH[k]]) || 0;
        if (!a || !b) continue; // months at 0 are skipped
        if (Math.max(a, b) / Math.min(a, b) >= ratio) {
          return [{
            ...ctx.rowRef(e), scope: 'row', month: ctx.monthLabel(e.pm, k), expected: formatNumber(a), actual: formatNumber(b),
            message: `${ctx.monthLabel(e.pm, k - 1)} = ${formatNumber(a)} → ${ctx.monthLabel(e.pm, k)} = ${formatNumber(b)} เปลี่ยนตั้งแต่ ${ratio} เท่าขึ้นไป`,
            fix: 'ถ้าเป็นการเปลี่ยนแผนจริงไม่ต้องทำอะไร ถ้าไม่ใช่ให้ตรวจไฟล์ต้นทาง',
          }];
        }
      }
      return [];
    });
  },
};

const K06 = {
  id: 'K06', group: 'consistency', level: 'info', title: 'ยอดหายไปแล้วกลับมา',
  run(ctx) {
    return ctx.entries.flatMap((e) => {
      const v = MONTH.map((key) => Number(e.row[key]) || 0);
      const gap = v.findIndex((x, k) => k > 0 && k < 3 && x === 0 && v[k - 1] > 0 && v.slice(k + 1).some((y) => y > 0));
      if (gap === -1) return [];
      return [{
        ...ctx.rowRef(e), scope: 'row', month: ctx.monthLabel(e.pm, gap), expected: '> 0', actual: 0,
        message: `${ctx.monthLabel(e.pm, gap)} เป็น 0 ทั้งที่เดือนก่อนและหลังมียอด`,
        fix: 'ตรวจว่าเป็นการหยุดผลิตชั่วคราวจริงหรือไม่',
      }];
    });
  },
};

export default [K01, K02, K03, K04, K05, K06];
