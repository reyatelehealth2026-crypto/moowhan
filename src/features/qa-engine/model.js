// ==================== QA ISSUE MODEL (pure) ====================
// One Issue shape for the whole app. Rules (rules/*.js), the QA tab, the "QA Report" sheet and the
// feature-contract hooks (validate / beforeExport) all use it.
//
// Issue = { rule, group, level: 'error'|'warning'|'info', scope: 'row'|'file'|'plant'|'template'|'run',
//           plant, fileName, partNumber, dockCode, sheet, rowNumber, month, message, fix, expected, actual,
//           helpKey, action?: { kind: 'goTo'|'removeFile'|'useNewer', payload }, waived?, reason? }
import { toCsv as toSharedCsv } from '../../utils/serialize.js';


export const LEVELS = ['error', 'warning', 'info'];
export const LEVEL_LABEL = { error: 'ต้องแก้', warning: 'ควรดู', info: 'ข้อมูล' };
export const LEVEL_RANK = { error: 0, warning: 1, info: 2 };

export const GROUPS = ['row', 'file', 'month', 'layout', 'consistency', 'template'];
export const GROUP_LABEL = {
  row: 'ข้อมูลรายแถว',
  file: 'ไฟล์ต้นทาง',
  month: 'เดือนผลิต',
  layout: 'โครงสร้างไฟล์',
  consistency: 'ความสอดคล้อง',
  template: 'เทมเพลต',
};

// feature-contract levels (src/features/runtime.js) <-> QA levels
const TO_CONTRACT = { error: 'block', warning: 'confirm', info: 'info' };
const FROM_CONTRACT = { block: 'error', confirm: 'warning', info: 'info' };

const FIELDS = ['rule', 'group', 'level', 'scope', 'plant', 'fileName', 'partNumber', 'dockCode', 'sheet', 'rowNumber', 'month', 'message', 'fix', 'expected', 'actual', 'helpKey', 'action', 'waived', 'reason'];

/** Fill defaults so every consumer sees the same keys. */
export const makeIssue = (partial = {}) => {
  const level = LEVELS.includes(partial.level) ? partial.level : 'info';
  return {
    rule: '', group: 'row', scope: 'row', plant: '', fileName: '', partNumber: '', dockCode: '', sheet: '', rowNumber: null, month: '',
    message: '', fix: '', expected: null, actual: null, helpKey: partial.rule || '', action: null, waived: false, reason: '',
    ...partial,
    level,
  };
};

/** Issue for the feature contract (validate/beforeExport): level block|confirm|info + code = rule. */
export const toContractIssue = (issue) => ({ ...issue, level: TO_CONTRACT[issue.level] || 'info', qaLevel: issue.level, code: issue.rule });

/** Issue produced by another feature's validate() (block|confirm|info + code) -> QA Issue. */
export const fromContractIssue = (raw, featureId = '') => makeIssue({
  rule: raw.code || featureId || 'EXT',
  group: raw.group && GROUPS.includes(raw.group) ? raw.group : 'file',
  level: FROM_CONTRACT[raw.level] || raw.level,
  scope: raw.scope || 'run',
  sheet: raw.sheet || '',
  message: raw.message || '',
  fix: typeof raw.fix === 'string' ? raw.fix : '',
});

export const countByLevel = (issues = []) =>
  issues.reduce((acc, i) => { acc[i.level] = (acc[i.level] || 0) + 1; return acc; }, { error: 0, warning: 0, info: 0 });

/** Counts that ignore waived (acknowledged) issues: what badges and gates use. */
export const countActive = (issues = []) => countByLevel(issues.filter((i) => !i.waived));

export const sortIssues = (issues) =>
  [...issues].sort((a, b) =>
    (LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
    || String(a.plant).localeCompare(String(b.plant))
    || String(a.rule).localeCompare(String(b.rule))
    || (a.rowNumber ?? 0) - (b.rowNumber ?? 0));

/** filter({ level, plant, group, rule, status: 'active'|'waived'|'all', query }) */
export const filterIssues = (issues, { level = 'all', plant = 'all', group = 'all', rule = 'all', status = 'active', query = '' } = {}) => {
  const q = String(query || '').trim().toLowerCase();
  return issues.filter((i) => {
    if (level !== 'all' && i.level !== level) return false;
    if (plant !== 'all' && i.plant !== plant) return false;
    if (group !== 'all' && i.group !== group) return false;
    if (rule !== 'all' && i.rule !== rule) return false;
    if (status === 'active' && i.waived) return false;
    if (status === 'waived' && !i.waived) return false;
    if (q && !`${i.rule} ${i.plant} ${i.fileName} ${i.partNumber} ${i.dockCode} ${i.sheet} ${i.message} ${i.fix}`.toLowerCase().includes(q)) return false;
    return true;
  });
};

/** "BP Daily แถว 14" / "" */
export const locationOf = (i) => [i.sheet, i.rowNumber ? `แถว ${i.rowNumber}` : ''].filter(Boolean).join(' ');

export const statusOf = (i) => (i.waived ? `รับทราบ: ${i.reason || '-'}` : '');

export const CSV_HEADER = ['กฎ', 'ระดับ', 'โรงงาน', 'ไฟล์', 'Part Number', 'Dock', 'ชีต/แถว', 'รายละเอียด', 'วิธีแก้', 'ค่าที่คาด', 'ค่าจริง', 'สถานะ'];

// A cell that starts with = + - @ (or tab/CR) would be executed as a formula by Excel: prefix an apostrophe.
export const csvSafe = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Rows for the QA Report sheet and the CSV: header + one row per issue (waived included). Values are strings/numbers. */
export const toReportRows = (issues) => [
  CSV_HEADER,
  ...issues.map((i) => [i.rule, LEVEL_LABEL[i.level], i.plant, i.fileName, i.partNumber, i.dockCode, locationOf(i), i.message, i.fix, i.expected ?? '', i.actual ?? '', statusOf(i)]),
];

/** Same rows with every cell made formula-safe (CSV / clipboard). */
export const toCsvRows = (issues) => toReportRows(issues).map((r, idx) => (idx === 0 ? r : r.map(csvSafe)));

export const toCsv = (issues) => toSharedCsv(toReportRows(issues)); // escaping/BOM live in utils/serialize.js

/** Same keys the model documents, in a fixed order (for tests and docs). */
export const ISSUE_FIELDS = FIELDS;
