import { useMemo, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { PLANTS } from '../../constants.js';
import { formatDate, formatNumber } from '../../utils/format.js';
import { Chip, EmptyState, KpiCard, STRINGS, pushToast } from '../ui-kit/index.js';
import { computeIssues } from '../qa-engine/compute.js';
import { getWaiverStore, waiverKey } from '../qa-engine/waivers.js';
import { noteKey } from '../manual-edit/notes.js';
import { STATUS_LABEL, isRunout } from './classify.js';
import { ID, notesByKey, slotOf } from './meta.js';
import { RULE_ID } from './rules.js';
import { buildRunoutRows, signalRows, withOverride } from './rows.js';

const selectCls = 'px-3 py-2 min-h-[44px] border border-slate-200 rounded-lg text-sm bg-white';
const TONE = { 'runout-n1': 'error', 'runout-n2': 'warning', 'runout-n3': 'warning', new: 'info', gap: 'info', normal: 'success', zero: 'neutral' };

export { ID, slotOf, notesByKey };

export default function RunoutView({ state, actions }) {
  const [status, setStatus] = useState('signal'); // signal | all | <status>
  const [plant, setPlant] = useState('all');
  const [query, setQuery] = useState('');
  const [ack, setAck] = useState(null); // { key, reason, error }

  const ctx = { state, actions };
  const slot = slotOf(state);
  const overrides = slot.overrides || {};
  const notes = useMemo(() => notesByKey(state), [state.features?.['manual-edit']?.notes]);
  const rows = useMemo(
    () => buildRunoutRows(state.processedData, state.productionMonth, overrides, notes),
    [state.processedData, state.productionMonth, overrides, notes],
  );
  // B01 findings come from the qa-engine run (waived state included); the table count below is the same list
  const findings = useMemo(() => computeIssues(ctx).filter((i) => i.rule === RULE_ID),
    [state.processedData, state.sourceFiles, state.productionMonth, state.features?.['qa-engine']?.waivers, state.features?.['qa-engine']?.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const findingOf = useMemo(() => new Map(findings.map((f) => [`${f.plant}|${f.partNumber}|${f.dockCode}`, f])), [findings]);

  const signals = useMemo(() => signalRows(rows), [rows]);
  const shown = rows.filter((r) =>
    (status === 'all' ? true : status === 'signal' ? r.signal : r.status === status)
    && (plant === 'all' || r.plant === plant)
    && (!query || `${r.partNumber} ${r.partCode} ${r.dockCode}`.toLowerCase().includes(query.toLowerCase())));
  const runoutCount = signals.filter((r) => isRunout(r.status)).length;

  if (!state.processedData) return <EmptyState Icon={Icons.Alert} message={STRINGS.empty.notProcessed} />;

  const setOfficial = (r, date) => {
    const next = withOverride(overrides, r.key, date);
    actions.setProfile?.({ features: { [ID]: { ...slot, overrides: next } } });
  };
  const setNote = (r, text) => {
    const key = noteKey(r.key);
    const month = state.productionMonth ? `${state.productionMonth.year}${String(state.productionMonth.month).padStart(2, '0')}` : '';
    actions.setFeatureData?.('manual-edit', (cur) => {
      const others = (cur?.notes || []).filter((n) => !(n.key === key && n.source === ID));
      const t = String(text || '').trim();
      return { notes: t ? [...others, { id: `note-${ID}-${r.key}`, month, key, text: t.slice(0, 500), source: ID }] : others };
    });
  };
  const ownNote = (r) => (state.features?.['manual-edit']?.notes || []).find((n) => n.key === noteKey(r.key) && n.source === ID)?.text || '';

  const saveAck = (r) => {
    const issue = findingOf.get(r.key);
    if (!issue) { setAck((a) => ({ ...a, error: 'ไม่พบรายการสัญญาณนี้ใน QA (กฎ B01 อาจถูกปิดในตั้งค่า)' })); return; }
    const store = getWaiverStore();
    const res = store.waive({ issue, reason: ack.reason, productionMonth: state.productionMonth, today: new Date() });
    if (!res.ok) { setAck((a) => ({ ...a, error: res.error })); return; }
    actions.setFeatureData?.('qa-engine', { waivers: store.all() });
    setAck(null);
    pushToast({ message: 'บันทึกการรับทราบแล้ว (ใช้เฉพาะเดือนผลิตนี้)', tone: 'success' });
  };
  const undoAck = (r) => {
    const issue = findingOf.get(r.key);
    if (!issue) return;
    const store = getWaiverStore();
    store.unwaive(waiverKey(issue, state.productionMonth));
    actions.setFeatureData?.('qa-engine', { waivers: store.all() });
  };

  return (
    <div className="space-y-4 min-w-0" data-testid="runout-view">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold">สัญญาณ Run-out จาก forecast</h3>
        <p className="text-sm text-slate-500 mt-1">
          อ่านจากแผน N..N+3 ในไฟล์ TMT เท่านั้น เป็น <strong>สัญญาณ</strong> ว่า forecast กำลังหมด ไม่ใช่ยอดสต็อกคงเหลือ
          ควรยืนยันวันส่งสุดท้ายกับ TMT ก่อนตัดสินใจสั่งของ
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 min-h-[44px]">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={!!slot.includeInExport}
            onChange={(e) => actions.setProfile?.({ features: { [ID]: { ...slot, includeInExport: e.target.checked } } })}
            data-testid="runout-export"
          />
          แนบชีต “Runout” ในไฟล์ Excel ที่ส่งออก (ปิดไว้เมื่อส่งไฟล์ให้ภายนอก)
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
          <KpiCard label="สัญญาณทั้งหมด" value={<span data-testid="runout-count">{signals.length}</span>} />
          <KpiCard label="สัญญาณ Run-out" value={runoutCount} />
          <KpiCard label="รายการใหม่" value={signals.filter((r) => r.status === 'new').length} />
          <KpiCard label="ขาดช่วง" value={signals.filter((r) => r.status === 'gap').length} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b bg-slate-50 flex flex-wrap items-center gap-2">
          <select aria-label="สถานะ" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="signal">เฉพาะสัญญาณ</option>
            <option value="all">ทุกสถานะ</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="โรงงาน" className={selectCls} value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="all">ทุกโรงงาน</option>
            {PLANTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            type="search"
            aria-label="ค้นหา"
            placeholder="ค้นหา Part / Dock…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[8rem] px-3 py-2 min-h-[44px] border border-slate-200 rounded-lg text-sm bg-white"
          />
          <span className="text-sm text-slate-500 num" aria-live="polite">{shown.length} / {rows.length}</span>
        </div>

        {shown.length === 0 ? (
          <EmptyState Icon={Icons.Check} message={signals.length ? 'ไม่มีรายการตรงกับตัวกรอง' : 'ไม่พบสัญญาณ Run-out ใน forecast ชุดนี้'} />
        ) : (
          <div className="overflow-x-auto" data-testid="runout-scroll">
            <table className="w-full text-sm min-w-[980px]" data-testid="runout-table">
              <thead className="bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">สถานะ</th>
                  <th className="px-3 py-2 font-semibold">โรงงาน</th>
                  <th className="px-3 py-2 font-semibold">Dock</th>
                  <th className="px-3 py-2 font-semibold">Part</th>
                  <th className="px-3 py-2 font-semibold">Last Pack (ประมาณ)</th>
                  <th className="px-3 py-2 font-semibold">Last Pack (ทางการ)</th>
                  <th className="px-3 py-2 font-semibold text-right">N</th>
                  <th className="px-3 py-2 font-semibold text-right">N+1</th>
                  <th className="px-3 py-2 font-semibold text-right">N+2</th>
                  <th className="px-3 py-2 font-semibold text-right">N+3</th>
                  <th className="px-3 py-2 font-semibold">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const f = findingOf.get(r.key);
                  const mine = ownNote(r);
                  const others = r.notes.filter((t) => t !== mine);
                  return (
                    <tr key={r.key} className="border-t border-slate-100 align-top" data-testid="runout-row" data-status={r.status}>
                      <td className="px-3 py-2">
                        <Chip tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
                        {r.continues && <p className="text-xs text-slate-500 mt-1">ยังมี forecast ต่อ</p>}
                        {f?.waived && <p className="text-xs text-emerald-700 mt-1">รับทราบ: {f.reason}</p>}
                        {r.signal && f && !f.waived && ack?.key !== r.key && (
                          <button type="button" className="text-xs text-blue-700 underline min-h-[44px]" onClick={() => setAck({ key: r.key, reason: '', error: '' })}>รับทราบ</button>
                        )}
                        {f?.waived && <button type="button" className="text-xs text-slate-600 underline min-h-[44px]" onClick={() => undoAck(r)}>ยกเลิกรับทราบ</button>}
                        {ack?.key === r.key && (
                          <div className="w-48 space-y-1 mt-1">
                            <input
                              aria-label="เหตุผลที่รับทราบ"
                              className="w-full px-2 py-1 min-h-[44px] border border-slate-300 rounded text-sm"
                              placeholder="เหตุผล (อย่างน้อย 3 ตัวอักษร)"
                              value={ack.reason}
                              onChange={(e) => setAck({ ...ack, reason: e.target.value, error: '' })}
                            />
                            {ack.error && <p className="text-xs text-red-700">{ack.error}</p>}
                            <div className="flex gap-2">
                              <button type="button" className="text-xs text-blue-700 underline min-h-[44px]" onClick={() => saveAck(r)}>บันทึก</button>
                              <button type="button" className="text-xs text-slate-600 underline min-h-[44px]" onClick={() => setAck(null)}>ยกเลิก</button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.plant}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.dockCode || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.partNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap num">{r.lastPackEstimated ? formatDate(r.lastPackEstimated, 'short') : '-'}</td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          aria-label={`Last Pack ทางการ ${r.partNumber} ${r.plant}`}
                          className="px-2 py-1 min-h-[44px] border border-slate-200 rounded-lg text-sm bg-white"
                          value={r.lastPackOfficial}
                          onChange={(e) => setOfficial(r, e.target.value)}
                          data-testid="runout-official"
                        />
                        <p className="text-xs text-slate-500 mt-0.5">{r.lastPackOfficial ? `แก้เมื่อ ${r.officialEditedAt ? formatDate(r.officialEditedAt, 'short') : '-'}` : 'ว่าง = ใช้ค่าประมาณ'}</p>
                      </td>
                      <td className="px-3 py-2 text-right num">{formatNumber(r.n)}</td>
                      <td className="px-3 py-2 text-right num">{formatNumber(r.n1)}</td>
                      <td className="px-3 py-2 text-right num">{formatNumber(r.n2)}</td>
                      <td className="px-3 py-2 text-right num">{formatNumber(r.n3)}</td>
                      <td className="px-3 py-2">
                        <input
                          key={`${r.key}-${mine}`}
                          aria-label={`หมายเหตุ ${r.partNumber} ${r.plant}`}
                          className="w-48 px-2 py-1 min-h-[44px] border border-slate-200 rounded-lg text-sm"
                          defaultValue={mine}
                          maxLength={500}
                          onBlur={(e) => { if (e.target.value.trim() !== mine) setNote(r, e.target.value); }}
                        />
                        {others.map((t, i) => <p key={i} className="text-xs text-slate-500 mt-0.5">{t}</p>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
