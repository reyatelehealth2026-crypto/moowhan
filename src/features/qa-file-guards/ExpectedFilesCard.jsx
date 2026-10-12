import { useEffect, useMemo, useState } from 'react';
import { refreshPreviousFiles } from './deps.js';
import { expectedFilesChecklist } from './logic.js';

// "ไฟล์ที่คาดว่าจะได้รับ (อ้างอิงรอบก่อน)": one tick per plant + part type seen in the previous run.
// Renders nothing when there is no previous run to compare with.
export default function ExpectedFilesCard({ sourceFiles = [] }) {
  const [prev, setPrev] = useState([]);
  useEffect(() => {
    let alive = true;
    refreshPreviousFiles().then((list) => { if (alive) setPrev(list); });
    return () => { alive = false; };
  }, []);
  const items = useMemo(() => expectedFilesChecklist(prev, sourceFiles), [prev, sourceFiles]);
  if (!items.length) return null;
  return (
    <div data-testid="expected-files" className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
      <h3 className="text-sm font-semibold mb-3">ไฟล์ที่คาดว่าจะได้รับ (อ้างอิงรอบก่อน)</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.label} data-present={i.present} className={`px-2.5 py-1 rounded-lg text-sm ${i.present ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span aria-hidden="true">{i.present ? '✓' : '–'}</span> {i.label}
            <span className="sr-only">{i.present ? ' มีแล้ว' : ' ยังไม่มี'}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400 mt-2">ข้อมูลอ้างอิงเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</p>
    </div>
  );
}
