// ==================== PRINT PLAN (pure) ====================
import { PLANTS } from '../../constants.js';
import { plantItems, sumArray } from '../../lib/excel/daily.js';

/**
 * Sections for the print overlay, in BP, BPK, GW, SR order (split per dock when groupByDock).
 * Section: { plant, dock|null, title, rows: [{ partNumber, partCode, partDesc, dock, days[31], total }], days[31], total }.
 * Rows whose month is all zero are dropped unless includeZero.
 */
export const buildPrintSections = (processedData, { plant = 'ALL', groupByDock = true, month = 0, includeZero = false } = {}) => {
  const sections = [];
  PLANTS.forEach((pl) => {
    if (plant !== 'ALL' && plant !== pl) return;
    const rows = plantItems(processedData, pl, month)
      .filter((r) => includeZero || r.total > 0)
      .sort((a, b) => a.dock.localeCompare(b.dock) || a.partNumber.localeCompare(b.partNumber));
    if (!rows.length) return;
    const groups = groupByDock
      ? [...new Set(rows.map((r) => r.dock))].map((dock) => ({ dock, rows: rows.filter((r) => r.dock === dock) }))
      : [{ dock: null, rows }];
    groups.forEach((g) => {
      const days = new Array(31).fill(0);
      g.rows.forEach((r) => r.days.forEach((v, i) => { days[i] += v; }));
      sections.push({
        plant: pl,
        dock: g.dock,
        title: g.dock === null ? pl : `${pl} · Dock ${g.dock || '-'}`,
        rows: g.rows,
        days,
        total: sumArray(days),
      });
    });
  });
  return sections;
};
