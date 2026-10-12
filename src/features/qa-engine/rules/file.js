// File rules R06, R07, R10, R11. Duplicate rows / expected files / stale revisions belong to qa-file-guards.
import { PLANTS, PLANT_CODE } from '../../../constants.js';

const doneFiles = (ctx) => ctx.sourceFiles.filter((f) => f.status === 'done' && f.meta);

const R06 = {
  id: 'R06', group: 'file', level: 'warning', title: 'PLANT CODE ไม่ตรงชื่อไฟล์',
  run(ctx) {
    return doneFiles(ctx).flatMap((f) => {
      const raw = String(f.meta.plantCode ?? '').trim();
      if (!raw) return [];
      const want = PLANT_CODE[raw.toUpperCase()];
      if (want === f.category) return [];
      return [{
        scope: 'file', plant: f.category, fileName: f.name, expected: f.category, actual: want || raw,
        message: want
          ? `PLANT CODE ในไฟล์คือ ${raw} (${want}) แต่ชื่อไฟล์ขึ้นต้นด้วย ${f.category}`
          : `PLANT CODE "${raw}" ในไฟล์ไม่รู้จัก (ชื่อไฟล์ขึ้นต้นด้วย ${f.category})`,
        fix: 'ตรวจว่าอัปโหลดไฟล์ถูกโรงงาน ถ้าชื่อไฟล์ผิดให้เปลี่ยนชื่อให้ขึ้นต้นด้วยโรงงานที่ถูกต้องแล้วอัปโหลดใหม่',
      }];
    });
  },
};

const R07 = {
  id: 'R07', group: 'file', level: 'warning', title: 'FORECAST / REVISION TYPE ผิดปกติ',
  run(ctx) {
    const allowed = (ctx.settings.allowedForecastTypes || []).map((s) => String(s).toUpperCase());
    return doneFiles(ctx).flatMap((f) => {
      const out = [];
      const ft = String(f.meta.forecastType ?? '').trim();
      if (ft && allowed.length && !allowed.includes(ft.toUpperCase())) {
        out.push({ scope: 'file', plant: f.category, fileName: f.name, expected: allowed.join(' / '), actual: ft, message: `FORECAST TYPE "${ft}" ไม่ใช่ประเภทที่คาด (${allowed.join(', ')})`, fix: 'ตรวจว่าเป็นไฟล์พยากรณ์ฉบับที่ต้องการ' });
      }
      const rev = String(f.meta.revision ?? '').trim();
      if (rev && !/^\d+$/.test(rev)) {
        out.push({ scope: 'file', plant: f.category, fileName: f.name, expected: 'ตัวเลข', actual: rev, message: `REVISION NUMBER "${rev}" ไม่ใช่ตัวเลข`, fix: 'ตรวจส่วนหัวของไฟล์ต้นทาง' });
      }
      const rt = String(f.meta.revisionType ?? '').trim();
      if (rt && /^(cancel|void|test)/i.test(rt)) {
        out.push({ scope: 'file', plant: f.category, fileName: f.name, actual: rt, message: `REVISION TYPE "${rt}" ผิดปกติ`, fix: 'ตรวจกับผู้ส่งไฟล์ว่าใช้ไฟล์ฉบับถูกต้อง' });
      }
      return out;
    });
  },
};

const R10 = {
  id: 'R10', group: 'file', level: 'warning', title: 'ใช้ตำแหน่งคอลัมน์สำรอง',
  run(ctx) {
    return doneFiles(ctx).flatMap((f) => {
      const flags = f.meta.monthColumnsFromHeader;
      if (!Array.isArray(flags) || flags.every(Boolean)) return [];
      const missing = flags.map((ok, k) => (ok ? null : ['N', 'N+1', 'N+2', 'N+3'][k])).filter(Boolean);
      return [{
        scope: 'file', plant: f.category, fileName: f.name, expected: 'พบหัวคอลัมน์ N..N+3', actual: `ไม่พบ ${missing.join(', ')}`,
        message: `ไม่พบหัวคอลัมน์ ${missing.join(', ')} ในไฟล์ ระบบใช้ตำแหน่งมาตรฐานแทน`,
        fix: 'เปิดไฟล์ต้นทางตรวจว่าหัวตารางมี N, N+1, N+2, N+3 ครบ และผลรวมอยู่ถูกคอลัมน์',
      }];
    });
  },
};

const R11 = {
  id: 'R11', group: 'file', level: 'warning', title: 'โรงงานไม่มีไฟล์ / อ่านไฟล์ไม่สำเร็จ',
  run(ctx) {
    if (!ctx.sourceFiles.length) return [];
    const out = ctx.sourceFiles.filter((f) => f.status === 'error').map((f) => ({
      level: 'error', scope: 'file', plant: f.category, fileName: f.name, actual: f.error || '',
      message: `อ่านไฟล์ไม่สำเร็จ: ${f.error || 'ไม่ทราบสาเหตุ'}`,
      fix: 'เปิดไฟล์ใน Excel ว่าอ่านได้ปกติหรือไม่ แล้วอัปโหลดใหม่ (รองรับ .xls / .xlsx)',
    }));
    PLANTS.filter((p) => !ctx.sourceFiles.some((f) => f.category === p)).forEach((p) => {
      out.push({ scope: 'plant', plant: p, expected: `ไฟล์ ${p}`, actual: 0, message: `ไม่มีไฟล์ของโรงงาน ${p}`, fix: `อัปโหลดไฟล์ที่ชื่อขึ้นต้นด้วย ${p} หรือยืนยันว่าเดือนนี้ไม่มีแผนของโรงงานนี้` });
    });
    return out;
  },
};

export default [R06, R07, R10, R11];
