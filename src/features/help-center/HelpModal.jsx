import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Modal from '../../components/Modal.jsx';
import Icons from '../../components/Icons.jsx';
import { listHotkeys } from '../ui-kit/hotkeys.js';
import { pushToast } from '../ui-kit/index.js';
import { copyText } from '../../utils/clipboard.js';
import { downloadText } from '../../utils/download.js';
import { GLOSSARY, GROUP_LABELS, renderWritePlanSummary, searchGlossary } from './glossary.js';
import { getSnapshot, subscribe, closeHelp, openDiagnostics } from './helpStore.js';
import { parseChangelog } from './changelog.js';
import { buildDiagnostics, diagnosticsFileName, sha256Hex } from '../../lib/diagnostics.js';
import changelogRaw from '../../../CHANGELOG.md?raw';

const FAQ = [
  ['ข้อมูลของฉันถูกส่งไปที่ไหนหรือไม่?', 'ไฟล์ไม่ออกจากเครื่อง ทุกอย่างประมวลผลในเบราว์เซอร์ของคุณเท่านั้น'],
  ['ทำไมแท็บบางแท็บเป็นสีเทา?', 'ต้องอัปโหลดและกด “รวมข้อมูลและคำนวณ” ก่อน แท็บจึงจะใช้งานได้'],
  ['ไฟล์ของฉันขึ้น “ไม่พบแถวข้อมูล”', 'ตรวจว่าไฟล์มีแถวหัวตาราง PART NUMBER และมีข้อมูลต่อจากนั้น ไฟล์นี้ยังส่งออกได้แต่จะไม่มียอดของไฟล์นั้น'],
  ['ชื่อไฟล์ต้องตั้งอย่างไร?', 'ชื่อไฟล์ต้องขึ้นต้น BP/BPK/GW/SR เช่น “BPK packing 481D.xls”'],
  ['ทำไม pivot ใน Excel ยังไม่อัปเดต?', 'แอปเขียนเฉพาะชีท Daily และ Analyze เปิดไฟล์แล้วกด Refresh All ใน Excel'],
];
const STEPS = [
  'อัปโหลดเทมเพลต (template.xlsx) เป็นไฟล์หลัก — ไม่บังคับ',
  'ลากไฟล์พยากรณ์ของแต่ละโรงงาน (BP, BPK, GW, SR) มาวาง',
  'กด “รวมข้อมูลและคำนวณ” (Ctrl+Enter)',
  'ตรวจข้อมูลในแท็บต่างๆ แก้ไขหรือดูสรุป',
  'ดาวน์โหลดไฟล์ Excel (Ctrl+S) แล้ว Refresh Pivot ใน Excel',
];
const BASE_KEYS = [['Ctrl + Enter', 'รวมข้อมูลและคำนวณ'], ['Ctrl + S', 'ดาวน์โหลด Excel'], ['/', 'ไปที่ช่องค้นหา'], ['Esc', 'ปิดหน้าต่าง / ล้างคำค้นหา'], ['?', 'เปิดศูนย์ช่วยเหลือ (นอกช่องกรอก)']];

const SECTIONS = [
  ['steps', 'ขั้นตอนการใช้งาน'], ['glossary', 'คำศัพท์'], ['plants', 'โรงงานและไฟล์'], ['writes', 'สิ่งที่แอปเขียน/ไม่เขียน'],
  ['faq', 'คำถามที่พบบ่อย'], ['template', 'เมื่อบริษัทแก้ template.xlsx'], ['shortcuts', 'คีย์ลัด'], ['whatsnew', 'มีอะไรใหม่'],
];

function Section({ id, title, open, onToggle, children }) {
  return (
    <section id={`help-${id}`} className="border border-slate-200 rounded-xl overflow-hidden">
      <h3>
        <button type="button" aria-expanded={open} onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-4 py-3 min-h-[44px] bg-slate-50 hover:bg-slate-100 text-left font-semibold text-slate-800">
          {title}<span className="w-4 h-4 flex-shrink-0">{open ? <Icons.ChevronUp /> : <Icons.ChevronDown />}</span>
        </button>
      </h3>
      {open && <div className="px-4 py-3 text-sm text-slate-700 space-y-2">{children}</div>}
    </section>
  );
}

function GlossaryList() {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchGlossary(q), [q]);
  const groups = Object.keys(GROUP_LABELS).map((g) => [g, list.filter((e) => e.group === g)]).filter(([, l]) => l.length);
  return (
    <>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาคำศัพท์…" aria-label="ค้นหาคำศัพท์" className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
      {!groups.length && <p className="text-slate-400">ไม่พบคำศัพท์</p>}
      {groups.map(([g, l]) => (
        <div key={g}>
          <h4 className="text-xs font-semibold text-slate-500 mt-2 mb-1">{GROUP_LABELS[g]}</h4>
          <dl className="space-y-2">
            {l.map((e) => (
              <div key={e.key} id={`help-glossary-${e.key}`} tabIndex={-1} className="outline-none focus:ring-2 focus:ring-blue-300 rounded">
                <dt className="font-semibold break-words">{e.term}{e.source === 'team' && <span className="ml-2 text-[10px] font-normal text-amber-600">ตามทีมงาน</span>}</dt>
                <dd className="text-slate-600 break-words">{e.th}{e.example && <span className="text-slate-400"> • เช่น {e.example}</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

function Diagnostics({ ctx, onClose }) {
  const [sha, setSha] = useState('n/a');
  useEffect(() => {
    let live = true;
    const buf = ctx.state.template?.buffer;
    if (buf) sha256Hex(buf).then((h) => live && setSha(h));
    return () => { live = false; };
  }, [ctx.state.template]);
  const json = useMemo(() => JSON.stringify(buildDiagnostics(ctx.state, {
    sha256: sha,
    env: { userAgent: navigator.userAgent, language: navigator.language, viewport: `${window.innerWidth}x${window.innerHeight}` },
  }), null, 2), [ctx.state, sha]);
  const copy = async () => {
    const { ok } = await copyText(json);
    if (ok) pushToast({ message: 'คัดลอกรายงานแล้ว', tone: 'success' });
    else pushToast({ message: 'คัดลอกไม่สำเร็จ ลองดาวน์โหลดเป็นไฟล์แทน', tone: 'warning' });
  };
  const download = () => {
    downloadText(json, diagnosticsFileName(), 'application/json');
  };
  return (
    <Modal onClose={onClose} label="รายงานปัญหา" className="max-w-2xl max-h-[90vh]">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
        <h2 className="font-bold text-lg">รายงานปัญหา</h2>
        <button type="button" onClick={onClose} className="px-3 py-2 min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200 text-sm">ปิด</button>
      </div>
      <div className="p-4 overflow-y-auto space-y-3 text-sm">
        <p className="text-slate-600">รายงานนี้มีเฉพาะชื่อไฟล์ จำนวนแถว และสถานะ ไม่มี Part Number คำอธิบาย หรือจำนวน แนบไฟล์นี้ให้ผู้ดูแลเมื่อแจ้งปัญหา</p>
        <pre data-testid="diagnostics-preview" className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap break-all">{json}</pre>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="px-4 py-2 min-h-[44px] rounded-lg bg-blue-600 text-white hover:bg-blue-700">คัดลอก</button>
          <button type="button" onClick={download} className="px-4 py-2 min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200">ดาวน์โหลด .json</button>
        </div>
      </div>
    </Modal>
  );
}

export default function HelpModal({ ctx }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [openIds, setOpenIds] = useState(['steps']);

  useEffect(() => {
    if (!snap.open) return;
    const id = snap.section && SECTIONS.some(([s]) => s === snap.section) ? snap.section : null;
    if (id) setOpenIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    const t = setTimeout(() => {
      const el = document.getElementById(snap.anchor ? `help-${snap.section}-${snap.anchor}` : id ? `help-${id}` : '');
      if (el) { el.scrollIntoView?.({ block: 'center' }); (el.querySelector?.('button') && !snap.anchor ? el.querySelector('button') : el).focus?.(); }
    }, 0);
    return () => clearTimeout(t);
  }, [snap.open, snap.section, snap.anchor]);

  const toggle = (id) => setOpenIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const releases = useMemo(() => parseChangelog(changelogRaw), []);
  const plan = useMemo(() => renderWritePlanSummary(), []);
  const keys = [...BASE_KEYS, ...listHotkeys().filter((h) => h.label).map((h) => [h.keyLabel || h.key, h.label])];
  const sec = (id) => ({ id, title: SECTIONS.find(([s]) => s === id)[1], open: openIds.includes(id), onToggle: () => toggle(id) });

  return (
    <>
      {snap.open && !snap.diagnostics && (
        <Modal onClose={closeHelp} label="ศูนย์ช่วยเหลือ" className="max-w-2xl max-h-[92vh]">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg">ศูนย์ช่วยเหลือ</h2>
            <button type="button" onClick={closeHelp} className="px-3 py-2 min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200 text-sm">ปิด</button>
          </div>
          <div className="p-4 overflow-y-auto space-y-3 min-w-0">
            <Section {...sec('steps')}><ol className="list-decimal pl-5 space-y-1">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol></Section>
            <Section {...sec('glossary')}><GlossaryList /></Section>
            <Section {...sec('plants')}>
              <ul className="space-y-1">{GLOSSARY.filter((e) => e.group === 'plant' || e.group === 'file').map((e) => <li key={e.key}><b>{e.term}</b>: {e.th}</li>)}</ul>
            </Section>
            <Section {...sec('writes')}>
              <h4 className="font-semibold">แอปเขียน</h4><ul className="list-disc pl-5">{plan.writes.map((w) => <li key={w.sheet}>{w.text}</li>)}</ul>
              <h4 className="font-semibold mt-2">แอปไม่เขียน (ต้องทำเอง)</h4><ul className="list-disc pl-5">{plan.manual.map((w) => <li key={w.sheet}>{w.text}</li>)}</ul>
            </Section>
            <Section {...sec('faq')}>{FAQ.map(([q, a]) => <div key={q}><p className="font-semibold">{q}</p><p className="text-slate-600">{a}</p></div>)}</Section>
            <Section {...sec('template')}>
              <p>แอปหาชีทจากชื่อ (BP Daily, BPK Daily, GW Daily, SR Daily, Analyze) และหัวตาราง “PART NUMBER” ถ้าบริษัทแก้เทมเพลต:</p>
              <ul className="list-disc pl-5"><li>อย่าเปลี่ยนชื่อชีทหรือลบชีทเหล่านี้</li><li>ย้ายแถวหัวตารางได้ แต่แถวสูตรรวมต้องอยู่ใต้ข้อมูล</li><li>ถ้าแอปแจ้ง “ข้ามชีท” แปลว่าไม่พบชีทนั้นในเทมเพลต</li></ul>
            </Section>
            <Section {...sec('shortcuts')}>
              <table className="w-full text-left"><tbody>{keys.map(([k, d]) => <tr key={k} className="border-t border-slate-100"><td className="py-1 pr-3 whitespace-nowrap"><kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">{k}</kbd></td><td className="py-1">{d}</td></tr>)}</tbody></table>
            </Section>
            <Section {...sec('whatsnew')}>
              {releases.slice(0, 3).map((r) => (
                <div key={r.version}><p className="font-semibold">v{r.version} <span className="font-normal text-slate-400">{r.date}</span></p><ul className="list-disc pl-5">{r.items.map((i) => <li key={i}>{i}</li>)}</ul></div>
              ))}
            </Section>
          </div>
          <div className="p-3 border-t border-slate-200 text-sm flex items-center justify-between gap-2">
            <span className="text-slate-500">พบปัญหาในการใช้งาน?</span>
            <button type="button" onClick={openDiagnostics} className="px-4 py-2 min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200">รายงานปัญหา</button>
          </div>
        </Modal>
      )}
      {snap.diagnostics && <Diagnostics ctx={ctx} onClose={closeHelp} />}
    </>
  );
}
