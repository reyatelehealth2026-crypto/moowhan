import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const fixture = (rel) => {
  const buf = fs.readFileSync(path.join(root, rel));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

export const SOURCE_FILES = [
  'input/BP veh 481D.xls',
  'input/BPK packing 481D.xls',
  'input/GW packing B-MPV.xls',
  'input/GW veh DG7.xls',
  'input/SR veh 481D.xls',
];

// Numeric literals derived from the committed fixtures live only in tests/fixtures/expected.json
// (regenerate with `node scripts/make-fixtures.mjs expected`).
export const loadExpected = () => JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/expected.json'), 'utf8'));

// Reads every SOURCE_FILES entry into processedData ({ 'BP Daily': rows[], ... }).
export const loadProcessedData = async () => {
  const { readSourceBuffer } = await import('../src/lib/excel/readSource.js');
  const { categorizeFile } = await import('../src/lib/excel/categorize.js');
  const data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  for (const f of SOURCE_FILES) data[`${categorizeFile(f.split('/').pop())} Daily`].push(...readSourceBuffer(fixture(f)).rows);
  return data;
};
