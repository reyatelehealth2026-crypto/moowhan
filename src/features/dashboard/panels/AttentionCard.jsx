// Counts QA findings if the qa-engine feature published any; otherwise only local facts from KPIs.
export const attentionItems = (state, kpis) => {
  const items = [];
  const findings = state.features?.['qa-engine']?.findings ?? state.qa?.findings;
  if (Array.isArray(findings) && findings.length) {
    const count = (lvl) => findings.filter((f) => f.level === lvl || f.severity === lvl).length;
    const b = count('block') || count('error');
    const w = findings.length - b;
    if (b) items.push({ tone: 'error', text: `ข้อผิดพลาดที่ต้องแก้ ${b} รายการ` });
    if (w) items.push({ tone: 'warning', text: `ข้อสังเกตที่ควรตรวจ ${w} รายการ` });
  }
  if (kpis.missingPlants.length) items.push({ tone: 'warning', text: `ยังไม่มีไฟล์ของโรงงาน ${kpis.missingPlants.join(', ')}` });
  if (!kpis.revisionConsistent) items.push({ tone: 'warning', text: 'ไฟล์แต่ละโรงงานมี Revision หรือ Issue date ไม่ตรงกัน ตรวจว่าใช้ไฟล์ชุดเดียวกัน' });
  return items;
};

export default function AttentionCard({ state, kpis }) {
  const items = attentionItems(state, kpis);
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-2 min-w-0">
      <h3 className="text-lg font-semibold">ควรตรวจสอบ</h3>
      {items.length === 0 ? <p className="text-sm text-emerald-700">ไม่พบสิ่งที่ต้องตรวจสอบเพิ่มเติม</p> : (
        <ul className="space-y-1.5 text-sm">
          {items.map((it) => (
            <li key={it.text} className={`rounded-lg px-3 py-2 ${it.tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{it.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
