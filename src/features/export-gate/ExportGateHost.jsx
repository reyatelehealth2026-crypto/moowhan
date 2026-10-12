import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import ExportDialog from '../../components/ExportDialog.jsx';
import Icons from '../../components/Icons.jsx';
import { Button } from '../ui-kit/index.js';
import { expectedTotals } from '../../lib/excel/expectedTotals.js';
import { exportDialog } from './dialogStore.js';
import { canSaveToFolder, deliveryOptions, saveTarget } from './saveTarget.js';
import { buildChecklist } from './checklist.js';
import { fileNameFor, patternFor, performExport } from './flow.js';
import { planExport } from './plan.js';
import Panel from './Panel.jsx';

// Lives in the feature's banner slot: shows the "ส่งออกแล้ว" strip and owns the export dialog.
export default function ExportGateHost({ ctx }) {
  const { state, actions } = ctx;
  const dlg = useSyncExternalStore(exportDialog.subscribe, exportDialog.get);
  const [options, setOptions] = useState({ highlight: true, fileNamePattern: null, excludeSheets: [] });
  const target = useSyncExternalStore(saveTarget.subscribe, saveTarget.get);
  const [override, setOverride] = useState(false);
  const [preview, setPreview] = useState({ extraSheets: [], cellWrites: [] });
  const [dismissedAt, setDismissedAt] = useState(null);
  const last = state.lastExport;
  const xlsx = state.template?.kind === 'xlsx';
  const inspection = xlsx ? state.template.inspection ?? null : null;

  // which extra sheets / header cells the other features would add (only needed while choosing)
  useEffect(() => {
    if (!dlg.open || dlg.view === 'result') return undefined;
    let live = true;
    setOverride(false);
    Promise.resolve(actions.previewExport?.()).then((p) => { if (live && p) setPreview(p); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlg.open, dlg.view]);

  const issues = actions.gate?.issues ?? [];
  const pattern = patternFor(state, options.fileNamePattern);
  const fileName = fileNameFor(state, options.fileNamePattern);
  const plan = useMemo(
    () => planExport({ processedData: state.processedData, inspection, cellWrites: preview.cellWrites, extraSheets: preview.extraSheets.filter((s) => !options.excludeSheets.includes(s.name)) }),
    [state.processedData, inspection, preview, options.excludeSheets],
  );
  const expected = useMemo(() => (state.processedData ? expectedTotals(state.processedData, { inspection }) : null), [state.processedData, inspection]);
  const items = useMemo(
    () => (last ? buildChecklist({ report: last.report, verification: last.verification, expected, highlight: last.highlight, plannedCellWrites: preview.cellWrites }) : []),
    [last, expected, preview.cellWrites],
  );

  const download = async () => {
    exportDialog.patch({ busy: true });
    const blocks = issues.filter((i) => i.level === 'block');
    try {
      await performExport(ctx, { highlight: options.highlight, fileName, excludeSheets: options.excludeSheets, overrideIssues: override ? blocks : [] });
    } finally {
      exportDialog.patch({ busy: false });
    }
  };
  const downloadAgain = async () => {
    exportDialog.patch({ busy: true });
    try { await actions.downloadLastExport(exportDialog.get().held ? deliveryOptions() : undefined); } finally { exportDialog.patch({ busy: false, held: false }); }
  };
  const onAction = async (action) => {
    if (action.id === 'reprocess') await actions.processAll();
  };
  const pickFolder = async () => {
    try { await saveTarget.pickFolder(); } catch (err) { actions.setError?.(`เปิดโฟลเดอร์ไม่ได้: ${err?.message || 'ไม่ทราบสาเหตุ'} — ใช้การดาวน์โหลดตามปกติแทน`); saveTarget.reset(); }
  };
  const destination = { supported: canSaveToFolder(), kind: target.kind, folderName: target.name, onDownload: saveTarget.useDownload, onPickFolder: pickFolder };
  const verification = last?.verification;
  const failed = verification?.ok === false;

  return (
    <>
      {last && !dlg.open && dismissedAt !== last.at && (
        <div className={`mb-6 p-3 sm:p-4 border rounded-xl flex flex-wrap items-center gap-3 ${failed ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`} role="status" data-testid="export-banner">
          <span className="w-5 h-5 flex-shrink-0">{failed ? <Icons.Alert /> : <Icons.Check />}</span>
          <span className="flex-1 min-w-0 text-sm break-words">
            ส่งออกแล้ว: {last.fileName}
            {verification ? (failed ? ` • ตรวจไฟล์พบ ${verification.failed?.length ?? 0} รายการที่ไม่ตรง` : verification.ok ? ' • ตรวจไฟล์ผ่าน' : '') : ' • กำลังตรวจไฟล์'}
          </span>
          <Button size="sm" variant="secondary" onClick={() => exportDialog.open('result', { held: false })} data-testid="export-open-result">ดูผลการส่งออก</Button>
          <button type="button" onClick={() => setDismissedAt(last.at)} className="w-11 h-11 -my-2 opacity-60 hover:opacity-100" aria-label="ปิดข้อความ">✕</button>
        </div>
      )}
      {dlg.open && (dlg.view !== 'result' || last) && (
        <ExportDialog
          view={dlg.view}
          title={dlg.view === 'result' ? `ผลการส่งออก (${last.fileName})` : 'ตรวจสอบก่อนดาวน์โหลด'}
          issues={issues}
          plan={plan}
          options={{ ...options, fileNamePattern: pattern }}
          onOptions={(patch) => setOptions((o) => ({ ...o, ...patch }))}
          extraSheets={preview.extraSheets}
          fileNamePreview={fileName}
          override={override}
          onOverride={setOverride}
          busy={dlg.busy}
          onClose={() => exportDialog.close()}
          onDownload={download}
          onAction={onAction}
          destination={destination}
          resultSlot={<Panel items={items} verification={verification} held={dlg.held} busy={dlg.busy} onDownload={downloadAgain} />}
        />
      )}
    </>
  );
}
