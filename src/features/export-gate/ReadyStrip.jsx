import Icons from '../../components/Icons.jsx';

// "พร้อมส่งออก" strip on the summary tab: พร้อมดาวน์โหลด / ต้องยืนยัน n / ติดขัด n.
const TONES = {
  ready: { box: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: Icons.Check, text: () => 'พร้อมดาวน์โหลด' },
  confirm: { box: 'bg-amber-50 border-amber-200 text-amber-900', Icon: Icons.Info, text: (g) => `ต้องยืนยัน ${g.confirm} รายการก่อนดาวน์โหลด` },
  blocked: { box: 'bg-red-50 border-red-200 text-red-800', Icon: Icons.Alert, text: (g) => `ติดขัด ${g.block} รายการ${g.confirm ? ` • ต้องยืนยัน ${g.confirm}` : ''}` },
};

export default function ReadyStrip({ gate, onDetails }) {
  if (!gate) return null;
  const t = TONES[gate.state] || TONES.ready;
  return (
    <div className={`border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 ${t.box}`} role="status" data-testid="export-ready" data-state={gate.state}>
      <span className="w-5 h-5 flex-shrink-0"><t.Icon /></span>
      <span className="flex-1 min-w-0 text-sm font-medium break-words">{t.text(gate)}</span>
      {gate.state !== 'ready' && onDetails && (
        <button type="button" onClick={onDetails} className="text-sm underline min-h-[44px] px-1">ดูรายละเอียด</button>
      )}
    </div>
  );
}
