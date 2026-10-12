import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import QaTab from './QaTab.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import { DEFAULT_SETTINGS } from './settings.js';
import { FEATURE_ID, computeIssues } from './compute.js';
import { countActive, toContractIssue } from './model.js';
import { buildReportSheet, summaryLine } from './report.js';

// QA engine feature (the single quality-check engine of the app).
// Add a rule: see README.md. Other features should register rules instead of building their own tab/badge.

/** Include the QA Report sheet? explicit tab checkbox > profile target ('external' = off) > default on. */
const wantsReport = (state) => {
  const explicit = state.features?.[FEATURE_ID]?.exportSheet;
  if (typeof explicit === 'boolean') return explicit;
  return state.profile?.exportTarget !== 'external';
};

export default defineFeature({
  id: FEATURE_ID,
  order: 55,
  group: 'ตรวจสอบ',
  description: 'ตรวจคุณภาพข้อมูลก่อนส่งออก',
  tab: {
    label: 'ตรวจคุณภาพ',
    Icon: Icons.Alert,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    // badge = errors not yet acknowledged
    badge: (ctx) => ({ count: countActive(computeIssues(ctx)).error, severity: 'error' }),
    Component: QaTab,
  },
  // waived issues leave badges and gates; export-gate reads these through the contract (block|confirm|info)
  validate: (ctx) => computeIssues(ctx).filter((i) => !i.waived).map(toContractIssue),
  exportSheets: (ctx) => (ctx.state.processedData && wantsReport(ctx.state) ? [buildReportSheet(computeIssues(ctx))] : []),
  onProcessed: (ctx, result) => {
    // ctx.state.sourceFiles predates processing: take status/meta from result.files
    const byId = new Map((result?.files || []).map((f) => [f.id, f]));
    const sourceFiles = ctx.state.sourceFiles.map((f) => (byId.has(f.id) ? { ...f, ...byId.get(f.id) } : f));
    const issues = computeIssues({ ...ctx, state: { ...ctx.state, sourceFiles, processedData: result?.processedData ?? ctx.state.processedData, productionMonth: result?.productionMonth ?? ctx.state.productionMonth } });
    ctx.actions.log?.({ action: 'qa', details: summaryLine(issues) });
  },
  settings: { defaults: DEFAULT_SETTINGS, Component: SettingsPanel },
});
