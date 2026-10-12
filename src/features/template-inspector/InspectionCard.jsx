import { useState } from 'react';
import Icons from '../../components/Icons.jsx';

const LEVEL_RANK = { error: 3, warning: 2, info: 1 };
const LEVEL_STYLE = {
  error: { text: 'text-red-600', chip: 'bg-red-100 text-red-700', mark: '✕', label: 'ต้องแก้' },
  warning: { text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700', mark: '⚠', label: 'ควรตรวจ' },
  info: { text: 'text-blue-600', chip: 'bg-blue-100 text-blue-700', mark: 'ℹ', label: 'แจ้งให้ทราบ' },
};
const ROLE_LABEL = { daily: 'Daily', analyze: 'Analyze', other: 'อื่น ๆ' };

const worstLevel = (issues) => issues.reduce((w, i) => (LEVEL_RANK[i.level] > (LEVEL_RANK[w] ?? 0) ? i.level : w), null);

const capacityText = (s) => {
  if (s.role === 'other') return '—';
  if (s.capacity === null) return 'ไม่ทราบ';
  const src = s.capacitySource === 'autoFilter' ? `AutoFilter ถึงแถว ${s.dataStartRow + s.capacity - 1}` : s.firstFormulaRowBelowData ? `สูตรเริ่มแถว ${s.firstFormulaRowBelowData}` : '';
  return `${s.capacity} แถว${src ? ` (${src})` : ''}`;
};

// ==================== TEMPLATE INSPECTION CARD ====================
// Shows what inspectTemplate() found. Informational only: it never disables the download button.
export default function InspectionCard({ inspection }) {
  const [open, setOpen] = useState(true);
  if (!inspection) return null;

  const { sheets, issues, analyze, generator, templateMonth, pivots } = inspection;
  const worst = worstLevel(issues);
  const counts = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { counts[i.level] = (counts[i.level] ?? 0) + 1; });
  const summary = sheets.length
    ? `เทมเพลต: ${sheets.length} ชีต • เดือน ${templateMonth ?? '—'} • Analyze รองรับ ${analyze?.capacity ?? '—'} แถว`
    : 'เทมเพลต: ตรวจไม่ได้';
  const app = generator?.application ? `${generator.application}${generator.version ? ` ${generator.version}` : ''}` : null;

  return (
    <section data-testid="template-inspection" className="mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 text-left p-4 sm:p-5"
      >
        <span className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500"><Icons.Template /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">ผลตรวจเทมเพลต</span>
          <span className="block text-sm text-slate-500 break-words">{summary}</span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5 flex-shrink-0">
          {worst ? ['error', 'warning', 'info'].filter((l) => counts[l]).map((l) => (
            <span key={l} className={`px-2 py-0.5 rounded-lg text-xs font-medium ${LEVEL_STYLE[l].chip}`}>{LEVEL_STYLE[l].mark} {counts[l]}</span>
          )) : <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700">✓ ปกติ</span>}
          <span className="w-4 h-4 text-slate-400">{open ? <Icons.ChevronUp /> : <Icons.ChevronDown />}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4">
          <p className="text-xs text-slate-500 break-words">
            {app ? `บันทึกโดย ${app}` : 'ไม่ทราบโปรแกรมที่บันทึกไฟล์'}
            {pivots && ` • Pivot ${pivots.tables.length} ตาราง (${pivots.caches.length} cache)`}
            {inspection.kind && inspection.kind !== 'xlsx' && ` • รูปแบบ .${inspection.kind}`}
            {' • การตรวจนี้เป็นข้อมูลประกอบ ไม่ได้ปิดปุ่มดาวน์โหลด'}
          </p>

          {sheets.length > 0 && (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">ชีต</th>
                    <th className="text-right font-medium px-3 py-2">แถวหัว</th>
                    <th className="text-right font-medium px-3 py-2">เริ่มข้อมูล</th>
                    <th className="text-left font-medium px-3 py-2">ความจุ</th>
                    <th className="text-left font-medium px-3 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => {
                    const level = worstLevel(issues.filter((i) => i.sheet === s.name));
                    return (
                      <tr key={s.name} data-testid="inspection-sheet-row" className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <span className="font-medium break-words">{s.name}</span>
                          <span className="ml-2 text-xs text-slate-400">{ROLE_LABEL[s.role]}</span>
                          {s.hidden && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-xs">ซ่อน</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.headerRow ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.dataStartRow ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{capacityText(s)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {level ? (
                            <span className={`inline-flex items-center gap-1 ${LEVEL_STYLE[level].text}`}>
                              <span className="w-4 h-4"><Icons.Alert /></span>{LEVEL_STYLE[level].label}
                            </span>
                          ) : s.role === 'other' ? <span className="text-slate-400">ไม่เกี่ยวข้อง</span> : (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <span className="w-4 h-4"><Icons.Check /></span>พร้อม
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {issues.length > 0 && (
            <ul className="space-y-2" aria-label="รายการที่พบ">
              {issues.map((i, idx) => (
                <li key={`${i.code}-${i.sheet ?? ''}-${idx}`} className="text-sm rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className={`font-medium break-words ${LEVEL_STYLE[i.level].text}`}>{LEVEL_STYLE[i.level].mark} {i.message}</p>
                  {i.fix && <p className="text-slate-600 mt-1 break-words"><span className="font-medium">วิธีแก้:</span> {i.fix}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
