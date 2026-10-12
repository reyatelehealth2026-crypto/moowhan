import { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../../utils/format.js';
import { rowsFromProcessed } from './compare.js';
import { readPreviousWorkbook } from './readPrevious.js';
import { rowKey, tagRows } from './tagRows.js';

// Preview overwrite: what exporting would do to the Daily sheets already inside the template.
// Not a forecast comparison (that is the "เทียบรอบก่อน" tab).

const RANK = { changed: 3, new: 2, unchanged: 1 };

/** Reads the template's Daily sheets once (when switched on) and tags every sheet of `data` against them. */
export function useTemplateDiff(template, enabled, data) {
  const [base, setBase] = useState({ buffer: null, baseline: null, error: '' });
  const usable = template?.kind === 'xlsx';

  useEffect(() => {
    if (!enabled || !usable || base.buffer === template.buffer) return undefined;
    let alive = true;
    readPreviousWorkbook(template.buffer, { label: 'เทมเพลต', source: 'template' })
      .then((baseline) => alive && setBase({ buffer: template.buffer, baseline, error: '' }))
      .catch((err) => alive && setBase({ buffer: template.buffer, baseline: null, error: err.message }));
    return () => { alive = false; };
  }, [enabled, usable, template, base.buffer]);

  return useMemo(() => {
    if (!enabled || !usable) return null;
    if (base.buffer !== template.buffer) return { status: 'loading', bySheet: {} };
    if (!base.baseline) return { status: 'error', error: base.error, bySheet: {} };
    const current = rowsFromProcessed(data);
    const bySheet = {};
    ['BP', 'BPK', 'GW', 'SR'].forEach((plant) => {
      const t = tagRows(base.baseline.rows.filter((r) => r.plant === plant), current.filter((r) => r.plant === plant));
      const tags = new Map();
      t.rows.forEach((r) => {
        const k = rowKey(r);
        if (!tags.has(k) || RANK[r.tag] > RANK[tags.get(k)]) tags.set(k, r.tag);
      });
      bySheet[`${plant} Daily`] = { tags, removed: t.removed, counts: t.counts };
    });
    return { status: 'ready', bySheet };
  }, [enabled, usable, template, base, data]);
}

export const TAG_LABEL = { new: 'ใหม่', changed: 'เปลี่ยนค่า' };
export const TAG_CLASS = { new: 'bg-emerald-50', changed: 'bg-amber-50' };

/** Toggle shown in the preview toolbar. */
export function PreviewDiffToggle({ checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600" data-testid="preview-diff-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      เทียบกับชีตในเทมเพลต
    </label>
  );
}

/** Summary strip + the list of template rows that would disappear. */
export function PreviewDiffBar({ diff, sheet }) {
  const info = diff?.bySheet?.[sheet];
  if (!diff) return null;
  if (diff.status === 'loading') return <div className="px-4 py-2 text-sm text-slate-500 bg-slate-50 border-b border-slate-200">กำลังอ่านชีตในเทมเพลต...</div>;
  if (diff.status === 'error') return <div role="alert" className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">{diff.error}</div>;
  if (!info) return <div className="px-4 py-2 text-sm text-slate-500 bg-slate-50 border-b border-slate-200">ชีตนี้ไม่ได้ถูกเขียนทับในเทมเพลต</div>;
  const { counts, removed } = info;
  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-sm space-y-1" data-testid="preview-diff-bar">
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 align-middle mr-1" />ใหม่ <b className="num">{formatNumber(counts.new)}</b></span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-200 align-middle mr-1" />เปลี่ยนค่า <b className="num">{formatNumber(counts.changed)}</b></span>
        <span>เท่าเดิม <b className="num">{formatNumber(counts.unchanged)}</b></span>
        <span className="text-red-700">จะถูกลบออกจากชีต <b className="num" data-testid="preview-diff-removed">{formatNumber(counts.removed)}</b> แถว</span>
      </p>
      <p className="text-xs text-slate-500">นี่คือการเทียบกับข้อมูลที่อยู่ในชีตตอนนี้ว่าจะถูกเขียนทับอย่างไร ไม่ใช่การเทียบ forecast รอบก่อน (ดูที่แท็บ "เทียบรอบก่อน")</p>
      {removed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-red-700 min-h-[32px]">ดูแถวที่จะถูกลบ ({removed.length})</summary>
          <ul className="mt-1 max-h-32 overflow-auto text-xs font-mono space-y-0.5">
            {removed.map((r, i) => <li key={i}>{r.part} • {r.dock || '—'} • N {formatNumber(r.n)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
