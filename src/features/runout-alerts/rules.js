// QA rule group 'business': B01 run-out signals. Registered into the single qa-engine registry, so the
// signals show up in the QA tab / report like any other finding (category 'business').
// Only classify.js decides the status; this file never re-implements it.
import { registerRule } from '../qa-engine/registry.js';
import { STATUS_LABEL, isRunout } from './classify.js';
import { buildRunoutRows, signalRows } from './rows.js';

export const RULE_ID = 'B01';

const MONTH_LABEL = ['N', 'N+1', 'N+2', 'N+3'];

/** Thai text of one signal row. Always the word "สัญญาณ": these are forecast signals, not stock figures. */
export const describeSignal = (row, label = (k) => MONTH_LABEL[k]) => {
  const last = row.lastPackDay ? `วันส่งสุดท้ายใน forecast ประมาณ ${row.lastPackEstimated || `วันที่ ${row.lastPackDay.day} (${label(row.lastPackDay.monthIndex)})`}` : '';
  const head = `${STATUS_LABEL[row.status]}: ${row.partNumber}${row.dockCode ? ` (Dock ${row.dockCode})` : ''}`;
  return [head, last].filter(Boolean).join(' · ');
};

const actionOf = (status) => {
  if (isRunout(status)) return 'ตรวจกับ TMT/ฝ่ายวางแผนว่ารายการนี้จะหยุดส่งหรือไม่ แล้วบันทึกวันส่งสุดท้ายทางการในแท็บ Run-out';
  if (status === 'new') return 'ตรวจว่าเป็นรายการใหม่ที่ต้องเตรียมสต็อก/เทมเพลตหรือไม่';
  return 'ตรวจว่าเดือนที่เป็น 0 ตั้งใจหรือไม่ (forecast ขาดช่วง)';
};

/** Signal rows -> partial QA Issues (engine fills rule/group/defaults). Exported for tests. */
export const businessFindings = (ctx) => {
  const rows = signalRows(buildRunoutRows(ctx.processedData, ctx.productionMonth));
  const entryOf = new Map(ctx.entries.map((e) => [`${e.plant}|${e.row.partNumber}|${e.row.dockCode ?? ''}`, e]));
  return rows.map((r) => {
    const e = entryOf.get(r.key);
    const bothZero = r.n2 === 0 && r.n3 === 0;
    return {
      category: 'business',
      code: RULE_ID,
      level: r.status === 'new' || r.status === 'gap' ? 'info' : 'warning',
      scope: 'row',
      plant: r.plant,
      partNumber: r.partNumber,
      dockCode: r.dockCode,
      sheet: e?.sheet || r.sheet,
      rowNumber: e?.rowNumber ?? null,
      fileName: e?.row.fileName || '',
      weight: bothZero ? 'high' : 'medium', // n2 and n3 both zero = the window is about to run dry
      status: r.status,
      message: describeSignal(r, (k) => ctx.monthLabel(ctx.productionMonth, k)),
      fix: actionOf(r.status),
      expected: null,
      actual: `N ${r.n} · N+1 ${r.n1} · N+2 ${r.n2} · N+3 ${r.n3}`,
    };
  });
};

export const RUNOUT_RULES = [{
  id: RULE_ID,
  group: 'business',
  level: 'warning',
  defaultOn: true,
  title: 'สัญญาณ Run-out จาก forecast (ไม่ใช่ยอดสต็อก)',
  run: businessFindings,
}];

RUNOUT_RULES.forEach(registerRule);
export default RUNOUT_RULES;
