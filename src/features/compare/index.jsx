import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import ComparePanel, { ID, DEFAULTS } from './ComparePanel.jsx';
import { COMPARE_SHEET, alignMonths, compare, compareToAoa, filterRows, rowsFromProcessed, summarize } from './compare.js';
import { baselineFromProcessed } from './readPrevious.js';

const signature = (rows) => rows.map((r) => `${r.plant}|${r.part}|${r.dock}|${r.n},${r.n1},${r.n2},${r.n3}`).join(';');

// Shared by export and validate: rows that pass the threshold, or null until a baseline month is confirmed.
const compareNow = (ctx) => {
  const d = { ...DEFAULTS, ...(ctx.state.features?.[ID] || {}) };
  if (!ctx.state.processedData || !d.baseline) return null;
  const align = alignMonths(d.confirmedMonth, ctx.state.productionMonth, { positional: d.positional });
  if (!align.pairs.length || (!d.confirmedMonth && !d.positional)) return null;
  const rows = compare(d.baseline.rows, rowsFromProcessed(ctx.state.processedData), align.shift, { level: d.level, currMonth: ctx.state.productionMonth });
  return { d, align, rows, shown: filterRows(rows, { pct: d.pct, minPcs: d.minPcs }) };
};

export default defineFeature({
  id: ID,
  order: 78,
  group: 'วิเคราะห์',
  description: 'เทียบ forecast รอบนี้กับรอบก่อน (รอบเดียวกัน Rev เก่า→ใหม่ หรือเลื่อนเดือน)',
  tab: {
    label: 'เทียบรอบก่อน',
    Icon: Icons.Compare,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    Component: ComparePanel,
  },
  // Keep an in-memory snapshot of the previous processAll so "same round, old Rev -> new Rev" needs no upload.
  onProcessed: (ctx, result) => {
    const next = baselineFromProcessed(result.processedData, { month: result.productionMonth, label: 'รอบที่ประมวลผลก่อนหน้า (ในหน่วยความจำ)' });
    const sig = signature(next.rows);
    ctx.actions.setFeatureData(ID, (cur) => (cur.last && cur.last.sig !== sig
      ? { snapshot: cur.last.baseline, last: { sig, baseline: next } }
      : { last: { sig, baseline: next } }));
  },
  // Opt-in sheet (checkbox in the tab): only rows over the threshold. Nothing is written into template cells.
  exportSheets: (ctx) => {
    const c = compareNow(ctx);
    return c && c.d.exportCompare ? [{ name: COMPARE_SHEET, aoa: compareToAoa(c.shown) }] : [];
  },
  // Findings for the QA/gate surfaces (info only: a forecast change is not an error).
  validate: (ctx) => {
    const c = compareNow(ctx);
    if (!c) return [];
    const s = summarize(c.rows, { shift: c.align.mode === 'positional' ? null : c.align.shift });
    const out = [];
    if (s.missing) out.push({ level: 'info', code: 'compare-missing', message: `เทียบรอบก่อน: ${s.missing} รายการหายไปจากรอบนี้` });
    if (s.new) out.push({ level: 'info', code: 'compare-new', message: `เทียบรอบก่อน: ${s.new} รายการใหม่ที่ไม่มีในรอบก่อน` });
    const over = c.shown.filter((r) => r.status === 'changed').length;
    if (over) out.push({ level: 'info', code: 'compare-over-threshold', message: `เทียบรอบก่อน: ${over} แถวเปลี่ยนเกิน ${c.d.pct}% และ ${c.d.minPcs} ชิ้น` });
    return out;
  },
});

