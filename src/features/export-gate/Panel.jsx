import Icons from '../../components/Icons.jsx';
import { Button } from '../ui-kit/index.js';
import { KIND_LABEL } from './checklist.js';

// Post-export panel: what was written / skipped, the file check and the next steps (checklist.js items).
const KIND_STYLE = {
  written: { Icon: Icons.Check, color: 'text-emerald-600' },
  skipped: { Icon: Icons.Alert, color: 'text-amber-600' },
  warning: { Icon: Icons.Alert, color: 'text-amber-600' },
  check: { Icon: Icons.Check, color: 'text-blue-600' },
  info: { Icon: Icons.Info, color: 'text-slate-500' },
};
const ORDER = ['check', 'warning', 'skipped', 'written', 'info'];
const STATUS = { true: { t: 'ผ่าน', c: 'text-emerald-700' }, false: { t: 'ไม่ผ่าน', c: 'text-red-700 font-semibold' }, null: { t: 'ข้าม', c: 'text-slate-400' } };

export default function Panel({ items, verification, held, busy, onDownload }) {
  return (
    <div className="space-y-4" data-testid="export-result">
      {held && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-sm text-amber-900" role="alert">
          ตรวจไฟล์ก่อนดาวน์โหลดแล้วพบรายการที่ไม่ตรงกับข้อมูล จึงยังไม่ได้ดาวน์โหลด — ดูรายการด้านล่าง แล้วกด “ดาวน์โหลดต่อ” หากต้องการใช้ไฟล์นี้
        </div>
      )}
      {ORDER.map((kind) => {
        const list = items.filter((i) => i.kind === kind);
        if (!list.length) return null;
        const st = KIND_STYLE[kind];
        return (
          <section key={kind} aria-label={KIND_LABEL[kind]}>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">{KIND_LABEL[kind]}</h3>
            <ul className="space-y-1">
              {list.map((i, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-slate-700">
                  <span className={`w-4 h-4 mt-0.5 flex-shrink-0 ${i.ok === false ? 'text-red-500' : st.color}`}><st.Icon /></span>
                  <span className="min-w-0 break-words">{i.text}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {verification?.checks?.length > 0 && (
        <details className="border border-slate-200 rounded-lg">
          <summary className="px-3 py-2 text-sm font-medium text-slate-700 cursor-pointer min-h-[44px] flex items-center">รายละเอียดการตรวจไฟล์ ({verification.checks.length} รายการ)</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-1.5">ตรวจ</th><th className="text-right px-3 py-1.5">ควรเป็น</th><th className="text-right px-3 py-1.5">พบ</th><th className="px-3 py-1.5">ผล</th></tr></thead>
              <tbody>
                {verification.checks.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5"><span className="font-mono text-slate-400 mr-1">{c.id}</span>{c.label}</td>
                    <td className="px-3 py-1.5 text-right num">{c.expected ?? '-'}</td>
                    <td className="px-3 py-1.5 text-right num">{c.actual ?? '-'}</td>
                    <td className={`px-3 py-1.5 text-center whitespace-nowrap ${STATUS[c.ok].c}`}>{STATUS[c.ok].t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <Button variant={held ? 'primary' : 'secondary'} onClick={onDownload} loading={busy} Icon={Icons.Download} data-testid="export-redownload">
        {held ? 'ดาวน์โหลดต่อ' : 'ดาวน์โหลดอีกครั้ง'}
      </Button>
    </div>
  );
}
