import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '../../utils/download.js';
import Icons from '../../components/Icons.jsx';
import FileDropZone from '../../components/FileDropZone.jsx';
import Banner from '../../components/Banner.jsx';
import { formatMonth, formatNumber } from '../../utils/format.js';
import { Button, Chip, EmptyState, InfoTip, KpiCard, pushToast } from '../ui-kit/index.js';
import { ID, DEFAULTS } from './meta.js';
import { STATUS_LABEL, alignMonths, compare, filterRows, rowsFromProcessed, summarize } from './compare.js';
import { baselineToJson, readPrevious, readPreviousTmt, readPreviousWorkbook } from './readPrevious.js';

export { ID, DEFAULTS };
const SHOW_MAX = 300;

const STATUS_TONE = { new: 'info', missing: 'warning', changed: 'neutral', same: 'success' };
const field = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-0 min-h-[44px]';
const monthValue = (m) => (m ? `${m.year}${String(m.month).padStart(2, '0')}` : '');
const parseValue = (v) => (v ? { year: Number(v.slice(0, 4)), month: Number(v.slice(4)) } : null);

/** Month options around the current round (12 back, 3 forward) plus any suggested candidates. */
const monthOptions = (curr, candidates) => {
  const list = new Map();
  const add = (m) => m && list.set(monthValue(m), m);
  if (curr) for (let o = -12; o <= 3; o++) add({ year: curr.year + Math.floor((curr.month - 1 + o) / 12), month: (((curr.month - 1 + o) % 12) + 12) % 12 + 1 });
  candidates.forEach((c) => add(c.value));
  return [...list.values()].sort((a, b) => monthValue(b).localeCompare(monthValue(a)));
};

const readBuffer = (file) => file.arrayBuffer();

export default function ComparePanel({ state, actions }) {
  const data = { ...DEFAULTS, ...(state.features?.[ID] || {}) };
  const set = (patch) => actions.setFeatureData(ID, patch);
  const { baseline, confirmedMonth } = data;
  const snapshot = state.features?.[ID]?.snapshot || null;
  const tpl = state.template?.kind === 'xlsx' ? state.template : null;
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const currMonth = state.productionMonth;
  const currRows = useMemo(() => rowsFromProcessed(state.processedData), [state.processedData]);
  const options = useMemo(() => monthOptions(currMonth, baseline?.monthCandidates || []), [currMonth, baseline]);

  const load = async (fn) => {
    setBusy(true);
    try {
      const b = await fn();
      set({ baseline: b, confirmedMonth: b.confidence === 'high' ? b.month : null, error: '' });
      if (b.warnings?.length) actions.setNotice(b.warnings.join('\n'));
    } catch (err) {
      set({ error: err.message || String(err) });
    } finally { setBusy(false); }
  };

  const onFiles = (files) => load(async () => {
    const tmt = files.filter((f) => /\.xls$/i.test(f.name));
    if (tmt.length === files.length && tmt.length > 1) {
      return readPreviousTmt(await Promise.all(tmt.map(async (f) => ({ name: f.name, buffer: await readBuffer(f) }))));
    }
    if (files.length > 1) throw new Error('เลือกได้หลายไฟล์เฉพาะไฟล์ TMT (.xls) ของรอบก่อน ส่วนสมุดผลลัพธ์ (.xlsx) หรือ baseline (.json) เลือกทีละไฟล์');
    return readPrevious(await readBuffer(files[0]), { name: files[0].name });
  });

  const align = useMemo(
    () => (baseline ? alignMonths(confirmedMonth, currMonth, { positional: data.positional }) : null),
    [baseline, confirmedMonth, currMonth, data.positional],
  );
  const ready = !!(baseline && align && align.pairs.length);
  const rows = useMemo(
    () => (ready ? compare(baseline.rows, currRows, align.shift, { level: data.level, currMonth }) : []),
    [ready, baseline, currRows, align, data.level, currMonth],
  );
  const summary = useMemo(() => summarize(rows, { shift: align?.mode === 'positional' ? null : align?.shift }), [rows, align]);
  const shown = useMemo(() => filterRows(rows, { pct: data.pct, minPcs: data.minPcs }), [rows, data.pct, data.minPcs]);
  const visible = showAll ? shown : shown.slice(0, SHOW_MAX);

  const exportBaseline = () => {
    const b = { rows: currRows, month: currMonth, label: `รอบ ${currMonth ? formatMonth(currMonth) : 'ปัจจุบัน'}` };
    downloadText(baselineToJson(b), `baseline_${currMonth ? monthValue(currMonth) : 'current'}.json`, 'application/json');
    pushToast({ message: 'ส่งออก baseline ของรอบนี้แล้ว ใช้เป็นข้อมูลรอบก่อนในรอบหน้าได้', tone: 'success' });
  };

  useEffect(() => { setShowAll(false); }, [baseline, data.level]);

  const sourceBtn = 'px-3 py-2 rounded-lg text-sm border bg-white border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]';

  return (
    <div className="space-y-4 min-w-0" data-testid="compare">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2"><span className="w-6 h-6 text-blue-600"><Icons.Compare /></span>เทียบรอบก่อน</h2>
        <Button variant="secondary" size="sm" Icon={Icons.Download} onClick={exportBaseline} data-testid="compare-export-baseline">ส่งออก baseline ของรอบนี้ (.json)</Button>
      </div>

      <Banner tone="error" message={data.error} onDismiss={() => set({ error: '' })} />

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" aria-label="ข้อมูลรอบก่อนมาจาก">
        <h3 className="font-semibold">ข้อมูลรอบก่อนมาจาก</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={sourceBtn} disabled={!snapshot || busy} onClick={() => load(async () => snapshot)} data-testid="compare-src-snapshot">
            รอบที่ประมวลผลก่อนหน้า{snapshot ? '' : ' (ยังไม่มี)'}
          </button>
          <button type="button" className={sourceBtn} disabled={!tpl || busy} onClick={() => load(() => readPreviousWorkbook(tpl.buffer, { label: `ข้อมูลเดิมในเทมเพลต (${state.template.name})`, source: 'template' }))} data-testid="compare-src-template">
            ข้อมูลเดิมในเทมเพลต{tpl ? '' : ' (ต้องเป็นเทมเพลต .xlsx)'}
          </button>
        </div>
        <FileDropZone
          accept=".xlsx,.xls,.json" multiple onFiles={onFiles} disabled={busy}
          className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center text-sm text-slate-500 hover:border-blue-400"
          activeClassName="border-blue-500 bg-blue-50"
        >
          <p data-testid="compare-drop">{busy ? 'กำลังอ่านไฟล์...' : 'ลากไฟล์รอบก่อนมาวาง หรือกดเพื่อเลือก'}</p>
          <p className="text-xs text-slate-400 mt-1">สมุดผลลัพธ์รอบก่อน (.xlsx) • ไฟล์ TMT (.xls) • baseline หรือไฟล์ส่งออก (.json) ข้อมูลอยู่ในเบราว์เซอร์เท่านั้น</p>
        </FileDropZone>
        {baseline && (
          <p className="text-sm text-slate-600" data-testid="compare-baseline-label">
            ใช้ <b>{baseline.label}</b> • {formatNumber(baseline.rows.length)} แถว
          </p>
        )}
      </section>

      {baseline && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" aria-label="เดือนของรอบก่อน">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">เดือนของรอบก่อน</span>
              <select
                className={field} data-testid="compare-month" value={monthValue(confirmedMonth)}
                onChange={(e) => set({ confirmedMonth: parseValue(e.target.value) })}
              >
                <option value="">— เลือกเพื่อยืนยัน —</option>
                {options.map((m) => (
                  <option key={monthValue(m)} value={monthValue(m)}>
                    {formatMonth(m)}{baseline.monthCandidates.some((c) => monthValue(c.value) === monthValue(m)) ? ' (ระบบเดามาจากไฟล์)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <InfoTip text="เดือนในสมุด Excel เดิม (Daily, By Plant) มักไม่ถูกอัปเดต จึงต้องให้คุณยืนยันเดือนก่อนเทียบทุกครั้ง" />
            {baseline.confidence === 'low' && !confirmedMonth && <Chip tone="warning">ต้องยืนยันเดือน</Chip>}
          </div>
          {baseline.monthCandidates.length > 0 && (
            <p className="text-xs text-slate-500">ที่เดาได้จากไฟล์: {baseline.monthCandidates.map((c) => `${formatMonth(c.value)} (${c.source})`).join(', ')}</p>
          )}
          <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={data.positional} onChange={(e) => set({ positional: e.target.checked })} data-testid="compare-positional" />
            <span>จับคู่ตามลำดับ N กับ N โดยไม่ดูปฏิทิน <Chip tone="warning">ไม่แนะนำ</Chip></span>
          </label>
        </section>
      )}

      {!baseline || (!confirmedMonth && !data.positional) ? (
        <div className="bg-white border border-slate-200 rounded-xl" data-testid="compare-empty">
          <EmptyState Icon={Icons.Compare} message={baseline ? 'ยังไม่ได้ยืนยันเดือนของรอบก่อน เลือกเดือนด้านบนเพื่อเริ่มเทียบ' : 'ยังไม่มีข้อมูลรอบก่อน เลือกแหล่งข้อมูลหรือวางไฟล์ด้านบน'} />
        </div>
      ) : (
        <>
          {align?.warning && <Banner tone="warning" message={align.warning} />}
          {align?.sentence && <p className="text-sm font-medium text-slate-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-testid="compare-sentence">{align.sentence}</p>}
          {ready && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="compare-kpis">
                <KpiCard label="เปลี่ยน" value={formatNumber(summary.changed)} />
                <KpiCard label="เพิ่มขึ้น" value={formatNumber(summary.increased)} />
                <KpiCard label="ลดลง" value={formatNumber(summary.decreased)} />
                <KpiCard label="ใหม่" value={formatNumber(summary.new)} />
                <KpiCard label="หายไป" value={formatNumber(summary.missing)} />
                <KpiCard label="Firm เปลี่ยน" value={summary.firmChanged === null ? '—' : formatNumber(summary.firmChanged)} delta={summary.firmChanged === null ? 'ใช้ได้เมื่อรอบก่อนเลื่อน 1 เดือน' : 'รอบก่อน N+1 vs รอบนี้ N'} />
              </div>
              <p className="text-sm text-slate-500">เหมือนเดิม {formatNumber(summary.same)} จาก {formatNumber(summary.keys)} รายการ</p>

              <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" aria-label="เกณฑ์">
                <div className="flex flex-wrap gap-x-6 gap-y-3 items-center">
                  <label className="flex items-center gap-2 text-sm">เปลี่ยนตั้งแต่ <b className="num w-10 text-right">{data.pct}%</b>
                    <input type="range" min="0" max="100" step="1" value={data.pct} onChange={(e) => set({ pct: Number(e.target.value) })} aria-label="เกณฑ์เปอร์เซ็นต์" data-testid="compare-pct" className="w-32 sm:w-40" />
                  </label>
                  <label className="flex items-center gap-2 text-sm">และอย่างน้อย <b className="num w-14 text-right">{data.minPcs} ชิ้น</b>
                    <input type="range" min="0" max="1000" step="10" value={data.minPcs} onChange={(e) => set({ minPcs: Number(e.target.value) })} aria-label="เกณฑ์จำนวนชิ้น" data-testid="compare-minpcs" className="w-32 sm:w-40" />
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={data.level === 'part'} onChange={(e) => set({ level: e.target.checked ? 'part' : 'dock' })} data-testid="compare-level" />
                    รวมระดับ part
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={data.exportCompare} onChange={(e) => set({ exportCompare: e.target.checked })} data-testid="compare-export" />
                    ส่งออกชีต "FC Compare"
                  </label>
                </div>
                <p className="text-xs text-slate-500">แถว "ใหม่" และ "หายไป" แสดงเสมอ • แถวที่เปลี่ยนต้องผ่านทั้งสองเกณฑ์ • เรียงตามผลต่างมากไปน้อย</p>
              </section>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm" data-testid="compare-table">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {['Part', 'Plant', 'Dock', 'เดือน', 'รอบก่อน', 'รอบนี้', 'ผลต่าง', '%', ''].map((h, i) => (
                        <th key={i} scope="col" className={`px-3 py-2 whitespace-nowrap ${i >= 4 && i <= 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, i) => (
                      <tr key={`${r.key}-${r.monthIdx}-${i}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.part}</td>
                        <td className="px-3 py-2">{r.plant}</td>
                        <td className="px-3 py-2">{r.dock || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.month}</td>
                        <td className="px-3 py-2 text-right num">{formatNumber(r.prev)}</td>
                        <td className="px-3 py-2 text-right num">{formatNumber(r.curr)}</td>
                        <td className={`px-3 py-2 text-right num font-medium ${r.diff > 0 ? 'text-emerald-700' : r.diff < 0 ? 'text-red-600' : ''}`}>{r.diff > 0 ? '+' : ''}{formatNumber(r.diff)}</td>
                        <td className="px-3 py-2 text-right num">{r.pct === null ? '—' : `${r.pct > 0 ? '+' : ''}${r.pct.toFixed(1)}%`}</td>
                        <td className="px-3 py-2">{(r.status === 'new' || r.status === 'missing') && <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>}</td>
                      </tr>
                    ))}
                    {!shown.length && (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-400" data-testid="compare-none">ไม่มีรายการที่ผ่านเกณฑ์ ลองลดเกณฑ์ด้านบน</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {shown.length > SHOW_MAX && !showAll && (
                <div className="text-center"><Button variant="secondary" size="sm" onClick={() => setShowAll(true)}>แสดงทั้งหมด ({formatNumber(shown.length)} แถว)</Button></div>
              )}
              <p className="text-xs text-slate-400">{formatNumber(shown.length)} แถวที่ผ่านเกณฑ์ จาก {formatNumber(rows.length)} แถวที่เทียบ</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
