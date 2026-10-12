import { useEffect, useRef, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { Button, ConfirmDialog, pushToast } from '../ui-kit/index.js';
import { formatDate, formatSize } from '../../utils/format.js';
import { SESSION_DAY_CHOICES } from './session.js';
import useStorageSession from './useStorageSession.js';

const dayLabel = (d) => (d === 1 ? '24 ชั่วโมง' : `${d} วัน`);

// "ข้อมูลที่เก็บในเครื่องนี้" — shown under the upload tab.
export default function StoragePanel({ ctx }) {
  const [snap, ctrl] = useStorageSession();
  const { state, actions } = ctx;
  const [inv, setInv] = useState([]);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const picker = useRef(null);
  const { prefs, templateMeta, sessionMeta } = snap;

  useEffect(() => {
    if (!snap.ready) return;
    let live = true;
    ctrl.inventory().then((x) => { if (live) setInv(x); });
    return () => { live = false; };
  }, [ctrl, snap.ready, snap.lastSavedAt, templateMeta, sessionMeta]);

  const toggleTemplate = async (on) => {
    await ctrl.setPrefs({ rememberTemplate: on, templatePromptShown: true });
    if (on && state.template) await ctrl.rememberTemplate(state.template);
    if (!on) await ctrl.forgetTemplate();
  };
  const firstTime = state.template && !templateMeta && !prefs.templatePromptShown;
  const templateLoaded = state.template && templateMeta && state.template.name === templateMeta.name;

  return (
    <section className="mt-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 print:hidden" data-testid="storage-panel" aria-labelledby="storage-title">
      <h2 id="storage-title" className="text-lg font-semibold flex items-center gap-2"><span className="w-5 h-5 text-slate-500"><Icons.Template /></span>ข้อมูลที่เก็บในเครื่องนี้</h2>
      {snap.degraded && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">ไม่สามารถบันทึกในเครื่องได้ ฟังก์ชันอื่นยังใช้งานได้</p>}

      {/* tier: template */}
      <div className={`space-y-2 ${firstTime ? 'p-3 rounded-xl bg-blue-50 border border-blue-200' : ''}`}>
        {templateMeta ? (
          <p className="text-sm" data-testid="template-card">
            ใช้ไฟล์หลักที่จำไว้: <b className="break-all">{templateMeta.name}</b>{' '}
            <span className="text-slate-500">(บันทึก {formatDate(templateMeta.savedAt, 'short')}, {templateMeta.sha256})</span>
            {!templateLoaded && <span className="text-slate-500"> — ยังไม่ได้ใช้ในงานนี้</span>}
          </p>
        ) : null}
        <label className="flex items-start gap-2 text-sm min-h-[44px] sm:min-h-0">
          <input type="checkbox" className="mt-1 w-4 h-4" data-testid="remember-template" checked={!!templateMeta} disabled={!state.template && !templateMeta} onChange={(e) => toggleTemplate(e.target.checked)} />
          <span>จำไฟล์หลักไว้ในเครื่องนี้ <span className="text-slate-500">(เก็บในเบราว์เซอร์นี้เท่านั้น ไม่ส่งออกไปที่ใด)</span></span>
        </label>
        {templateMeta && (
          <div className="flex flex-wrap gap-2">
            {!state.template && <Button size="sm" variant="secondary" onClick={async () => { const f = await ctrl.loadTemplateFile(); if (f) actions.setTemplateFile(f); }}>ใช้ไฟล์หลักที่จำไว้</Button>}
            <Button size="sm" variant="secondary" onClick={() => picker.current?.click()}>เปลี่ยนไฟล์หลัก</Button>
            <Button size="sm" variant="ghost" data-testid="forget-template" onClick={async () => { await toggleTemplate(false); pushToast({ message: 'ลืมไฟล์หลักแล้ว', tone: 'info' }); }}>ลืมไฟล์นี้</Button>
            <input ref={picker} type="file" accept=".xlsx,.xls" className="hidden" data-testid="template-picker" onChange={(e) => { const f = e.target.files?.[0]; if (f) actions.setTemplateFile(f); e.target.value = ''; }} />
          </div>
        )}
      </div>

      {/* tier: session */}
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm min-h-[44px] sm:min-h-0">
          <input type="checkbox" className="mt-1 w-4 h-4" data-testid="save-session-toggle" checked={prefs.saveSession} onChange={(e) => ctrl.setPrefs({ saveSession: e.target.checked })} />
          <span>บันทึกงานไว้ในเครื่อง <span className="text-slate-500">(ค่าเริ่มต้นปิด · เมื่อเปิดจะบันทึกอัตโนมัติหลังประมวลผล แก้ไข และดาวน์โหลด)</span></span>
        </label>
        {prefs.saveSession && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">เก็บไว้
              <select className="border border-slate-300 rounded-lg px-2 py-2 min-h-[44px] bg-white" value={prefs.sessionDays} onChange={(e) => ctrl.setPrefs({ sessionDays: Number(e.target.value) })}>
                {SESSION_DAY_CHOICES.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
              </select>
            </label>
            <Button size="sm" Icon={Icons.Download} loading={snap.saving} disabled={!state.sourceFiles.length} data-testid="save-session" onClick={async () => {
              const out = await ctrl.saveSession(state);
              pushToast({ message: out.ok ? 'บันทึกงานแล้ว' : 'บันทึกงานไม่สำเร็จ', tone: out.ok ? 'success' : 'warning' });
            }}>บันทึกงาน</Button>
            {sessionMeta && <Button size="sm" variant="ghost" onClick={() => ctrl.discardSession()}>ลบงานที่บันทึกไว้</Button>}
          </div>
        )}
      </div>

      {/* inventory */}
      <div>
        <h3 className="text-sm font-medium text-slate-600 mb-2">รายการที่เก็บอยู่</h3>
        {inv.length ? (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg" data-testid="storage-inventory">
            {inv.map((r) => (
              <li key={r.key} className="p-2 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="min-w-0 break-words">{r.purpose}<span className="text-slate-400"> · {r.key}</span></span>
                <span className="text-xs text-slate-500 flex-shrink-0">{formatSize(r.size)} · บันทึก {formatDate(r.savedAt, 'long')}{r.expiresAt ? ` · หมดอายุ ${formatDate(r.expiresAt, 'short')}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-400">ยังไม่มีข้อมูลที่เก็บไว้</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 flex-1 min-w-[16rem]">ข้อมูลทั้งหมดเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ถูกส่งออกไปที่ใด · การบันทึกเป็นแบบ best-effort: Safari อาจล้างข้อมูลหลังไม่ได้ใช้งาน 7 วัน จึงแสดงวันที่บันทึกไว้เสมอ</p>
        <Button variant="danger" size="sm" Icon={Icons.Trash} data-testid="wipe-all" onClick={() => setConfirmWipe(true)}>ล้างข้อมูลที่เก็บในเครื่องทั้งหมด</Button>
      </div>
      {confirmWipe && (
        <ConfirmDialog
          title="ล้างข้อมูลที่เก็บในเครื่องทั้งหมด"
          message="ไฟล์หลักที่จำไว้ งานที่บันทึกไว้ และการตั้งค่าที่เก็บในเครื่องนี้จะถูกลบทั้งหมด (ไฟล์ที่เปิดอยู่ตอนนี้ไม่ถูกลบ)"
          confirmLabel="ล้างทั้งหมด" danger
          onCancel={() => setConfirmWipe(false)}
          onConfirm={async () => { setConfirmWipe(false); await ctrl.wipeAll(); setInv([]); pushToast({ message: 'ล้างข้อมูลที่เก็บในเครื่องแล้ว', tone: 'success' }); }}
        />
      )}
    </section>
  );
}
