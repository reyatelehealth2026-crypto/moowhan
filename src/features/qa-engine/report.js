// QA Report sheet + plain-text summary (pure).
import { LEVEL_LABEL, countActive, countByLevel, toReportRows } from './model.js';

export const REPORT_SHEET = 'QA Report';

export const summaryLine = (issues) => {
  const c = countActive(issues);
  return `QA: ${c.error} ต้องแก้, ${c.warning} ควรดู, ${c.info} ข้อมูล`;
};

/** Text for "คัดลอกสรุป": counts + the top findings that still need attention. */
export const summaryText = (issues, { productionLabel = '', limit = 10 } = {}) => {
  const open = issues.filter((i) => !i.waived);
  const lines = [`ผลตรวจคุณภาพ${productionLabel ? ` เดือนผลิต ${productionLabel}` : ''}`, summaryLine(issues)];
  const waived = issues.length - open.length;
  if (waived) lines.push(`รับทราบแล้ว ${waived} รายการ`);
  open.filter((i) => i.level !== 'info').slice(0, limit).forEach((i) => {
    lines.push(`- [${LEVEL_LABEL[i.level]}] ${i.rule} ${[i.plant, i.partNumber].filter(Boolean).join(' ')}: ${i.message}`);
  });
  const more = open.filter((i) => i.level !== 'info').length - limit;
  if (more > 0) lines.push(`... และอีก ${more} รายการ`);
  return lines.join('\n');
};

/** exportSheets entry; rows = findings + 1 header (waived findings included with their reason). */
export const buildReportSheet = (issues) => ({
  name: REPORT_SHEET,
  aoa: toReportRows(issues),
  defaultOn: { internal: true, external: false },
});

export { countByLevel };
