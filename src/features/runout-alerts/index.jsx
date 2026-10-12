import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { lazyComponent } from '../lazy.js';
import { ID, notesByKey, slotOf } from './meta.js';
import { STATUS_LABEL } from './classify.js';
import { EXPORT_SHEET_NAME, buildRunoutAoa, buildRunoutRows } from './rows.js';
import './rules.js'; // registers QA rule B01 (group 'business') into the single qa-engine registry

const RunoutView = lazyComponent(() => import('./RunoutView.jsx'));

// Run-out signals from the TMT forecast (no stock figures exist in those files).
// - classifier: classify.js (only copy) · rows: rows.js · QA rule B01: rules.js
// - no badge and no validate hook of its own: B01 reaches the QA tab / QA Report / gates through qa-engine,
//   whose validate() already returns every registered rule (a second validate here would double count).
export default defineFeature({
  id: ID,
  order: 78,
  group: 'วิเคราะห์',
  description: 'สัญญาณ Run-out จากแผน N..N+3',
  tab: {
    label: 'Run-out',
    Icon: Icons.Alert,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    Component: RunoutView,
  },
  // opt-in sheet 'Runout' (checkbox in the Run-out tab): Last Pack dates are text YYYY-MM-DD
  exportSheets: (ctx) => {
    const { state } = ctx;
    if (!state.processedData || !slotOf(state).includeInExport) return [];
    const rows = buildRunoutRows(state.processedData, state.productionMonth, slotOf(state).overrides, notesByKey(state));
    return [{ name: EXPORT_SHEET_NAME, aoa: buildRunoutAoa(rows, STATUS_LABEL) }];
  },
});
