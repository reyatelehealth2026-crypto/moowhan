import { useEffect, useMemo, useRef, useState } from 'react';
import Icons from './components/Icons.jsx';
import Banner from './components/Banner.jsx';
import UploadTab from './components/UploadTab.jsx';
import PreviewTab from './components/PreviewTab.jsx';
import SummaryTab from './components/SummaryTab.jsx';
import MatchingTab from './components/MatchingTab.jsx';
import ChangelogTab from './components/ChangelogTab.jsx';
import ExcelPreview from './components/ExcelPreview.jsx';
import useConsolidator from './state/useConsolidator.js';
import { FEATURES } from './features/index.js';
import FeatureErrorBoundary from './components/FeatureErrorBoundary.jsx';
import TabBar from './components/TabBar.jsx';
import OverflowMenu from './components/OverflowMenu.jsx';
import { visibleFeatures } from './features/visibility.js';
import { collectCellWrites, collectExportSheets, collectIssues, featureName, normalizeBadge, normalizeHeaderActions, runHook, expandFilesWith } from './features/runtime.js';
import { DAILY_SHEETS, ANALYZE_SHEET, SUMMARY_SHEET } from './constants.js';
import { ToastRegion, LiveRegion, pushToast, announce, STRINGS } from './features/ui-kit/index.js';
import useHotkeys from './hooks/useHotkeys.js';
import { openDiagnostics } from './features/help-center/helpStore.js';
import { formatMonth, monthLabels as buildMonthLabels, todayStamp } from './utils/format.js';
import { exportDialog } from './features/export-gate/dialogStore.js';
import { gateIssuesFor, requestExport } from './features/export-gate/flow.js';
import { summarizeGate } from './features/export-gate/gate.js';
import { attachOverrideNote } from './features/export-gate/lastExport.js';

const MAX_INLINE_ACTIONS = 3;
// renders feature slot output inside the error boundary (a throwing slot cannot blank the app)
const SlotHost = ({ fn, ctx }) => fn(ctx) ?? null;
const warnOnly = ({ message, error }) => console.warn(message, error);

const APP_TITLE = 'รีบทำเดียวอดเลนเกม';

// ==================== MAIN APP ====================
export default function App() {
  const expandRef = useRef(null); // import-cli: the visible features' expandFiles hooks (set below, read at drop time)
  const { state, actions: core } = useConsolidator({ expandFiles: (file) => expandRef.current?.(file) ?? null });
  const [tab, setTab] = useState('upload');
  const [showPreview, setShowPreview] = useState(false);

  // features that must stay reachable: tabs with block-level issues are never hidden
  const allIssues = useMemo(
    () => (state.processedData ? collectIssues(FEATURES, { state, actions: core, monthLabels: state.monthLabels }, warnOnly) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.processedData, state.summaryData, state.features],
  );
  const keepIds = new Set(allIssues.filter((i) => i.level === 'block').map((i) => i.featureId));
  const features = visibleFeatures(FEATURES, state.profile, { keepIds }); // the single visibility filter point
  expandRef.current = (file) => expandFilesWith(features, file, warnOnly);
  const simpleHiddenTabs = FEATURES.filter((f) => f.tab && !features.includes(f) && state.profile?.features?.[f.id]?.enabled !== false).length;

  const report = ({ message, error }) => {
    core.setNotice(message);
    core.log({ action: 'error', details: `${message}${error?.message ? ` — ${error.message}` : ''}` });
  };

  const actions = {
    ...core,
    goTo: setTab,
    openPreview: () => setShowPreview(true),
    processAll: async () => {
      const result = await core.processAll();
      if (result) {
        setTab('preview');
        const rowCount = Object.values(result.processedData || {}).reduce((n, rows) => n + rows.length, 0);
        announce(`ประมวลผลเสร็จ: ${result.files?.length ?? 0} ไฟล์ ${rowCount} แถว`);
        // fresh ctx: the render-time `state` is from before processing finished
        const labels = buildMonthLabels(result.productionMonth);
        const fresh = {
          state: {
            ...state,
            processedData: result.processedData,
            summaryData: result.summary,
            matchingDetails: result.matching,
            productionMonth: result.productionMonth,
            monthLabels: labels,
          },
          actions,
          monthLabels: labels,
        };
        features.forEach((f) => runHook(f, 'onProcessed', [fresh, result], report));
      }
      return result;
    },
    // export-gate: the user-facing exportExcel goes through the gate (dialog only for block/confirm issues);
    // exportDirect is the ungated build. options.hold builds without downloading (the flow verifies first).
    exportExcel: async (options = {}) =>
      gateActive && !options.skipGate ? requestExport(ctx, features, options, report) : actions.exportDirect(options),
    exportDirect: async (options = {}) => {
      const protectedSheets = [...new Set([...(state.template?.sheets || []), ...DAILY_SHEETS, ANALYZE_SHEET, SUMMARY_SHEET])];
      const collected = await collectExportSheets(features, ctx, { protectedSheets, report, extra: options.extraSheets || [] });
      const sheets = attachOverrideNote(collected.sheets.filter((s) => !options.excludeSheets?.includes(s.name)), options.overrideIssues);
      const cellWrites = await collectCellWrites(features, ctx, report);
      const result = await core.exportExcel({ ...options, extraSheets: sheets, cellWrites, protectedSheets });
      if (result && !options.hold) {
        announce(`ดาวน์โหลดไฟล์ ${result.fileName} แล้ว`);
        features.forEach((f) => runHook(f, 'onExported', [ctx, result], report));
      }
      return result;
    },
    downloadLastExport: async () => {
      const result = await core.downloadLastExport();
      if (result) {
        announce(`ดาวน์โหลดไฟล์ ${result.fileName} แล้ว`);
        features.forEach((f) => runHook(f, 'onExported', [ctx, result], report));
      }
      return result;
    },
    // extra sheets / header cells other features would add (for the export dialog)
    previewExport: async () => {
      const protectedSheets = [...new Set([...(state.template?.sheets || []), ...DAILY_SHEETS, ANALYZE_SHEET, SUMMARY_SHEET])];
      const { sheets } = await collectExportSheets(features, ctx, { protectedSheets, report: warnOnly });
      return { extraSheets: sheets.map((s) => ({ name: s.name, rows: s.aoa?.length ?? 0 })), cellWrites: await collectCellWrites(features, ctx, warnOnly) };
    },
    openExportOptions: () => exportDialog.open('options', { busy: false }),
    reset: () => {
      core.reset();
      setTab('upload');
      setShowPreview(false);
    },
  };
  const ctx = { state, actions, monthLabels: state.monthLabels };

  // export-gate: issues of every visible feature + the gate rules; read by SummaryTab's ready strip and the dialog
  const gateActive = features.some((f) => f.id === 'export-gate');
  const gateIssues = useMemo(
    () => (gateActive && state.processedData ? gateIssuesFor(features, ctx, warnOnly) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateActive, state.processedData, state.summaryData, state.isStale, state.template, state.sourceFiles, state.features],
  );
  actions.gate = gateActive ? { issues: gateIssues, ...summarizeGate(gateIssues) } : null;

  const resolveBadge = (f) => {
    const b = f.tab.badge;
    if (!b) return null;
    try { return normalizeBadge(typeof b === 'function' ? b(ctx) : b); } catch { return null; }
  };

  const tabs = [
    { id: 'upload', order: 10, label: 'อัปโหลดไฟล์', Icon: Icons.Upload, enabled: true, Component: UploadTab },
    { id: 'preview', order: 20, label: 'ตรวจสอบข้อมูล', Icon: Icons.Eye, enabled: !!state.processedData, tooltip: 'ต้องประมวลผลไฟล์ก่อน', Component: PreviewTab },
    { id: 'matching', order: 30, label: 'รายละเอียด Matching', Icon: Icons.Link, enabled: !!state.matchingDetails, tooltip: 'ต้องประมวลผลไฟล์ก่อน', Component: MatchingTab },
    { id: 'changelog', order: 35, label: 'ประวัติการแก้ไข', Icon: Icons.History, enabled: state.changeLog.length > 0, tooltip: 'ยังไม่มีรายการ', Component: ChangelogTab },
    { id: 'summary', order: 40, label: 'สรุปรวม', Icon: Icons.Chart, enabled: !!state.summaryData, tooltip: 'ต้องประมวลผลไฟล์ก่อน', Component: SummaryTab },
    ...features.filter((f) => f.tab).map((f) => ({
      id: f.id,
      order: f.order ?? 100,
      group: f.group,
      ...f.tab,
      badge: resolveBadge(f),
      enabled: f.tab.enabled ? !!f.tab.enabled(ctx) : true,
    })),
  ].map((t) => ({ group: 'core', ...t })).sort((a, b) => a.order - b.order);

  const activeTab = tabs.find((t) => t.id === tab && t.enabled) || tabs[0];
  useEffect(() => {
    if (activeTab.id !== tab) setTab(activeTab.id);
  }, [activeTab.id, tab]);

  // success messages are Toasts (errors/warnings stay in Banner)
  const notice = state.notice;
  useEffect(() => {
    if (notice?.tone === 'success') {
      pushToast({ message: notice.message, tone: 'success' });
      core.dismissNotice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  useHotkeys(
    { canProcess: activeTab.id === 'upload' && state.sourceFiles.length > 0 && !state.processing.active, canExport: !!state.processedData && !state.exporting },
    { process: () => actions.processAll(), export: () => actions.exportExcel() },
  );

  const simple = state.profile?.ui?.mode === 'simple';
  const rawActions = features.flatMap((f) => normalizeHeaderActions(runHook(f, 'headerActions', [ctx], warnOnly)).map((a, i) => ({ ...a, key: `${f.id}-${i}` })));
  const inlineNodes = rawActions.filter((a) => a.node).map((a) => a.node);
  const sortedActions = rawActions.filter((a) => !a.node).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const inlineActions = sortedActions.slice(0, MAX_INLINE_ACTIONS);
  const menuActions = sortedActions.slice(MAX_INLINE_ACTIONS);
  const logFeatureError = (f) => (error) => report({ message: `ฟีเจอร์ "${featureName(f)}" เกิดข้อผิดพลาดขณะแสดงผล`, error });
  const activeFeature = features.find((f) => f.id === activeTab.id);
  const previewFileName = `Production_${state.template?.kind === 'xlsx' ? 'Updated' : 'Summary'}_${todayStamp()}.xlsx`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 text-slate-900">
      <header className="print:hidden bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 p-2.5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl text-white shadow-lg flex-shrink-0"><Icons.File /></div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent truncate">{APP_TITLE}</h1>
              <p className="text-xs sm:text-sm text-slate-500 truncate">
                TMT Camera Production Plan Summary
                {state.productionMonth && <span className="text-blue-600"> • เดือนผลิต {formatMonth(state.productionMonth)} (N)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => actions.setUiMode(simple ? 'advanced' : 'simple')}
              title="สลับโหมดเริ่มต้น / ขั้นสูง"
              aria-label={`โหมด${simple ? 'เริ่มต้น' : 'ขั้นสูง'} (กดเพื่อสลับ)`}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 text-sm"
            >
              <span className="w-4 h-4"><Icons.Filter /></span>
              <span className="hidden sm:inline">{simple ? 'โหมดเริ่มต้น' : 'ขั้นสูง'}</span>
            </button>
            {inlineNodes.map((n, i) => <span key={`n${i}`}>{n}</span>)}
            {inlineActions.map((a) => (
              <button key={a.key} type="button" onClick={a.onClick} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
                {a.Icon && <span className="w-4 h-4"><a.Icon /></span>}<span className="hidden sm:inline">{a.label}</span>
              </button>
            ))}
            <OverflowMenu label={STRINGS.buttons.options} testId="options" items={menuActions.map((a) => ({ key: a.key, label: a.label, Icon: a.Icon, onClick: a.onClick }))} />
            <button onClick={actions.reset} data-testid="reset" className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
              <span className="w-4 h-4"><Icons.Reset /></span><span className="hidden sm:inline">{STRINGS.buttons.reset}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="print:hidden"><TabBar tabs={tabs} activeId={activeTab.id} onSelect={setTab} /></div>
        {simple && simpleHiddenTabs > 0 && (
          <p className="-mt-3 mb-4 text-sm">
            <button type="button" onClick={() => actions.setUiMode('advanced')} className="text-blue-600 hover:underline">
              แสดงแท็บเพิ่มเติม ({simpleHiddenTabs})
            </button>
          </p>
        )}

        <Banner tone="error" message={state.error} onDismiss={actions.dismissError} actions={[{ label: 'รายงานปัญหา', onClick: openDiagnostics }]} />
        <Banner tone={state.notice?.tone || 'warning'} message={state.notice?.tone === 'success' ? null : state.notice?.message} onDismiss={actions.dismissNotice} />
        {state.isStale && (
          <Banner tone="warning" message="รายการไฟล์เปลี่ยนไปหลังจากประมวลผลครั้งล่าสุด กด “รวมข้อมูลและคำนวณ” อีกครั้งเพื่ออัปเดตผลลัพธ์" />
        )}

        {features.filter((f) => f.slots?.banner).map((f) => (
          <FeatureErrorBoundary key={`banner-${f.id}`} name={featureName(f)} onError={logFeatureError(f)}>
            <SlotHost fn={f.slots.banner} ctx={ctx} />
          </FeatureErrorBoundary>
        ))}

        <FeatureErrorBoundary key={activeTab.id} name={activeFeature ? featureName(activeFeature) : activeTab.label} onError={activeFeature ? logFeatureError(activeFeature) : (error) => report({ message: `แท็บ "${activeTab.label}" เกิดข้อผิดพลาดขณะแสดงผล`, error })}>
          <div role="tabpanel" id="tabpanel-main" aria-labelledby={`tab-${activeTab.id}`}>
            <activeTab.Component state={state} actions={actions} monthLabels={state.monthLabels} />
          </div>
        </FeatureErrorBoundary>

        {activeTab.id === 'upload' && features.filter((f) => f.slots?.uploadPanel).map((f) => (
          <FeatureErrorBoundary key={`upload-${f.id}`} name={featureName(f)} onError={logFeatureError(f)}>
            <SlotHost fn={f.slots.uploadPanel} ctx={ctx} />
          </FeatureErrorBoundary>
        ))}

        {showPreview && (
          <ExcelPreview
            data={state.processedData}
            summaryData={state.summaryData}
            template={state.template}
            fileName={previewFileName}
            onClose={() => setShowPreview(false)}
            onDownload={() => actions.exportExcel()}
          />
        )}
      </main>

      <ToastRegion />
      <LiveRegion />

      <footer className="print:hidden border-t border-slate-200 mt-12 py-6 bg-white text-center text-slate-400 text-sm">
        moowhan v{__APP_VERSION__}
      </footer>
    </div>
  );
}
