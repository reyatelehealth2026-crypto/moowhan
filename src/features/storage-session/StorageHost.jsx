import { useEffect, useRef, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { Button, ConfirmDialog, Chip, pushToast, announce } from '../ui-kit/index.js';
import { formatDate } from '../../utils/format.js';
import { STORAGE_UNAVAILABLE_MESSAGE } from '../../lib/storage/index.js';
import { describeSession } from './session.js';
import useStorageSession from './useStorageSession.js';

// Always mounted (banner slot): opens storage, autosaves, shows the restore banner and the
// "also forget saved data?" questions that follow a reset.
export default function StorageHost({ ctx }) {
  const [snap, ctrl] = useStorageSession();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const { state, actions } = ctx;
  const [dismissed, setDismissed] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [askReset, setAskReset] = useState([]); // queue of 'session' | 'template'
  const prevLog = useRef(0);
  const warned = useRef(false);
  const autoLoaded = useRef(false);

  useEffect(() => { ctrl.init(); }, [ctrl]);

  // one warning (changelog + notice) when the browser storage cannot be used
  useEffect(() => {
    if (!snap.degraded || warned.current) return;
    warned.current = true;
    actions.log({ action: 'warning', details: STORAGE_UNAVAILABLE_MESSAGE });
    actions.setNotice(STORAGE_UNAVAILABLE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.degraded]);

  // use the remembered master file automatically (once per page load)
  useEffect(() => {
    if (!snap.ready || autoLoaded.current || !snap.templateMeta) return;
    autoLoaded.current = true;
    if (state.template) return;
    ctrl.loadTemplateFile().then((f) => { if (f && !ctxRef.current.state.template) actions.setTemplateFile(f); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.ready, snap.templateMeta]);

  // keep the remembered master file in step with the one in use
  useEffect(() => {
    const t = state.template;
    if (!t || !snap.prefs.rememberTemplate || !snap.ready) return;
    const m = snap.templateMeta;
    if (m && m.name === t.name && m.size === t.size) return;
    ctrl.rememberTemplate(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.template, snap.prefs.rememberTemplate, snap.ready]);

  // autosave: after processAll / updateRowValues / exportExcel (all touch processedData or changeLog)
  useEffect(() => {
    if (!state.processedData) return;
    ctrl.scheduleAutosave(() => ctxRef.current.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.processedData, state.changeLog.length, snap.prefs.saveSession]);
  useEffect(() => () => ctrl.cancelAutosave(), [ctrl]);

  // reset detected (changelog cleared): ask whether to forget what is stored too
  useEffect(() => {
    const n = state.changeLog.length;
    if (prevLog.current > 0 && n === 0 && !state.processedData && !state.sourceFiles.length) {
      const q = [snap.sessionMeta && 'session', snap.templateMeta && 'template'].filter(Boolean);
      if (q.length) setAskReset(q);
    }
    prevLog.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.changeLog.length]);

  const showBanner = snap.ready && !snap.degraded && snap.sessionMeta && !dismissed && !state.sourceFiles.length && !state.processedData;

  const restore = async () => {
    const out = await ctrl.restoreSession(() => ctxRef.current);
    if (out.ok) {
      pushToast({ message: `กู้คืนงานแล้ว (${out.result?.files?.length ?? 0} ไฟล์${out.orphans?.length ? `, แก้ไขที่ใช้ไม่ได้ ${out.orphans.length}` : ''})`, tone: out.orphans?.length ? 'warning' : 'success' });
      announce('กู้คืนงานเรียบร้อย');
    } else actions.setError(out.error || 'กู้คืนงานไม่สำเร็จ');
  };

  return (
    <>
      {showBanner && (
        <div className="mb-6 p-4 border rounded-xl bg-blue-50 border-blue-200 flex flex-col sm:flex-row sm:items-center gap-3" role="status" data-testid="restore-banner">
          <span className="w-6 h-6 flex-shrink-0 text-blue-500"><Icons.History /></span>
          <p className="flex-1 min-w-0 text-sm sm:text-base text-blue-900 break-words">{describeSession(snap.sessionMeta, { formatDate })}</p>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" loading={snap.restoring} onClick={restore} data-testid="restore-session">กู้คืน</Button>
            <Button size="sm" variant="secondary" disabled={snap.restoring} onClick={() => setConfirmFresh(true)} data-testid="discard-session">เริ่มใหม่</Button>
            <button type="button" onClick={() => setDismissed(true)} aria-label="ปิดแบนเนอร์" className="px-2 text-blue-700 opacity-60 hover:opacity-100">✕</button>
          </div>
        </div>
      )}
      {snap.prefs.saveSession && snap.lastSavedAt && (
        <div className="mb-4 flex justify-end"><Chip tone="success" className="max-w-full" ><span data-testid="autosave-chip">บันทึกอัตโนมัติ ✓ {formatDate(snap.lastSavedAt, 'time')}</span></Chip></div>
      )}
      {confirmFresh && (
        <ConfirmDialog
          title="เริ่มใหม่โดยไม่กู้คืน"
          message="งานที่บันทึกไว้ในเครื่องนี้จะถูกลบ ยืนยันหรือไม่"
          confirmLabel="ลบงานที่บันทึกไว้" danger
          onCancel={() => setConfirmFresh(false)}
          onConfirm={async () => { setConfirmFresh(false); await ctrl.discardSession(); }}
        />
      )}
      {askReset.length > 0 && (
        <ConfirmDialog
          title={askReset[0] === 'session' ? 'ล้างงานที่ค้างด้วยหรือไม่' : 'ลืมไฟล์หลักด้วยหรือไม่'}
          message={askReset[0] === 'session' ? 'รีเซ็ตแล้ว แต่งานที่บันทึกไว้ในเครื่องนี้ยังอยู่ ต้องการลบด้วยหรือไม่' : 'รีเซ็ตแล้ว แต่ไฟล์หลักที่จำไว้ในเครื่องนี้ยังอยู่ ต้องการให้ลืมไฟล์นี้ด้วยหรือไม่'}
          confirmLabel={askReset[0] === 'session' ? 'ล้างงานที่ค้าง' : 'ลืมไฟล์หลัก'} cancelLabel="เก็บไว้" danger
          onCancel={() => setAskReset((q) => q.slice(1))}
          onConfirm={async () => {
            const which = askReset[0];
            setAskReset((q) => q.slice(1));
            if (which === 'session') await ctrl.discardSession(); else { await ctrl.forgetTemplate(); await ctrl.setPrefs({ rememberTemplate: false }); }
          }}
        />
      )}
    </>
  );
}
