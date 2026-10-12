// ==================== EXPORT FLOW ====================
// gate -> (dialog only when something must be fixed/confirmed) -> build -> verify -> download.
// No React here. The caller passes the app `ctx`; the flow talks to it through these actions
// (added by App.jsx / useConsolidator.js): exportDirect, downloadLastExport, setLastExport, getLastExport, log.
import { collectGate } from '../runtime.js';
import { buildGate, needsDialog } from './gate.js';
import { renderFileName } from '../../utils/format.js';
import { defaultFilePattern } from './plan.js';
import { overrideLogEntry, shouldVerifyFirst } from './lastExport.js';
import { exportDialog } from './dialogStore.js';

const loadExcel = () => import('../../lib/excel/index.js');

/** issues of every feature (validate + beforeExport) plus this feature's own rules */
export const gateIssuesFor = (features, ctx, report) => collectGate(features, ctx, report, buildGate(ctx));

/** file name from a pattern (default: Production_Updated_{month}_{date}.xlsx, or _Summary_ without an .xlsx template) */
export const fileNameFor = (state, pattern) =>
  renderFileName(pattern || defaultFilePattern(state.template), { productionMonth: state.productionMonth });

/** verify what was built against processedData (reads the blob back; never patches again) */
export const verifyLast = async (ctx, last) => {
  const excel = await loadExcel();
  const { state } = ctx;
  return excel.verifyExport(await last.blob.arrayBuffer(), {
    processedData: state.processedData, extraSheets: last.extraSheets || [],
    templateBuffer: state.template?.kind === 'xlsx' ? state.template.buffer : null, report: last.report,
  });
};

/**
 * Build once, verify (small files before the download, big files after) and download.
 * options: { highlight, fileName, excludeSheets, overrideIssues }
 * Returns the build result, or null when the build failed.
 */
export const performExport = async (ctx, options = {}) => {
  const { actions, state } = ctx;
  const { overrideIssues = [], ...rest } = options;
  const fileName = rest.fileName || fileNameFor(state);
  const result = await actions.exportDirect({ ...rest, fileName, overrideIssues, hold: true });
  if (!result) return null;
  if (overrideIssues.length) actions.log(overrideLogEntry(overrideIssues, result.fileName));

  const totalRows = Object.values(state.processedData || {}).reduce((n, rows) => n + rows.length, 0);
  const last = actions.getLastExport() || { blob: result.blob, report: result.report, extraSheets: result.extraSheets };
  const dialogOpen = exportDialog.get().open;
  let held = false;
  try {
    if (shouldVerifyFirst(totalRows)) {
      const verification = await verifyLast(ctx, last);
      actions.setLastExport({ verification });
      if (verification.ok === false) held = true; // warn first, the user decides in the dialog
    }
  } catch (err) {
    actions.setLastExport({ verification: { ok: null, checks: [], error: err.message } });
  }
  if (held) {
    exportDialog.open('result', { held: true, busy: false });
    return result;
  }
  await actions.downloadLastExport();
  if (!shouldVerifyFirst(totalRows)) {
    verifyLast(ctx, last).then((verification) => actions.setLastExport({ verification })).catch(() => {});
  }
  if (dialogOpen) exportDialog.open('result', { held: false, busy: false });
  return result;
};

/** Gated entry point used by exportExcel: opens the dialog only when something is block/confirm. */
export const requestExport = async (ctx, features, options, report) => {
  const issues = gateIssuesFor(features, ctx, report);
  if (needsDialog(issues)) {
    exportDialog.open('gate', { busy: false });
    return null;
  }
  return performExport(ctx, options);
};
