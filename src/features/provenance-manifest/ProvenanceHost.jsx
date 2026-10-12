import { useState } from 'react';
import Icons from '../../components/Icons.jsx';
import Modal from '../../components/Modal.jsx';
import { Button, Chip, pushToast } from '../ui-kit/index.js';
import { shortHash } from '../../utils/hash.js';
import { copyText } from '../../utils/clipboard.js';
import { isoNow } from '../../utils/clock.js';
import { formatNumber, formatSize } from '../../utils/format.js';
import { FEATURE_ID, buildManifest, manifestFileName, manifestJson } from './manifest.js';
import { dataSignature, isStaleSent, makeSentRecord, sentChipText } from './sent.js';

const HASH_NOTE = 'SHA-256 ระบุไบต์ของไฟล์ที่แอปสร้างขึ้นเท่านั้น หากเปิดแล้วบันทึกซ้ำใน Excel ค่านี้จะไม่ตรงกับไฟล์ใหม่';

const Strip = ({ tone, children, action, onDismiss }) => (
  <div role="status" className={`mb-6 p-4 border rounded-xl flex flex-wrap items-center gap-3 text-sm ${tone === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
    <span className="flex-1 min-w-[12rem]">{children}</span>
    {action}
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="ปิดข้อความ" className="opacity-60 hover:opacity-100 text-lg leading-none px-1">✕</button>}
  </div>
);

function SentForm({ onSubmit, onCancel }) {
  const [note, setNote] = useState('');
  const [by, setBy] = useState('');
  return (
    <Modal onClose={onCancel} label="ทำเครื่องหมายว่าส่งแล้ว" className="max-w-md">
      <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit({ note, by }); }}>
        <h2 className="text-lg font-semibold">ทำเครื่องหมายว่าส่งแล้ว</h2>
        <label className="block text-sm">
          <span className="text-slate-600">หมายเหตุ (ส่งให้ใคร/ช่องทาง)</span>
          <input data-testid="sent-note" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 min-h-[44px]" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">ผู้ส่ง (ไม่บังคับ)</span>
          <input data-testid="sent-by" value={by} onChange={(e) => setBy(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 min-h-[44px]" />
        </label>
        <p className="text-xs text-slate-500">{HASH_NOTE}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>
          <Button type="submit" data-testid="sent-confirm">บันทึก</Button>
        </div>
      </form>
    </Modal>
  );
}

function ManifestPanel({ ctx, onClose }) {
  const { state, actions } = ctx;
  const feat = state.features?.[FEATURE_ID] || {};
  const m = buildManifest(state);
  const set = (patch) => actions.setFeatureData(FEATURE_ID, patch);

  const download = async () => {
    try {
      const excel = await import('../../lib/excel/index.js');
      excel.downloadBlob(new Blob([manifestJson(m)], { type: 'application/json' }), manifestFileName(m));
    } catch (err) {
      actions.setError(`ดาวน์โหลด Manifest ไม่สำเร็จ: ${err.message}`);
    }
  };
  const copy = async () => {
    const { ok } = await copyText(manifestJson(m));
    if (ok) pushToast({ message: 'คัดลอก JSON แล้ว', tone: 'success' });
    else actions.setError('คัดลอกไม่สำเร็จ ให้ใช้ปุ่มดาวน์โหลดแทน');
  };

  return (
    <Modal onClose={onClose} label="รอบการประมวลผล" className="max-w-3xl max-h-[92vh]">
      <div className="p-5 space-y-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">รอบการประมวลผล</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="text-slate-500 hover:text-slate-800 text-xl leading-none px-2 min-h-[44px]">✕</button>
        </div>
        {!state.processedData ? (
          <p className="text-sm text-slate-600">ยังไม่มีข้อมูล ประมวลผลไฟล์ก่อนเพื่อดูรายละเอียดของรอบนี้</p>
        ) : (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-2"><dt className="text-slate-500">เวอร์ชันแอป</dt><dd>{m.appVersion}</dd></div>
              <div className="flex gap-2"><dt className="text-slate-500">เวลา</dt><dd className="break-all">{m.generatedAt}</dd></div>
              <div className="flex gap-2"><dt className="text-slate-500">PRODUCTION MONTH</dt><dd>{m.productionMonth || '-'}</dd></div>
              <div className="flex gap-2"><dt className="text-slate-500">ไฟล์หลัก</dt><dd className="break-all">{m.template ? `${m.template.name} · ${shortHash(m.template.sha256)}` : '-'}</dd></div>
            </dl>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm" data-testid="manifest-files">
                <thead className="bg-slate-50 text-slate-600 text-left">
                  <tr>{['ชื่อไฟล์', 'โรงงาน', 'REVISION', 'ISSUE DATE', 'ขนาด', 'SHA-256', 'แถว'].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {m.files.map((f) => (
                    <tr key={f.name} className="border-t border-slate-100">
                      <td className="px-3 py-2">{f.name}</td><td className="px-3 py-2">{f.plant}</td><td className="px-3 py-2">{f.revision || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{f.issueDate || '-'}</td><td className="px-3 py-2 whitespace-nowrap">{formatSize(f.size)}</td>
                      <td className="px-3 py-2 font-mono">{shortHash(f.sha256)}</td><td className="px-3 py-2 text-right">{formatNumber(f.rows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-slate-700">
              ยอดรวม: {['n', 'n1', 'n2', 'n3'].map((k, i) => `${['N', 'N+1', 'N+2', 'N+3'][i]} ${formatNumber(m.totals.overall[k])}`).join(' · ')}
            </p>
            <p className="text-sm text-slate-700">
              ไฟล์ส่งออกล่าสุด: {m.output ? <>{m.output.fileName} · <span className="font-mono">{shortHash(m.output.sha256)}</span></> : 'ยังไม่ได้ส่งออก'}
            </p>
          </>
        )}
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 min-h-[44px]">
            <input type="checkbox" checked={feat.runInfo !== false} onChange={(e) => set({ runInfo: e.target.checked })} />
            <span>แนบ sheet “Run Info” ในไฟล์ Excel</span>
          </label>
          <label className="flex items-center gap-2 min-h-[44px]">
            <input type="checkbox" checked={!!feat.stampEnabled} onChange={(e) => set({ stampEnabled: e.target.checked })} />
            <span>ฝังตราประทับที่มาในไฟล์ (docProps/custom.xml, ไม่มีชื่อผู้ใช้)</span>
          </label>
        </div>
        <p className="text-xs text-slate-500">{HASH_NOTE}</p>
        <div className="flex flex-wrap gap-2">
          <Button Icon={Icons.Download} onClick={download} disabled={!state.processedData}>ดาวน์โหลด Manifest (.json)</Button>
          <Button variant="secondary" Icon={Icons.Share} onClick={copy} disabled={!state.processedData}>คัดลอก JSON</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Mounted through `slots.banner`: sign-off prompts + the two dialogs (no top-level tab). */
export default function ProvenanceHost({ ctx }) {
  const { state, actions } = ctx;
  const feat = state.features?.[FEATURE_ID] || {};
  const set = (patch) => actions.setFeatureData(FEATURE_ID, patch);
  const stale = isStaleSent(feat.sent, dataSignature(state));
  const last = feat.lastExport;
  const needsSign = !!last && !feat.promptDismissed && last.sha256 !== feat.sent?.sha256;

  const submit = ({ note, by }) => {
    const rowCounts = Object.fromEntries(Object.entries(state.processedData || {}).map(([k, rows]) => [k.split(' ')[0], rows.length]));
    const record = makeSentRecord({
      fileName: last.fileName, sha256: last.sha256, month: state.productionMonth ? `${state.productionMonth.year}${String(state.productionMonth.month).padStart(2, '0')}` : '',
      totals: state.totals, rowCounts, note, by, now: isoNow(), dataSignature: last.signature,
    });
    set({ sent: record, markOpen: false });
    actions.log({ fileName: last.fileName, action: 'sent', details: `ทำเครื่องหมายว่าส่งแล้ว (${shortHash(last.sha256)})${note ? ` • ${note}` : ''}` });
    pushToast({ message: 'บันทึกว่าส่งแล้ว', tone: 'success' });
  };

  return (
    <>
      {stale && (
        <Strip tone="warning" action={last && <Button size="sm" variant="secondary" onClick={() => set({ markOpen: true })}>ทำเครื่องหมายอีกครั้ง</Button>}>
          ข้อมูลมีการแก้ไขหลังส่งไฟล์ {feat.sent.fileName} ({shortHash(feat.sent.sha256)}) ไฟล์ที่ส่งไปแล้วไม่ตรงกับข้อมูลปัจจุบัน ควรส่งออกใหม่แล้วทำเครื่องหมายอีกครั้ง
        </Strip>
      )}
      {needsSign && !stale && (
        <Strip tone="info" onDismiss={() => set({ promptDismissed: true })} action={<Button size="sm" data-testid="mark-sent" Icon={Icons.Check} onClick={() => set({ markOpen: true })}>ทำเครื่องหมายว่าส่งแล้ว</Button>}>
          ส่งออก {last.fileName} แล้ว ({shortHash(last.sha256)}) ถ้าส่งไฟล์นี้ให้ผู้เกี่ยวข้องแล้ว ให้บันทึกไว้เพื่อใช้อ้างอิง
        </Strip>
      )}
      {feat.sent && <p className="mb-6 -mt-3" data-testid="sent-chip"><Chip tone={stale ? 'warning' : 'success'}>{sentChipText(feat.sent, { stale })}</Chip></p>}
      {feat.open && <ManifestPanel ctx={ctx} onClose={() => set({ open: false })} />}
      {feat.markOpen && last && <SentForm onSubmit={submit} onCancel={() => set({ markOpen: false })} />}
    </>
  );
}
