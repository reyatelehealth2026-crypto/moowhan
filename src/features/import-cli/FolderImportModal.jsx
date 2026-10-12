import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { Button } from '../ui-kit/index.js';
import { formatSize } from '../../utils/format.js';

const PLANT_ORDER = ['BP', 'BPK', 'GW', 'SR'];

function Section({ title, children }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      {children}
    </div>
  );
}

const Names = ({ items }) => (
  <ul className="text-sm text-slate-600 space-y-0.5">
    {items.map((e) => <li key={e.name} className="break-all">{e.name}{e.reason ? <span className="text-slate-400"> — {e.reason}</span> : null}</li>)}
  </ul>
);

/** Summary of planFolderImport(); "นำเข้า" loads the template + sources, then runs processAll once the state has them. */
export default function FolderImportModal({ plan, state, actions, onClose }) {
  const [stage, setStage] = useState('review'); // review | loading | processing
  const expected = plan.sources.length;
  const wantsTemplate = !!plan.template;

  useEffect(() => {
    if (stage !== 'loading') return;
    const ready = state.sourceFiles.length >= expected && (!wantsTemplate || !!state.template);
    if (!ready) return;
    setStage('processing');
    Promise.resolve(actions.processAll()).finally(onClose);
  }, [stage, state.sourceFiles.length, state.template]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStage('loading');
    if (plan.template) await actions.setTemplateFile(plan.template.file);
    await actions.addSourceFiles(plan.sources.map((s) => s.file));
  };

  const byPlant = PLANT_ORDER.map((p) => [p, plan.sources.filter((s) => s.name.toUpperCase().startsWith(p) && !(p === 'BP' && s.name.toUpperCase().startsWith('BPK')))]);
  const busy = stage !== 'review';

  return (
    <Modal onClose={busy ? undefined : onClose} label="เปิดโฟลเดอร์เดือนนี้" className="max-w-lg max-h-[90vh]">
      <div className="p-4 sm:p-6 overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">เปิดโฟลเดอร์เดือนนี้ <span className="text-xs font-normal text-amber-600">ทดลอง</span></h2>
        <p className="text-sm text-slate-500 mb-4">ไฟล์อยู่ในเครื่องนี้เท่านั้น ระบบอ่านจากโฟลเดอร์ที่คุณเลือก ไม่ส่งออกนอกเบราว์เซอร์</p>

        <Section title="เทมเพลต">
          {plan.template
            ? <p className="text-sm text-slate-600 break-all">{plan.template.name} <span className="text-slate-400">({formatSize(plan.template.size || 0)})</span></p>
            : <p className="text-sm text-amber-700">ไม่พบเทมเพลตที่มีชีต Analyze และ Daily ครบ — จะสร้างไฟล์ใหม่แบบค่าล้วน (ไม่รักษา pivot/สูตร)</p>}
        </Section>

        <Section title={`ไฟล์ต้นทาง ${plan.sources.length} ไฟล์`}>
          {plan.sources.length === 0
            ? <p className="text-sm text-red-600">ไม่พบไฟล์ที่ขึ้นต้นด้วย BP, BPK, GW หรือ SR ในโฟลเดอร์นี้</p>
            : <div className="grid grid-cols-2 gap-x-4 gap-y-2">{byPlant.filter(([, list]) => list.length).map(([p, list]) => (
              <div key={p}><div className="text-xs font-semibold text-slate-500">{p}</div><Names items={list} /></div>
            ))}</div>}
        </Section>

        {plan.previousOutput.length > 0 && (
          <Section title={`ผลลัพธ์รอบก่อนในโฟลเดอร์ ${plan.previousOutput.length} ไฟล์ (ไม่นำเข้า)`}><Names items={plan.previousOutput} /></Section>
        )}
        {plan.skipped.length > 0 && <Section title={`ข้าม ${plan.skipped.length} ไฟล์`}><Names items={plan.skipped} /></Section>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={start} disabled={busy || plan.sources.length === 0}>
            {stage === 'review' ? `นำเข้าและประมวลผล (${plan.sources.length} ไฟล์)` : 'กำลังประมวลผล...'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
