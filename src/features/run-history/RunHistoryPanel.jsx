import { useEffect, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import Icons from '../../components/Icons.jsx';
import { Button, EmptyState, pushToast } from '../ui-kit/index.js';
import { formatDate, formatNumber } from '../../utils/format.js';
import { PLANTS } from '../../constants.js';
import { accuracy, EMPTY_MESSAGE, HORIZONS } from './accuracy.js';
import { buildTrend } from './trend.js';
import { exportRuns, runsFileName } from './logic.js';
import { runStore } from './store.js';
import TrendChart from './TrendChart.jsx';

const FEATURE_ID = 'run-history';
const pctText = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const cellText = (c, key) => (c ? pctText(c[key]) : '-');

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AccuracyTable({ runs, level }) {
  const acc = accuracy(runs, { level });
  if (acc.empty) return <EmptyState message={EMPTY_MESSAGE} className="py-4" />;
  return (
    <div className="overflow-x-auto" data-testid="accuracy-table">
      <table className="w-full text-xs sm:text-sm">
        <thead><tr className="text-left text-slate-500 border-b border-slate-200">
          <th className="py-1 pr-2">Horizon</th><th className="py-1 pr-2">โรงงาน</th><th className="py-1 pr-2 text-right">คู่ข้อมูล</th><th className="py-1 pr-2 text-right" title="ค่าเฉลี่ยของความคลาดเคลื่อนแบบมีเครื่องหมาย (+ = พยากรณ์สูงกว่าจริง)">Bias</th><th className="py-1 text-right" title="ค่าเฉลี่ยความคลาดเคลื่อนสัมบูรณ์">MAPE</th>
        </tr></thead>
        <tbody>
          {HORIZONS.flatMap((h) => [...PLANTS.map((p) => [p, acc.summary[h].byPlant[p]]), ['รวม', acc.summary[h].total]].map(([name, c]) => (
            <tr key={`${h}-${name}`} className="border-b border-slate-100">
              <td className="py-1 pr-2">N+{h}</td><td className="py-1 pr-2">{name}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{c ? c.count : '-'}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{cellText(c, 'bias')}</td>
              <td className="py-1 text-right tabular-nums">{c ? `${(c.mape * 100).toFixed(1)}%` : '-'}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

// "ประวัติการรัน" — section under the upload tab (uploadPanel slot); no tab of its own.
export default function RunHistoryPanel({ ctx }) {
  const snap = useSyncExternalStore(runStore.subscribe, runStore.snapshot);
  const { runs, prefs, ready } = snap;
  const [err, setErr] = useState('');
  const picker = useRef(null);
  const { actions, state } = ctx;

  useEffect(() => { runStore.refresh(); }, []);

  // copy the provenance "sent" sign-off onto the run that was exported with the same bytes
  const sent = state.features?.['provenance-manifest']?.sent;
  useEffect(() => {
    const latest = runs[0];
    if (sent && latest && !latest.sent && latest.export?.sha256 && latest.export.sha256 === sent.sha256) runStore.patchLatest({ sent: { at: sent.at, sha256: sent.sha256 } });
  }, [sent, runs]);

  if (!ready) return null;
  const shown = runs.slice(0, 6);
  const trend = buildTrend(runs, { months: 12 });
  const useBaseline = (run) => (actions.setFeatureState || actions.setFeatureData)?.('compare', { baseline: run });
  const onImport = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const res = await runStore.importJson(await f.text());
    if (res.ok) { setErr(''); pushToast({ message: `นำเข้าแล้ว (เพิ่มใหม่ ${res.added} รอบ)`, tone: 'success' }); } else setErr(res.error);
  };

  return (
    <section className="mt-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 print:hidden" data-testid="run-history" aria-labelledby="run-history-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="run-history-title" className="text-lg font-semibold flex items-center gap-2"><span className="w-5 h-5 text-slate-500"><Icons.History /></span>ประวัติการรัน</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!runs.length} onClick={() => download(exportRuns(runs), runsFileName())}>ส่งออก JSON</Button>
          <Button size="sm" variant="secondary" onClick={() => picker.current?.click()}>นำเข้า JSON</Button>
          <input ref={picker} type="file" accept=".json,application/json" className="hidden" data-testid="runs-import" onChange={onImport} />
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{err}</p>}

      {!shown.length ? (
        <p className="text-sm text-slate-500" data-testid="run-history-empty">ยังไม่มีประวัติ — ระบบจะบันทึกสรุปยอดทุกครั้งที่ประมวลผล (เก็บในเครื่องนี้ ไม่มีข้อมูลดิบ)</p>
      ) : (
        <ul className="divide-y divide-slate-100" data-testid="run-list">
          {shown.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="run-row">
              <span className="font-medium">{formatDate(r.createdAt, 'short')}</span>
              <span className="text-slate-600">เดือน {r.productionMonth}{r.revision ? ` · Rev ${r.revision}` : ''}</span>
              <span className="text-slate-600">{r.files.length} ไฟล์ · N {formatNumber(r.totals.n)}</span>
              {r.export?.fileName && <span className="text-slate-500 break-all">{r.export.fileName}</span>}
              {r.sent && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">ส่งแล้ว</span>}
              <span className="ml-auto flex gap-2">
                <span title={r.parts ? '' : 'ไม่มีข้อมูลราย Part (เปิดใน ตั้งค่า)'}>
                  <Button size="sm" variant="secondary" disabled={!r.parts} onClick={() => { useBaseline(r); pushToast({ message: 'ตั้งเป็นฐานเปรียบเทียบแล้ว', tone: 'success' }); }}>ใช้เป็นฐานเปรียบเทียบ</Button>
                </span>
                <Button size="sm" variant="ghost" onClick={() => runStore.remove(r.id)} aria-label={`ลบรอบ ${r.productionMonth}`}>ลบ</Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">แนวโน้ม</h3>
        <TrendChart trend={trend} />
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">ความแม่นยำ <span className="font-normal text-slate-500">(ค่า N+k ที่เคยพยากรณ์ เทียบกับ N จริง)</span></h3>
        <AccuracyTable runs={runs} level={prefs.tierB ? 'part' : 'plant'} />
      </div>

      <div className="space-y-1 border-t border-slate-100 pt-3">
        <label className="flex items-start gap-2 text-sm min-h-[44px] sm:min-h-0">
          <input type="checkbox" className="mt-1 w-4 h-4" checked={!!prefs.tierB} onChange={(e) => runStore.setPrefs({ tierB: e.target.checked })} data-testid="runs-tier-b" />
          <span>เก็บข้อมูลราย Part เพื่อเทียบรอบก่อน <span className="text-slate-500">(เก็บเฉพาะเลข Part/Dock และยอด N–N+3 ในเครื่องนี้ หมดอายุใน 90 วัน)</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm min-h-[44px] sm:min-h-0">
          <input type="checkbox" className="mt-1 w-4 h-4" checked={!!prefs.accuracySheet} onChange={(e) => runStore.setPrefs({ accuracySheet: e.target.checked })} data-testid="runs-accuracy-sheet" />
          <span>ใส่ชีต “FC Accuracy” ในไฟล์ที่ส่งออก <span className="text-slate-500">(ค่าล้วน ปิดไว้เป็นค่าเริ่มต้น)</span></span>
        </label>
      </div>
    </section>
  );
}
