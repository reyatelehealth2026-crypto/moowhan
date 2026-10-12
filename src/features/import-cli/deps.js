// Adapter for the pieces other branches own. The CLI and the intake hook call these instead of reaching
// into those features directly, so the integrator can swap a stub for the real module in one place.
//
// qa-file-guards (feat/qa-file-guards) was not available while this feature was built. Its planned API
// (docs/backlog.json): validateSourceFile(file, ctx) -> Issue[]. Until it lands, the stub below is a no-op;
// the QA engine's file rules (R06/R07/R11) and the export gate still run on the processed data.
import { categorizeFile } from '../../lib/excel/categorize.js';

export { categorizeFile };

/** @returns {Promise<{ level: 'error'|'warning'|'info', code: string, message: string }[]>} */
export const validateSourceFile = async () => [];
