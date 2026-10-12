// Sheet names the app itself creates (values-only). Everything else that already
// exists in the customer's template is "protected": extra sheets never replace it.
import { safeSheetName } from '../../utils/format.js';

export const APP_SHEET_NAMES = [
  'QA Report', 'Manual Edits', 'FC Compare', 'Daily Total', 'Run Info', 'Notes', 'README',
  'Data (flat)', 'Comments', 'Formula Audit',
];
export const SPILL_SUFFIX = ' (เกิน)';
export const spillSheetName = (sheetName) => safeSheetName(`${String(sheetName).replace(/\s*\(เกิน\)$/, '')}${SPILL_SUFFIX}`);

const key = (s) => String(s ?? '').trim().toLowerCase();
const isSpillName = (name) => /^[A-Za-z]+ Daily \(เกิน\)$/.test(String(name));

export const isAppSheet = (name) => APP_SHEET_NAMES.some((n) => key(n) === key(name)) || isSpillName(name);

/** protected = a sheet of the template that is not one of the app's own sheets */
export const isProtected = (name, templateSheets = []) =>
  templateSheets.some((s) => key(s) === key(name)) && !isAppSheet(name);

/**
 * Decide the final name of an extra sheet.
 * @param {string} raw
 * @param {{ templateSheets?: string[], used?: Map<string,string> }} ctx  `used` maps lower-case final name -> raw name; it is updated
 * @returns {{ name: string } | { skipped: 'protected'|'duplicate', name: string }}
 */
export const resolveSheetName = (raw, { templateSheets = [], used = new Map() } = {}) => {
  const base = safeSheetName(raw);
  if (isProtected(base, templateSheets)) return { skipped: 'protected', name: base };
  let name = base;
  if (used.has(key(name))) {
    if (key(used.get(key(name))) === key(raw)) return { skipped: 'duplicate', name: base };
    // two different names that truncate to the same sheet name
    for (let n = 2; used.has(key(name)) || isProtected(name, templateSheets); n++) {
      const tail = ` (${n})`;
      name = `${base.slice(0, 31 - tail.length).trim()}${tail}`;
    }
  }
  used.set(key(name), String(raw));
  return { name };
};
