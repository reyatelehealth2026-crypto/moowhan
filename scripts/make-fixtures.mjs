// Fixture toolchain (dev only).
//   node scripts/make-fixtures.mjs synth      write synthetic source files to tests/fixtures/out/
//   node scripts/make-fixtures.mjs variants   write template variants to tests/fixtures/out/
//   node scripts/make-fixtures.mjs expected   rewrite tests/fixtures/expected.json from input/*.xls + template.xlsx
// sanitise / samples / previous are reserved for the onboarding item (see docs/backlog.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSource } from '../tests/fixtures/makeSource.js';
import { makeTemplate } from '../tests/fixtures/makeTemplate.js';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { categorizeFile } from '../src/lib/excel/categorize.js';
import { buildAnalyzeRows, buildSummary } from '../src/lib/excel/aggregate.js';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import { DAILY_SHEETS, MONTH_KEYS } from '../src/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'out');
const buf = (rel) => { const b = fs.readFileSync(path.join(ROOT, rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

const SOURCES = ['BP veh 481D.xls', 'BPK packing 481D.xls', 'GW packing B-MPV.xls', 'GW veh DG7.xls', 'SR veh 481D.xls'];

export const buildExpected = async () => {
  const files = {};
  const processedData = Object.fromEntries(DAILY_SHEETS.map((s) => [s, []]));
  for (const f of SOURCES) {
    const { rows } = readSourceBuffer(buf(`input/${f}`));
    processedData[`${categorizeFile(f)} Daily`].push(...rows);
    files[`input/${f}`] = {
      rows: rows.length,
      parts: Object.fromEntries(rows.map((r) => [`${r.partNumber}|${r.dockCode}`, [r.n, r.n1, r.n2, r.n3]])),
    };
  }
  const sheetTotals = {};
  for (const [sheet, rows] of Object.entries(processedData)) {
    sheetTotals[sheet] = { rows: rows.length, ...Object.fromEntries(MONTH_KEYS.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)])) };
  }
  const { summary } = buildSummary(processedData);
  // capacity: feed more rows than any template can hold and read back what the patcher says it can take
  const big = Object.fromEntries(DAILY_SHEETS.map((s) => [s, Array.from({ length: 200 }, (_, i) => ({ ...processedData[s][0], partNumber: `CAP-${i}`, rawRow: [`CAP-${i}`, ...processedData[s][0].rawRow.slice(1)] }))]));
  const { report } = await patchTemplate(buf('template.xlsx'), { processedData: big, analyzeRows: buildAnalyzeRows(processedData) });
  const capacities = Object.fromEntries(report.overflow.map((o) => [o.sheet, o.capacity]));
  return { files, sheetTotals, summaryParts: summary.length, capacities, analyzeRows: buildAnalyzeRows(processedData).length };
};

const cmd = process.argv[2];
if (cmd === 'synth') {
  fs.mkdirSync(OUT, { recursive: true });
  for (const plant of ['BP', 'BPK', 'GW', 'SR']) {
    fs.writeFileSync(path.join(OUT, `${plant} synthetic.xls`), Buffer.from(makeSource({ plantCode: plant, rows: 6, format: 'xls', includeEof: true, seed: plant.length * 11 }).buffer));
  }
  console.log(`wrote synthetic sources to ${OUT}`);
} else if (cmd === 'variants') {
  fs.mkdirSync(OUT, { recursive: true });
  const variants = { 'template-xls': { format: 'xls' }, 'template-sumrow30': { sumRow: { sheet: 'BP Daily', moveTo: 30 } } };
  for (const [name, o] of Object.entries(variants)) fs.writeFileSync(path.join(OUT, `${name}.${o.format === 'xls' ? 'xls' : 'xlsx'}`), Buffer.from(await makeTemplate(o)));
  console.log(`wrote template variants to ${OUT}`);
} else if (cmd === 'expected') {
  fs.writeFileSync(path.join(ROOT, 'tests', 'fixtures', 'expected.json'), `${JSON.stringify(await buildExpected(), null, 2)}\n`);
  console.log('wrote tests/fixtures/expected.json');
} else if (['sanitise', 'samples', 'previous'].includes(cmd)) {
  console.log(`'${cmd}' is reserved for the onboarding item — not implemented yet`);
} else if (import.meta.url === `file://${process.argv[1]}` || cmd) {
  console.error('usage: node scripts/make-fixtures.mjs synth|variants|expected');
  process.exit(cmd ? 1 : 0);
}
