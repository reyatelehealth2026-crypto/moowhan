// ==================== EXPORT GATE (pure) ====================
// buildGate(ctx) -> Issue[] : facts that decide whether the download opens a dialog.
//   block   needs an override tick ("ฉันเข้าใจความเสี่ยง...") before the download button unlocks
//   confirm shown in the dialog, the download button is the confirmation
//   info    shown, never opens the dialog on its own
// [] means a one-click download. Issues from other features (validate / beforeExport hooks, e.g. the QA
// engine's error count = G03) arrive through runtime.collectGate — this file never imports them.
//
// Capacity comes from state.template.inspection (template-inspector). Without it the capacity rules
// (G05/G06/G07) are skipped: the patcher still reports overflow in its own report after export.
import { ANALYZE_SHEET, DAILY_SHEETS, PLANTS, dailySheetName } from '../../constants.js';
import { templateCapacityReport } from '../template-inspector/capacity.js';
import { formatNumber } from '../../utils/format.js';

const issue = (level, code, message, fix, extra = {}) => ({ level, code, message, fix, ...extra });
const rowsOf = (data, sheet) => data?.[sheet]?.length ?? 0;

/** distinct PRODUCTION MONTH values of the processed source files: Map("202602" -> [file names]) */
export const monthsOfFiles = (sourceFiles = []) => {
  const months = new Map();
  sourceFiles.forEach((f) => {
    const raw = f?.meta?.productionMonthRaw;
    if (f?.status === 'done' && raw) months.set(String(raw), [...(months.get(String(raw)) || []), f.name]);
  });
  return months;
};

/**
 * @param {{ state: object }} ctx
 * @param {{ overrides?: Record<string, number> }} [opts]  capacity overrides (settings-profile)
 */
export const buildGate = (ctx, { overrides } = {}) => {
  const state = ctx?.state || {};
  const data = state.processedData;
  if (!data) return [];
  const out = [];
  const template = state.template;
  const inspection = template?.kind === 'xlsx' ? template.inspection ?? null : null;

  // G01 stale
  if (state.isStale) {
    out.push(issue('block', 'G01', 'รายการไฟล์เปลี่ยนไปหลังประมวลผลครั้งล่าสุด ไฟล์ที่ดาวน์โหลดจะไม่ตรงกับไฟล์ที่เลือกอยู่',
      'กด “ประมวลผลใหม่” เพื่อรวมข้อมูลจากไฟล์ล่าสุดก่อนดาวน์โหลด', { action: { id: 'reprocess', label: 'ประมวลผลใหม่' } }));
  }

  // G04 production months differ
  const months = monthsOfFiles(state.sourceFiles);
  if (months.size > 1) {
    const list = [...months].map(([m, files]) => `${m} (${files.join(', ')})`).join(' | ');
    out.push(issue('block', 'G04', `ไฟล์ต้นทางมี PRODUCTION MONTH ไม่ตรงกัน: ${list}`,
      'ตรวจว่าเลือกไฟล์ของเดือนเดียวกัน แล้วลบ/แทนที่ไฟล์ที่ผิดก่อนประมวลผลใหม่'));
  }

  // G09 required sheets missing in the template
  if (inspection?.missingSheets?.length) {
    const needed = inspection.missingSheets.filter((s) => s === ANALYZE_SHEET || rowsOf(data, s) > 0);
    if (needed.length) {
      out.push(issue('block', 'G09', `เทมเพลตไม่มีชีตที่ต้องใช้: ${needed.join(', ')}`,
        'ใช้เทมเพลตที่มีชีตครบ (ห้ามลบหรือเปลี่ยนชื่อชีต) หรือเพิ่มชีตที่ขาดกลับเข้าไป', { sheet: needed[0] }));
    }
  }

  // G02 plant without a file: its Daily sheet is cleared, nothing is carried over from the template
  const total = DAILY_SHEETS.reduce((n, s) => n + rowsOf(data, s), 0);
  if (total > 0 && inspection) {
    const byName = new Map(inspection.sheets.map((s) => [s.name, s]));
    PLANTS.filter((p) => rowsOf(data, dailySheetName(p)) === 0).forEach((p) => {
      const sheet = dailySheetName(p);
      if (!byName.has(sheet)) return; // missing sheet is G09's business
      const n = byName.get(sheet).capacity;
      out.push(issue('confirm', 'G02', `ไม่มีไฟล์ ${p} - ชีต ${sheet} จะถูกล้างข้อมูลเดิม${Number.isFinite(n) ? ` ${n} แถว` : ''}`,
        `เพิ่มไฟล์ ${p} แล้วประมวลผลใหม่ หรือดาวน์โหลดต่อหากตั้งใจให้ชีตนี้ว่าง`, { sheet }));
    });
  }

  // G05 / G06 / G07 capacity of the template
  if (inspection) {
    const rows = Object.fromEntries(DAILY_SHEETS.map((s) => [s, rowsOf(data, s)]));
    templateCapacityReport(inspection, rows, overrides).filter((r) => r.over).forEach((r) => {
      const msg = `${r.sheet} มี ${formatNumber(r.rows)} แถว เกินพื้นที่ในเทมเพลต ${formatNumber(r.capacity)} แถว`;
      if (r.sheet === ANALYZE_SHEET) {
        out.push(issue('confirm', 'G05', `${msg} — แถวที่เกินจะไม่ถูกเขียนลง Analyze`,
          'ขยายตาราง Analyze และสูตร key (คอลัมน์ A) ในเทมเพลตก่อน หรือดาวน์โหลดต่อโดยรับว่าแถวที่เกินหายไป', { sheet: r.sheet }));
      } else {
        out.push(issue('block', 'G06', `${msg}${r.sumRow ? ` (แถว ${r.sumRow} เป็นสูตรรวม)` : ''} — แถวที่เกิน ${formatNumber(r.rows - r.capacity)} แถวจะไม่ถูกเขียน`,
          `เพิ่มแถวว่างในชีต ${r.sheet} เหนือแถวสูตรรวมในเทมเพลตก่อน แล้วโหลดเทมเพลตใหม่`, { sheet: r.sheet }));
      }
    });
    inspection.sheets.filter((s) => Number.isFinite(s.helperFormulaLastRow)).forEach((s) => {
      const n = rowsOf(data, s.name);
      const last = (s.dataStartRow ?? 1) + n - 1;
      if (n && last > s.helperFormulaLastRow) {
        out.push(issue('info', 'G07', `${s.name}: แถวที่ ${s.helperFormulaLastRow + 1}–${last} ไม่มีสูตรช่วยของเทมเพลต (คอลัมน์ด้านขวา)`,
          'คัดลอกสูตรช่วยในเทมเพลตลงมาให้ครบก่อนใช้งานคอลัมน์เหล่านั้น', { sheet: s.name }));
      }
    });
  }

  // G08 no .xlsx template
  if (!inspection) {
    out.push(issue('info', 'G08', template
      ? 'เทมเพลตไม่ใช่ .xlsx (หรืออ่านโครงสร้างไม่ได้) ระบบจะสร้างไฟล์ใหม่แบบค่าล้วน — pivot/สูตรของเทมเพลตจะไม่ถูกรักษา'
      : 'ยังไม่ได้เลือกเทมเพลต .xlsx ระบบจะสร้างไฟล์ใหม่แบบค่าล้วน — ไม่มี pivot/สูตร',
    'เลือกเทมเพลต .xlsx ในแท็บอัปโหลดเพื่อให้เขียนลงไฟล์ของบริษัทโดยตรง'));
  }

  return out;
};

/** counts + overall state for the "พร้อมส่งออก" strip */
export const summarizeGate = (issues = []) => {
  const count = (level) => issues.filter((i) => i.level === level).length;
  const block = count('block');
  const confirm = count('confirm');
  return { block, confirm, info: count('info'), state: block ? 'blocked' : confirm ? 'confirm' : 'ready' };
};

/** the dialog is only needed when something has to be fixed or confirmed */
export const needsDialog = (issues = []) => issues.some((i) => i.level === 'block' || i.level === 'confirm');
