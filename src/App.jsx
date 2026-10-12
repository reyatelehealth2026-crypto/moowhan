import { useEffect, useMemo, useState } from 'react';
import Icons from './components/Icons.jsx';
import Banner from './components/Banner.jsx';
import UploadTab from './components/UploadTab.jsx';
import PreviewTab from './components/PreviewTab.jsx';
import SummaryTab from './components/SummaryTab.jsx';
import MatchingTab from './components/MatchingTab.jsx';
import ChangelogTab from './components/ChangelogTab.jsx';
import ChartDashboard from './components/ChartDashboard.jsx';
import ExcelPreview from './components/ExcelPreview.jsx';
import useConsolidator from './state/useConsolidator.js';
import { FEATURES } from './features/index.js';
import FeatureErrorBoundary from './components/FeatureErrorBoundary.jsx';
import TabBar from './components/TabBar.jsx';
import OverflowMenu from './components/OverflowMenu.jsx';
import { visibleFeatures } from './features/visibility.js';
import { collectCellWrites, collectExportSheets, collectIssues, featureName, normalizeBadge, normalizeHeaderActions, runHook } from './features/runtime.js';
import { DAILY_SHEETS, ANALYZE_SHEET, SUMMARY_SHEET } from './constants.js';
import { formatMonth, monthLabels as buildMonthLabels, todayStamp } from './utils/format.js';

const MAX_INLINE_ACTIONS = 3;
// renders feature slot output inside the error boundary (a throwing slot cannot blank the app)
const SlotHost = ({ fn, ctx }) => fn(ctx) ?? null;
const warnOnly = ({ message, error }) => console.warn(message, error);

const APP_TITLE = 'รีบทำเดียวอดเลนเกม';

// ==================== MAIN APP ====================
export default function App() {
  const { state, actions: core } = useConsolidator();
  const [tab, setTab] = useState('upload');
  const [showPreview, setShowPreview] = useState(false);
  const [showChart, setShowChart] = useState(false);

  // features that must stay reachable: tabs with block-level issues are never hidden
  const allIssues = useMemo(
    () => (state.processedData ? collectIssues(FEATURES, { state, actions: core, monthLabels: state.monthLabels }, warnOnly) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.processedData, state.summaryData, state.features],
  );
  const keepIds = new Set(allIssues.filter((i) => i.level === 'block').map((i) => i.featureId));
  const features = visibleFeatures(FEATURES, state.profile, { keepIds }); // the single visibility filter point
  const simpleHiddenTabs = FEATURES.filter((f) => f.tab && !features.includes(f) && state.profile?.features?.[f.id]?.enabled !== false).length;

  const report = ({ message, error }) => {
    core.setNotice(message);
    core.log({ action: 'error', details: `${message}${error?.message ? ` — ${error.message}` : ''}` });
  };

  const actions = {
    ...core,
    goTo: setTab,
    openPreview: () => setShowPreview(true),
    openChart: () => setShowChart(true),
    processAll: async () => {
      const result = await core.processAll();
      if (result) {
        setTab('preview');
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
    exportExcel: async (options = {}) => {
      const protectedSheets = [...new Set([...(state.template?.sheets || []), ...DAILY_SHEETS, ANALYZE_SHEET, SUMMARY_SHEET])];
      const { sheets } = await collectExportSheets(features, ctx, { protectedSheets, report, extra: options.extraSheets || [] });
      const cellWrites = await collectCellWrites(features, ctx, report);
      const result = await core.exportExcel({ ...options, extraSheets: sheets, cellWrites, protectedSheets });
      if (result) features.forEach((f) => runHook(f, 'onExported', [ctx, result], report));
      return result;
    },
    reset: () => {
      core.reset();
      setTab('upload');
      setShowPreview(false);
      setShowChart(false);
    },
  };
  const ctx = { state, actions, monthLabels: state.monthLabels };

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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
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
            <OverflowMenu label="เมนู" items={menuActions.map((a) => ({ key: a.key, label: a.label, Icon: a.Icon, onClick: a.onClick }))} />
            <button onClick={actions.reset} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
              <span className="w-4 h-4"><Icons.Reset /></span><span className="hidden sm:inline">รีเซ็ต</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <TabBar tabs={tabs} activeId={activeTab.id} onSelect={setTab} />
        {simple && simpleHiddenTabs > 0 && (
          <p className="-mt-3 mb-4 text-sm">
            <button type="button" onClick={() => actions.setUiMode('advanced')} className="text-blue-600 hover:underline">
              แสดงแท็บเพิ่มเติม ({simpleHiddenTabs})
            </button>
          </p>
        )}

        <Banner tone="error" message={state.error} onDismiss={actions.dismissError} />
        <Banner tone={state.notice?.tone || 'warning'} message={state.notice?.message} onDismiss={actions.dismissNotice} />
        {state.isStale && (
          <Banner tone="warning" message="รายการไฟล์เปลี่ยนไปหลังจากประมวลผลครั้งล่าสุด กด “รวมข้อมูลและคำนวณ” อีกครั้งเพื่ออัปเดตผลลัพธ์" />
        )}

        {features.filter((f) => f.slots?.banner).map((f) => (
          <FeatureErrorBoundary key={`banner-${f.id}`} name={featureName(f)} onError={logFeatureError(f)}>
            <SlotHost fn={f.slots.banner} ctx={ctx} />
          </FeatureErrorBoundary>
        ))}

        <FeatureErrorBoundary key={activeTab.id} name={activeFeature ? featureName(activeFeature) : activeTab.label} onError={activeFeature ? logFeatureError(activeFeature) : (error) => report({ message: `แท็บ "${activeTab.label}" เกิดข้อผิดพลาดขณะแสดงผล`, error })}>
          <activeTab.Component state={state} actions={actions} monthLabels={state.monthLabels} />
        </FeatureErrorBoundary>

        {activeTab.id === 'upload' && features.filter((f) => f.slots?.uploadPanel).map((f) => (
          <FeatureErrorBoundary key={`upload-${f.id}`} name={featureName(f)} onError={logFeatureError(f)}>
            <SlotHost fn={f.slots.uploadPanel} ctx={ctx} />
          </FeatureErrorBoundary>
        ))}

        {showChart && <ChartDashboard data={state.processedData} summaryData={state.summaryData} monthLabels={state.monthLabels} onClose={() => setShowChart(false)} />}
        {showPreview && (
          <ExcelPreview
            data={state.processedData}
            summaryData={state.summaryData}
            fileName={previewFileName}
            onClose={() => setShowPreview(false)}
            onDownload={() => actions.exportExcel()}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 mt-12 py-6 bg-white text-center text-slate-400 text-sm">
        moowhan v{__APP_VERSION__}
      </footer>
    </div>
  );
}
