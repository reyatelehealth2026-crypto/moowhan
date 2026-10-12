// ==================== QA ENGINE (pure: no DOM / React, runs in Node) ====================
// runRules({ processedData, sourceFiles, productionMonth, template, inspection, settings, today, waivers }) -> Issue[]
import { MONTH_HEADERS, MONTH_KEYS, TEMPLATE } from '../../constants.js';
import { formatMonth, parseProductionMonth } from '../../utils/format.js';
import { makeIssue, sortIssues } from './model.js';
import { listRules } from './registry.js';
import { isRuleOn, mergeSettings } from './settings.js';
import { applyWaivers } from './waivers.js';
import './rules/index.js'; // registers the built-in rules

const plantOfSheet = (sheet) => String(sheet).split(' ')[0];

/** Everything a rule needs, computed once per run. */
export const buildContext = (input = {}) => {
  const sourceFiles = input.sourceFiles || [];
  const processedData = input.processedData || {};
  const settings = mergeSettings(input.settings);
  const productionMonth = input.productionMonth ?? null;
  const today = input.today ? new Date(input.today) : new Date();
  const inspection = input.inspection ?? input.template?.inspection ?? null;
  const fileByName = new Map(sourceFiles.map((f) => [f.name, f]));

  const entries = [];
  Object.entries(processedData).forEach(([sheet, rows]) => {
    (rows || []).forEach((row, idx) => {
      const file = fileByName.get(row.fileName) || null;
      entries.push({
        row,
        sheet,
        plant: row.plant || plantOfSheet(sheet),
        rowNumber: TEMPLATE.dailyDataStartRow + idx,
        file,
        pm: file?.meta?.productionMonth || productionMonth,
      });
    });
  });

  return {
    processedData, sourceFiles, productionMonth, today, inspection, settings, template: input.template ?? null,
    entries,
    fileByName,
    /** N..N+3 label: "Feb'26" when the month is known, else "N+1" */
    monthLabel: (pm, k) => (pm ? formatMonth(pm, k) : MONTH_HEADERS[k]),
    /** [{ k, key, col }] for the 4 month totals of a row, from its own colPositions (never hard-coded) */
    monthCols: (row) => MONTH_KEYS.map((key, k) => ({ k, key, col: row.colPositions?.[`${key}Col`] })).filter((m) => Number.isInteger(m.col)),
    /** rule outputs reference the row they came from */
    rowRef: (e) => ({ plant: e.plant, fileName: e.row.fileName || '', partNumber: e.row.partNumber || '', dockCode: e.row.dockCode || '', sheet: e.sheet, rowNumber: e.rowNumber }),
    parseMonth: parseProductionMonth,
  };
};

/**
 * Run every enabled rule. A rule that throws becomes one info issue instead of breaking the run.
 * `waivers` (record map or array) marks covered warning/info issues as waived.
 */
export const runRules = (input = {}) => {
  const ctx = buildContext(input);
  const out = [];
  listRules().forEach((rule) => {
    if (!isRuleOn(rule, ctx.settings)) return;
    try {
      (rule.run(ctx) || []).forEach((p) => out.push(makeIssue({ rule: rule.id, group: rule.group, level: rule.level, ...p })));
    } catch (err) {
      out.push(makeIssue({ rule: rule.id, group: rule.group, level: 'info', scope: 'run', message: `กฎ ${rule.id} ตรวจไม่สำเร็จ (${err?.message || err})`, fix: 'ข้ามกฎนี้ไปก่อน หรือแจ้งผู้ดูแลระบบ' }));
    }
  });
  return applyWaivers(sortIssues(out), input.waivers, { productionMonth: ctx.productionMonth, today: ctx.today });
};

export { listRules, registerRule } from './registry.js';
