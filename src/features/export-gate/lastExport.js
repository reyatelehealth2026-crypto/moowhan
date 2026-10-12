// ==================== LAST EXPORT (in memory) ====================
// The file we just built stays in memory so "ดาวน์โหลดอีกครั้ง" never patches the template again.
// Cleared on reset. Pure helpers: the state hook only stores what these return.

/** result of buildExport + context -> the remembered entry */
export const makeLastExport = (result, extra = {}) => ({
  blob: result.blob, fileName: result.fileName, report: result.report, at: Date.now(),
  verification: null, extraSheets: [], highlight: true, ...extra,
});

/** download the remembered file again. Returns false when nothing is remembered. */
export const redownload = (last, download) => {
  if (!last?.blob) return false;
  download(last.blob, last.fileName);
  return true;
};

/** the order in which a flow should verify: small files before the download, big ones after */
export const VERIFY_BEFORE_ROWS = 2000;
export const shouldVerifyFirst = (totalRows) => totalRows <= VERIFY_BEFORE_ROWS;

/** override bookkeeping: changelog entry + the note appended to the "Run Info" sheet */
export const overrideLogEntry = (blockIssues, fileName) => ({
  fileName, action: 'override',
  details: `ดาวน์โหลดต่อทั้งที่มีรายการต้องแก้: ${blockIssues.map((i) => `${i.code} ${i.message}`).join(' | ')}`,
});

export const overrideNoteRows = (blockIssues) => [
  ['หมายเหตุการส่งออก'],
  ['ผู้ใช้ยืนยันดาวน์โหลดต่อทั้งที่มีรายการต้องแก้'],
  ...blockIssues.map((i) => [i.code, i.message]),
];

/** add the override note to an existing "Run Info" sheet, or create one */
export const attachOverrideNote = (sheets, blockIssues) => {
  if (!blockIssues?.length) return sheets;
  const note = overrideNoteRows(blockIssues);
  const at = sheets.findIndex((s) => s.name === 'Run Info');
  if (at === -1) return [...sheets, { name: 'Run Info', aoa: note }];
  return sheets.map((s, i) => (i === at ? { ...s, aoa: [...(s.aoa || []), [], ...note] } : s));
};
