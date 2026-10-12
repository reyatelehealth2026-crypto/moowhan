// ==================== AGGREGATION (pure) ====================
import { MONTH_KEYS } from '../../constants.js';

const plantOf = (sheetName) => sheetName.split(' ')[0];

// processedData: { 'BP Daily': rows[], ... } -> { summary: [], matching: {} }
export const buildSummary = (processedData) => {
  const matching = {};

  Object.entries(processedData || {}).forEach(([sheet, rows]) => {
    const plant = plantOf(sheet);
    rows.forEach((row) => {
      if (!matching[row.partNumber]) {
        matching[row.partNumber] = { n: 0, n1: 0, n2: 0, n3: 0, plants: new Set(), sources: [] };
      }
      const entry = matching[row.partNumber];
      entry.sources.push({
        plant,
        partCode: row.partCode,
        dockCode: row.dockCode,
        packingSize: row.packingSize,
        n: row.n, n1: row.n1, n2: row.n2, n3: row.n3,
      });
      MONTH_KEYS.forEach((k) => { entry[k] += row[k]; });
      entry.plants.add(plant);
    });
  });

  const summary = Object.entries(matching)
    .map(([partNumber, d]) => ({
      partNumber,
      plants: Array.from(d.plants).sort().join(', '),
      n: d.n, n1: d.n1, n2: d.n2, n3: d.n3,
      sources: d.sources,
    }))
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));

  return { summary, matching };
};

export const computeTotals = (summary) =>
  (summary || []).reduce(
    (acc, r) => ({ n: acc.n + r.n, n1: acc.n1 + r.n1, n2: acc.n2 + r.n2, n3: acc.n3 + r.n3 }),
    { n: 0, n1: 0, n2: 0, n3: 0 },
  );

// Rows for the "Analyze" sheet: every plant row, sorted by plant then part number.
export const buildAnalyzeRows = (processedData) => {
  const rows = [];
  Object.entries(processedData || {}).forEach(([sheet, list]) => {
    const plant = plantOf(sheet);
    list.forEach((row) => rows.push({ plant, ...row }));
  });
  return rows.sort((a, b) => a.plant.localeCompare(b.plant) || a.partNumber.localeCompare(b.partNumber));
};

// Totals per plant (for the pie chart).
export const totalsByPlant = (processedData) =>
  Object.entries(processedData || {}).map(([sheet, rows]) => ({
    plant: plantOf(sheet),
    count: rows.length,
    total: rows.reduce((sum, r) => sum + r.n + r.n1 + r.n2 + r.n3, 0),
  }));
