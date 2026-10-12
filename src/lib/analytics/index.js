// Single numbers source for every surface (DOM-free, no xlsx/jszip).
import { buildKpis } from './kpis.js';
import { plantMonthMatrix } from './matrix.js';
import { topMovers } from './movers.js';
import { paretoByPart } from './pareto.js';

export { buildKpis, plantMonthMatrix, topMovers, paretoByPart };
export { th, en, partLabel } from './labels.js';

export const buildAnalytics = ({ processedData, summaryData, files, clock } = {}) => ({
  kpis: buildKpis(processedData, summaryData, { files, clock }),
  matrix: plantMonthMatrix(processedData),
  pareto: paretoByPart(summaryData),
});
