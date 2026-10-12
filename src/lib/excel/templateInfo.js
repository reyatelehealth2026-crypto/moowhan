// ==================== TEMPLATE (MAIN FILE) READER ====================
import { listSheetNames } from './templatePatcher.js';
import { isZipBuffer } from './exportWorkbook.js';
import { workbookToRawSheets } from './readSource.js';
// template-inspector: reads the zip once and returns structural facts (kept on template.inspection)
import { inspectTemplate } from '../../features/template-inspector/templateInspect.js';

/**
 * Inspect the main/template file.
 *  .xlsx -> { kind: 'xlsx', buffer, sheets, inspection } (patched in place on export)
 *  .xls  -> { kind: 'xls',  buffer, sheets, rawSheets } (values re-emitted on export)
 */
export const readTemplateBuffer = async (buffer) => {
  if (isZipBuffer(buffer)) {
    const inspection = await inspectTemplate(buffer); // never throws: failures become an INSPECT_FAILED issue
    const sheets = inspection.sheets.length ? inspection.sheets.map((s) => s.name) : await listSheetNames(buffer);
    if (!sheets.length) throw new Error('ไฟล์ Excel ไม่มี worksheet');
    return { kind: 'xlsx', buffer, sheets, inspection };
  }
  const { sheetNames, rawSheets } = workbookToRawSheets(buffer);
  if (!sheetNames.length) throw new Error('ไฟล์ Excel ไม่มี worksheet');
  return { kind: 'xls', buffer, sheets: sheetNames, rawSheets };
};
