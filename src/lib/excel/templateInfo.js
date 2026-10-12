// ==================== TEMPLATE (MAIN FILE) READER ====================
import { listSheetNames } from './templatePatcher.js';
import { isZipBuffer } from './exportWorkbook.js';
import { workbookToRawSheets } from './readSource.js';

/**
 * Inspect the main/template file.
 *  .xlsx -> { kind: 'xlsx', buffer, sheets }            (patched in place on export)
 *  .xls  -> { kind: 'xls',  buffer, sheets, rawSheets } (values re-emitted on export)
 */
export const readTemplateBuffer = async (buffer) => {
  if (isZipBuffer(buffer)) {
    const sheets = await listSheetNames(buffer);
    if (!sheets.length) throw new Error('ไฟล์ Excel ไม่มี worksheet');
    return { kind: 'xlsx', buffer, sheets };
  }
  const { sheetNames, rawSheets } = workbookToRawSheets(buffer);
  if (!sheetNames.length) throw new Error('ไฟล์ Excel ไม่มี worksheet');
  return { kind: 'xls', buffer, sheets: sheetNames, rawSheets };
};
