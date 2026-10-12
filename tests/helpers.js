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
