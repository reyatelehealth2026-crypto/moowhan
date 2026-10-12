// CSV for the long export: the shared serializer (utils/serialize.js) plus this feature's conventions
// (booleans as 1/0, non-finite numbers empty, trailing CRLF). UTF-8 BOM + CRLF so Excel opens Thai text correctly.
import { toCsv as baseCsv } from '../../utils/serialize.js';

export const BOM = '\uFEFF';
const norm = (v) => (typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' && !Number.isFinite(v) ? '' : v);

export const toCsv = (aoa, { delimiter = ',', bom = true } = {}) => {
  const rows = aoa || [];
  return baseCsv(rows.map((row) => row.map(norm)), { bom, delimiter }) + (rows.length ? '\r\n' : '');
};
