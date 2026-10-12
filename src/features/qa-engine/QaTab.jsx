import { copyText } from '../../utils/clipboard.js';
import { useMemo, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import { PLANTS } from '../../constants.js';
import { Button, Chip, EmptyState, STRINGS, pushToast } from '../ui-kit/index.js';
import { formatMonth } from '../../utils/format.js';
import { FEATURE_ID, computeIssues } from './compute.js';
import { GROUPS, GROUP_LABEL, LEVELS, LEVEL_LABEL, countActive, filterIssues, locationOf, toCsv } from './model.js';
import { summaryText } from './report.js';
import { getWaiverStore } from './waivers.js';
import { listRules } from './engine.js';

const LEVEL_STYLE = {
  error: { chip: 'error', card: 'border-red-200 bg-red-50 text-red-700', ring: 'ring-red-300' },
  warning: { chip: 'warning', card: 'border-amber-200 bg-amber-50 text-amber-800', ring: 'ring-amber-300' },
  info: { chip: 'info', card: 'border-blue-200 bg-blue-50 text-blue-700', ring: 'ring-blue-300' },
};
const PAGE = 100;
const selectCls = 'px-3 py-2 min-h-[44px] border border-slate-200 rounded-lg text-sm bg-white';

// ==================== QA TAB ("ตรวจคุณภาพ") ====================
export default function QaTab({ state, actions }) {
  const [nonce, setNonce] = useState(0);
  const [filters, setFilters] = useState({ level: 'all', plant: 'all', group: 'all', status: 'active', query: '' });
  const [limit, setLimit] = useState(PAGE);
  const [waiving, setWaiving] = useState(null); // { index, reason, error }
  const data = state.features?.[FEATURE_ID] || {};

  // re-validates when processed data (incl. manual edits), files, template, settings or waivers change
  const issues = useMemo(
    () => computeIssues({ state }, { force: nonce > 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.processedData, state.sourceFiles, state.template, state.productionMonth, data.settings, data.waivers, state.profile, nonce],
  );
  const counts = useMemo(() => countActive(issues), [issues]);
  const waivedCount = issues.length - issues.filter((i) => !i.waived).length;
  const shown = useMemo(() => filterIssues(issues, filters), [issues, filters]);
  const visible = shown.slice(0, limit);
  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const pmLabel = state.productionMonth ? formatMonth(state.productionMonth) : '';
  const ruleTitle = useMemo(() => Object.fromEntries(listRules().map((r) => [r.id, r.title])), []);

  const goToRow = (i) => {
    actions.setFeatureData?.('preview', { query: i.partNumber || '', plant: PLANTS.includes(i.plant) ? i.plant : '' });
    actions.goTo?.('preview');
  };
  const removeFile = (i) => {
    const file = state.sourceFiles.find((f) => f.name === i.action?.payload?.name);
    if (file) actions.removeSourceFile?.(file.id);
  };
  const copySummary = async () => {
    try {
      const res = await copyText(summaryText(issues, { productionLabel: pmLabel }));
      if (!res.ok) throw new Error('copy failed');
      pushToast({ message: 'คัดลอกสรุปผลตรวจแล้ว', tone: 'success' });
    } catch {
      actions.setNotice?.('คัดลอกไม่ได้ในเบราว์เซอร์นี้ ใช้ปุ่ม “ดาวน์โหลด QA (.csv)” แทน');
    }
  };
  const downloadCsv = () => {
    try {
      const url = URL.createObjectURL(new Blob([toCsv(issues)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `QA_${pmLabel.replace(/'/g, '') || 'report'}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      actions.setNotice?.('สร้างไฟล์ CSV ไม่สำเร็จ ลองอีกครั้ง');
    }
  };
  const saveWaiver = (issue) => {
    const store = getWaiverStore();
    const res = store.waive({ issue, reason: waiving.reason, productionMonth: state.productionMonth, today: new Date() });
    if (!res.ok) { setWaiving((w) => ({ ...w, error: res.error })); return; }
    actions.setFeatureData?.(FEATURE_ID, { waivers: store.all() });
    actions.log?.({ action: 'qa', details: `รับทราบ ${issue.rule} ${issue.partNumber || issue.fileName}: ${res.record.reason}` });
    setWaiving(null);
    pushToast({ message: 'บันทึกการรับทราบแล้ว (ใช้เฉพาะเดือนผลิตนี้)', tone: 'success' });
  };
  const undoWaiver = (issue) => {
    const store = getWaiverStore();
    const key = Object.keys(store.all()).find((k) => k === `${issue.rule}|${[issue.scope, issue.plant, issue.scope === 'file' ? issue.fileName : '', issue.partNumber, issue.dockCode, issue.month].join(':')}|${state.productionMonth ? `${state.productionMonth.year}${String(state.productionMonth.month).padStart(2, '0')}` : ''}`);
    if (key) store.unwaive(key);
    actions.setFeatureData?.(FEATURE_ID, { waivers: store.all() });
  };

  if (!state.processedData) return <EmptyState Icon={Icons.Alert} message={STRINGS.empty.notProcessed} />;

  return (
    <div className="space-y-6" data-testid="qa-tab">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">ตรวจคุณภาพข้อมูล</h3>
            <p className="text-sm text-slate-500" data-testid="qa-summary">
              {counts.error} ต้องแก้ · {counts.warning} ควรดู · {counts.info} ข้อมูล
              {waivedCount > 0 && ` · รับทราบแล้ว ${waivedCount}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" Icon={Icons.Refresh} onClick={() => setNonce((n) => n + 1)} data-testid="qa-recheck">ตรวจอีกครั้ง</Button>
            <Button variant="secondary" size="sm" Icon={Icons.Share} onClick={copySummary}>คัดลอกสรุป</Button>
            <Button variant="secondary" size="sm" Icon={Icons.Download} onClick={downloadCsv}>ดาวน์โหลด QA (.csv)</Button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 min-h-[44px]">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={data.exportSheet ?? true}
            onChange={(e) => actions.setFeatureData?.(FEATURE_ID, { exportSheet: e.target.checked })}
          />
          แนบชีต “QA Report” ในไฟล์ Excel ที่ส่งออก (ปิดไว้เมื่อส่งไฟล์ให้ภายนอก)
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {LEVELS.map((lv) => (
          <button
            key={lv}
            type="button"
            aria-pressed={filters.level === lv}
            onClick={() => set({ level: filters.level === lv ? 'all' : lv })}
            data-testid={`qa-card-${lv}`}
            className={`text-left rounded-xl border p-3 sm:p-4 min-h-[44px] ${LEVEL_STYLE[lv].card} ${filters.level === lv ? `ring-2 ${LEVEL_STYLE[lv].ring}` : ''}`}
          >
            <p className="num text-2xl sm:text-3xl font-bold">{counts[lv]}</p>
            <p className="text-sm font-medium">{LEVEL_LABEL[lv]}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b bg-slate-50 flex flex-wrap items-center gap-2">
          <select aria-label="ระดับ" className={selectCls} value={filters.level} onChange={(e) => set({ level: e.target.value })}>
            <option value="all">ทุกระดับ</option>
            {LEVELS.map((lv) => <option key={lv} value={lv}>{LEVEL_LABEL[lv]}</option>)}
          </select>
          <select aria-label="โรงงาน" className={selectCls} value={filters.plant} onChange={(e) => set({ plant: e.target.value })}>
            <option value="all">ทุกโรงงาน</option>
            {PLANTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="กลุ่มกฎ" className={selectCls} value={filters.group} onChange={(e) => set({ group: e.target.value })}>
            <option value="all">ทุกกลุ่มกฎ</option>
            {GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
          </select>
          <select aria-label="สถานะ" className={selectCls} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="active">ยังไม่รับทราบ</option>
            <option value="waived">รับทราบแล้ว</option>
            <option value="all">ทั้งหมด (รวมรับทราบแล้ว)</option>
          </select>
          <input
            type="search"
            aria-label="ค้นหา"
            placeholder="ค้นหา Part Number / ไฟล์ / ข้อความ…"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            className="flex-1 min-w-[10rem] px-3 py-2 min-h-[44px] border border-slate-200 rounded-lg text-sm bg-white"
          />
          <span className="text-sm text-slate-500 num" aria-live="polite">{shown.length} / {issues.length}</span>
        </div>

        {shown.length === 0 ? (
          <EmptyState Icon={Icons.Check} message={issues.length ? 'ไม่มีรายการตรงกับตัวกรอง' : 'ไม่พบประเด็นด้านคุณภาพ ข้อมูลพร้อมส่งออก'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]" data-testid="qa-table">
              <thead className="bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">ระดับ</th>
                  <th className="px-3 py-2 font-semibold">กฎ</th>
                  <th className="px-3 py-2 font-semibold">ตำแหน่ง</th>
                  <th className="px-3 py-2 font-semibold">รายละเอียด</th>
                  <th className="px-3 py-2 font-semibold">วิธีแก้</th>
                  <th className="px-3 py-2 font-semibold">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i, idx) => (
                  <tr key={`${i.rule}-${idx}`} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2"><Chip tone={LEVEL_STYLE[i.level].chip}>{LEVEL_LABEL[i.level]}</Chip></td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className="font-mono text-xs">{i.rule}</span><br /><span className="text-xs text-slate-500">{ruleTitle[i.rule] || ''}</span></td>
                    <td className="px-3 py-2 text-slate-600">
                      {[i.plant, i.partNumber].filter(Boolean).join(' ')}
                      {i.partNumber ? <br /> : null}
                      <span className="text-xs text-slate-500">{locationOf(i) || i.fileName}</span>
                    </td>
                    <td className="px-3 py-2 max-w-md">
                      {i.message}
                      {i.waived && <p className="mt-1 text-xs text-emerald-700">รับทราบ: {i.reason}</p>}
                      {(i.expected !== null && i.actual !== null) && <p className="mt-1 text-xs text-slate-500 num">คาด {String(i.expected)} · จริง {String(i.actual)}</p>}
                    </td>
                    <td className="px-3 py-2 max-w-xs text-slate-600">{i.fix}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1 items-start">
                        {i.partNumber && <Button variant="ghost" size="sm" onClick={() => goToRow(i)}>ไปดูแถว</Button>}
                        {i.action?.kind === 'removeFile' && <Button variant="ghost" size="sm" onClick={() => removeFile(i)}>เอาไฟล์ออก</Button>}
                        {i.level !== 'error' && !i.waived && waiving?.index !== idx && <Button variant="ghost" size="sm" onClick={() => setWaiving({ index: idx, reason: '', error: '' })}>รับทราบ</Button>}
                        {i.waived && <Button variant="ghost" size="sm" onClick={() => undoWaiver(i)}>ยกเลิกรับทราบ</Button>}
                        {waiving?.index === idx && (
                          <div className="w-56 space-y-1">
                            <input
                              autoFocus
                              aria-label="เหตุผลที่รับทราบ"
                              placeholder="เหตุผล (อย่างน้อย 3 ตัวอักษร)"
                              value={waiving.reason}
                              onChange={(e) => setWaiving((w) => ({ ...w, reason: e.target.value, error: '' }))}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                            />
                            {waiving.error && <p className="text-xs text-red-600">{waiving.error}</p>}
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => saveWaiver(i)}>บันทึก</Button>
                              <Button variant="ghost" size="sm" onClick={() => setWaiving(null)}>{STRINGS.buttons.cancel}</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shown.length > limit && (
          <div className="p-3 text-center border-t border-slate-100">
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE)}>แสดงเพิ่ม ({shown.length - limit} รายการที่เหลือ)</Button>
          </div>
        )}
      </div>
    </div>
  );
}
