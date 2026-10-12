import { useMemo, useState } from 'react';
import { PLANT_META } from '../constants.js';
import { formatDate } from '../utils/format.js';
import { STRINGS } from '../features/ui-kit/strings.js';

const ACTION_META = {
  error: { label: STRINGS.actions.error, cls: 'bg-red-100 text-red-700' },
  extracted: { label: STRINGS.actions.extracted, cls: 'bg-emerald-100 text-emerald-700' },
  warning: { label: STRINGS.actions.warning, cls: 'bg-amber-100 text-amber-700' },
  edit: { label: STRINGS.actions.edit, cls: 'bg-purple-100 text-purple-700' },
  export: { label: STRINGS.actions.export, cls: 'bg-blue-100 text-blue-700' },
  file: { label: STRINGS.actions.file, cls: 'bg-slate-100 text-slate-700' },
};

// ==================== CHANGELOG TAB ====================
export default function ChangelogTab({ state }) {
  const { changeLog } = state;
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return changeLog.filter((l) => (filter === 'all' || l.action === filter) && (!q || `${l.fileName} ${l.partNumber} ${l.details}`.toLowerCase().includes(q)));
  }, [changeLog, filter, searchTerm]);

  const actionsPresent = useMemo(() => [...new Set(changeLog.map((l) => l.action))], [changeLog]);

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-amber-800 text-sm">
          <span className="font-semibold">ประวัติการประมวลผล:</span> รายการที่เกิดขึ้นระหว่างการดึงข้อมูล แก้ไข และส่งออกไฟล์
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b bg-slate-50 flex flex-wrap justify-between items-center gap-3">
          <h3 className="font-semibold">รายการ ({rows.length} / {changeLog.length})</h3>
          <div className="flex items-center gap-3">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
              <option value="all">ทุกประเภท</option>
              {actionsPresent.map((a) => <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>)}
            </select>
            <input type="text" placeholder="ค้นหา..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-40" />
          </div>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b">
                <th className="text-left py-3 px-4">เวลา</th>
                <th className="text-left">ไฟล์</th>
                <th className="text-left">โรงงาน</th>
                <th className="text-left">Part Number</th>
                <th className="text-left">การดำเนินการ</th>
                <th className="text-left">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log, idx) => {
                const meta = ACTION_META[log.action] || { label: log.action, cls: 'bg-blue-100 text-blue-700' };
                return (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-500 text-xs whitespace-nowrap">{formatDate(log.timestamp, 'long')}</td>
                    <td className="py-3 text-slate-700 text-xs">{log.fileName || '-'}</td>
                    <td className="py-3">{log.plant ? <span className={`px-2 py-0.5 rounded text-xs ${PLANT_META[log.plant]?.badge || 'bg-gray-100 text-gray-700'}`}>{log.plant}</span> : '-'}</td>
                    <td className="py-3 font-mono text-xs text-blue-600">{log.partNumber || '-'}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>{meta.label}</span></td>
                    <td className="py-3 text-slate-600 text-xs">{log.details || '-'}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">ไม่พบรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
