import { useMemo, useRef, useState } from 'react';
import Banner from '../../components/Banner.jsx';
import { Button, Chip, ConfirmDialog, pushToast } from '../ui-kit/index.js';
import { downloadText } from '../../utils/download.js';
import { WEEKDAY_LABELS, daysInMonth } from '../../utils/calendar.js';
import { formatMonth, renderFileName } from '../../utils/format.js';
import { PLANTS } from '../../constants.js';
import { DEFAULT_FILE_NAME_PATTERN, exportProfile, importProfile, mergeWithDefaults, validateProfile } from './profile.js';
import { ALL_SCOPE, dayStatus, emptyScope, isoOf, normalizeCalendar, suggestNonWorkingDays, workingDaysInMonth } from './calendar.js';

const SECTIONS = [{ id: 'general', label: 'ทั่วไป' }, { id: 'calendar', label: 'ปฏิทินวันทำงาน' }, { id: 'advanced', label: 'ขั้นสูง' }];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // จ..อา
const TOKENS = ['{month}', '{monthLabel}', '{rev}', '{date}', '{time}'];
const input = 'w-full min-w-0 px-3 py-2 min-h-[44px] border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
const card = 'bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4';

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-500">{hint}</span>}
  </label>
);

// ---------------------------------------------------------------- general
function General({ profile, setProfile, productionMonth }) {
  const pattern = profile.export?.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN;
  const sample = renderFileName(pattern, { productionMonth });
  return (
    <div className={card}>
      <Field label="รูปแบบชื่อไฟล์ที่ดาวน์โหลด" hint="ตัวแปรที่ใช้ได้: {month} {monthLabel} {rev} {date} {time} · ตัวอักษรที่ใช้ในชื่อไฟล์ไม่ได้จะถูกแทนด้วย _">
        <input data-testid="pattern-input" className={input} value={pattern} onChange={(e) => setProfile({ export: { ...profile.export, fileNamePattern: e.target.value } })} />
      </Field>
      <div className="flex flex-wrap gap-1">
        {TOKENS.map((t) => (
          <button key={t} type="button" className="px-2 py-1 text-xs rounded-full bg-slate-100 hover:bg-slate-200" onClick={() => setProfile({ export: { ...profile.export, fileNamePattern: `${pattern}`.replace(/(\.xlsx)?$/, `${t}$1`) } })}>{t}</button>
        ))}
        <button type="button" className="px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => setProfile({ export: { ...profile.export, fileNamePattern: DEFAULT_FILE_NAME_PATTERN } })}>ใช้ค่าเริ่มต้น</button>
      </div>
      <p className="text-sm text-slate-600 break-all">ตัวอย่างชื่อไฟล์: <strong data-testid="pattern-sample">{sample}</strong></p>
      <label className="flex items-center gap-3 min-h-[44px] text-sm">
        <input type="checkbox" className="w-5 h-5" checked={profile.export?.highlight !== false} onChange={(e) => setProfile({ export: { ...profile.export, highlight: e.target.checked } })} />
        ไฮไลต์เซลล์ที่แก้ไขในไฟล์ส่งออก
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- calendar
const ListRow = ({ children, onRemove, label }) => (
  <li className="flex items-center gap-2 py-1">
    <span className="flex-1 min-w-0 text-sm break-words">{children}</span>
    <button type="button" onClick={onRemove} aria-label={`ลบ ${label}`} className="w-11 h-11 flex-shrink-0 rounded-lg text-slate-500 hover:bg-slate-100">✕</button>
  </li>
);

function MonthStrip({ calendar, plant, productionMonth, rows }) {
  if (!productionMonth) return <p className="text-sm text-slate-500">ประมวลผลไฟล์ก่อนเพื่อดูแถบวันของเดือนที่โหลดอยู่</p>;
  const len = daysInMonth(productionMonth.year, productionMonth.month);
  const guess = new Set(suggestNonWorkingDays(rows, 0, { productionMonth }));
  const working = workingDaysInMonth(calendar, plant, productionMonth);
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700">{formatMonth(productionMonth)}: <strong>{working}</strong> วันทำงาน</p>
      <div className="grid grid-cols-8 sm:grid-cols-16 gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))' }} data-testid="month-strip">
        {Array.from({ length: len }, (_, i) => {
          const st = dayStatus(calendar, plant, isoOf(productionMonth.year, productionMonth.month, i + 1));
          const cls = st.working ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-500 border-slate-300';
          const hint = guess.has(i + 1) && st.working ? ' ring-2 ring-amber-400' : '';
          return (
            <div key={i} className={`text-center text-xs py-1 rounded border ${cls}${hint}`} title={`${i + 1}: ${st.working ? 'ทำงาน' : st.reason === 'holiday' ? `วันหยุด ${st.name || ''}` : st.reason === 'shutdown' ? `หยุดโรงงาน ${st.name || ''}` : 'หยุดประจำสัปดาห์'}${guess.has(i + 1) ? ' · คาดว่าหยุด (ทุกรายการเป็น 0)' : ''}`}>{i + 1}</div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">เขียวคือวันทำงาน เทาคือวันหยุด กรอบเหลืองคือ “คาดว่าหยุด” (ทุกรายการเป็น 0 ในไฟล์) เป็นเพียงคำแนะนำ ไม่ใช่ข้อมูลที่ยืนยัน</p>
    </div>
  );
}

function CalendarSection({ profile, setProfile, state }) {
  const [scope, setScope] = useState(ALL_SCOPE);
  const [h, setH] = useState({ date: '', name: '' });
  const [x, setX] = useState('');
  const [s, setS] = useState({ from: '', to: '', name: '' });
  const [err, setErr] = useState('');
  const calendar = useMemo(() => normalizeCalendar(profile.features?.calendar).calendar, [profile.features?.calendar]);
  const sc = calendar.scopes[scope] ?? emptyScope();
  const weekdays = sc.workingWeekdays ?? (scope === ALL_SCOPE ? calendar.workingWeekdays : null);
  const effective = sc.workingWeekdays ?? calendar.scopes[ALL_SCOPE]?.workingWeekdays ?? calendar.workingWeekdays;
  const rows = useMemo(() => {
    const data = state.processedData || {};
    return scope === ALL_SCOPE ? Object.values(data).flat() : (data[`${scope} Daily`] || []);
  }, [state.processedData, scope]);

  const commit = (nextScope) => {
    const next = { ...calendar, scopes: { ...calendar.scopes, [scope]: { ...sc, ...nextScope } } };
    if (scope === ALL_SCOPE && nextScope.workingWeekdays) next.workingWeekdays = nextScope.workingWeekdays;
    const { errors } = normalizeCalendar(next);
    if (errors.length) { setErr(errors.join('\n')); return false; }
    setErr('');
    setProfile({ features: { calendar: next } });
    return true;
  };
  const toggleDay = (d) => {
    const cur = new Set(effective);
    if (cur.has(d)) cur.delete(d); else cur.add(d);
    commit({ workingWeekdays: [...cur].sort() });
  };
  return (
    <div className={card}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="ขอบเขต">
          <select data-testid="cal-scope" className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={ALL_SCOPE}>ทุกโรงงาน</option>
            {PLANTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-1">วันทำงานประจำสัปดาห์{scope !== ALL_SCOPE && !sc.workingWeekdays ? ' (ใช้ตามทุกโรงงาน)' : ''}</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="วันทำงานประจำสัปดาห์">
          {WEEK_ORDER.map((d) => (
            <button key={d} type="button" aria-pressed={effective.includes(d)} onClick={() => toggleDay(d)}
              className={`w-11 h-11 rounded-lg border text-sm font-medium ${effective.includes(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}>{WEEKDAY_LABELS[d]}</button>
          ))}
        </div>
      </div>
      {err && <Banner tone="error" message={err} onDismiss={() => setErr('')} />}

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">วันหยุด</p>
        <ul className="divide-y divide-slate-100">{sc.holidays.map((it, i) => (
          <ListRow key={i} label={it.date} onRemove={() => commit({ holidays: sc.holidays.filter((_, j) => j !== i) })}>{it.date} {it.name && <span className="text-slate-500">· {it.name}</span>}</ListRow>
        ))}</ul>
        <div className="flex flex-wrap gap-2">
          <input type="date" aria-label="วันที่หยุด" className={`${input} !w-auto`} value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
          <input aria-label="ชื่อวันหยุด" placeholder="ชื่อวันหยุด (ถ้ามี)" className={`${input} flex-1`} value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
          <Button variant="secondary" size="sm" onClick={() => { if (h.date && commit({ holidays: [...sc.holidays, { date: h.date, name: h.name }] })) setH({ date: '', name: '' }); }}>เพิ่มวันหยุด</Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">วันทำงานพิเศษ (เช่น เสาร์ทำงาน)</p>
        <ul className="divide-y divide-slate-100">{sc.extraWorkDays.map((d, i) => (
          <ListRow key={i} label={d} onRemove={() => commit({ extraWorkDays: sc.extraWorkDays.filter((_, j) => j !== i) })}>{d}</ListRow>
        ))}</ul>
        <div className="flex flex-wrap gap-2">
          <input type="date" aria-label="วันทำงานพิเศษ" className={`${input} !w-auto`} value={x} onChange={(e) => setX(e.target.value)} />
          <Button variant="secondary" size="sm" onClick={() => { if (x && commit({ extraWorkDays: [...sc.extraWorkDays, x] })) setX(''); }}>เพิ่มวันทำงาน</Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">ช่วงหยุดโรงงาน (shutdown)</p>
        <ul className="divide-y divide-slate-100">{sc.shutdowns.map((it, i) => (
          <ListRow key={i} label={`${it.from}..${it.to}`} onRemove={() => commit({ shutdowns: sc.shutdowns.filter((_, j) => j !== i) })}>{it.from} ถึง {it.to} {it.name && <span className="text-slate-500">· {it.name}</span>}</ListRow>
        ))}</ul>
        <div className="flex flex-wrap gap-2">
          <input type="date" aria-label="เริ่มหยุด" className={`${input} !w-auto`} value={s.from} onChange={(e) => setS({ ...s, from: e.target.value })} />
          <input type="date" aria-label="สิ้นสุดการหยุด" className={`${input} !w-auto`} value={s.to} onChange={(e) => setS({ ...s, to: e.target.value })} />
          <input aria-label="ชื่อช่วงหยุด" placeholder="ชื่อ (ถ้ามี)" className={`${input} flex-1`} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          <Button variant="secondary" size="sm" onClick={() => { if (s.from && s.to && commit({ shutdowns: [...sc.shutdowns, s] })) setS({ from: '', to: '', name: '' }); }}>เพิ่มช่วงหยุด</Button>
        </div>
      </div>

      <MonthStrip calendar={calendar} plant={scope} productionMonth={state.productionMonth} rows={rows} />
    </div>
  );
}

// ---------------------------------------------------------------- advanced
const parseCaps = (text) => {
  const out = {};
  String(text).split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const i = l.lastIndexOf('=');
    out[i > 0 ? l.slice(0, i).trim() : l] = i > 0 ? Number(l.slice(i + 1)) : NaN;
  });
  return out;
};

function Advanced({ profile, setProfile }) {
  const [plants, setPlants] = useState(() => profile.plants.map((p) => ({ ...p, filePrefixesText: (p.filePrefixes || []).join(', ') })));
  const [tpl, setTpl] = useState({ analyzeSheet: profile.template.analyzeSheet, plantColFallback: profile.template.plantColFallback, caps: Object.entries(profile.template.capacityOverrides || {}).map(([k, v]) => `${k}=${v}`).join('\n') });
  const [errors, setErrors] = useState([]);
  const setPlant = (i, patch) => setPlants((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const save = () => {
    const candidate = {
      ...profile,
      plants: plants.map(({ filePrefixesText, ...p }) => ({ ...p, filePrefixes: filePrefixesText.split(',').map((x) => x.trim()).filter(Boolean) })),
      template: { ...profile.template, analyzeSheet: tpl.analyzeSheet, plantColFallback: tpl.plantColFallback.toUpperCase(), capacityOverrides: parseCaps(tpl.caps) },
    };
    const v = validateProfile(candidate);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors([]);
    setProfile({ plants: candidate.plants, template: candidate.template });
    pushToast({ message: 'บันทึกการตั้งค่าขั้นสูงแล้ว', tone: 'success' });
  };
  return (
    <div className={card}>
      <p className="text-sm text-slate-600">ค่านี้เก็บในโปรไฟล์สำหรับฟีเจอร์ที่อ่านจากโปรไฟล์ ส่วนการประมวลผลหลักยังใช้โรงงาน BP / BPK / GW / SR มาตรฐาน</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">รหัส</th><th className="pr-2">ชื่อ</th><th className="pr-2">รูปแบบชื่อไฟล์ (regex)</th><th className="pr-2">รหัสต้นทาง</th><th className="pr-2">ชีต Daily</th></tr></thead>
          <tbody>
            {plants.map((p, i) => (
              <tr key={i}>
                <td className="pr-2 py-1"><input aria-label="รหัสโรงงาน" className={input} value={p.code} onChange={(e) => setPlant(i, { code: e.target.value })} /></td>
                <td className="pr-2"><input aria-label="ชื่อโรงงาน" className={input} value={p.label} onChange={(e) => setPlant(i, { label: e.target.value })} /></td>
                <td className="pr-2"><input aria-label="รูปแบบชื่อไฟล์" className={input} value={p.filePrefixesText} onChange={(e) => setPlant(i, { filePrefixesText: e.target.value })} /></td>
                <td className="pr-2"><input aria-label="รหัสต้นทาง" className={input} value={p.sourcePlantCode} onChange={(e) => setPlant(i, { sourcePlantCode: e.target.value })} /></td>
                <td><input aria-label="ชื่อชีต Daily" className={input} value={p.dailySheet} onChange={(e) => setPlant(i, { dailySheet: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="ชื่อชีต Analyze"><input className={input} value={tpl.analyzeSheet} onChange={(e) => setTpl({ ...tpl, analyzeSheet: e.target.value })} /></Field>
        <Field label="คอลัมน์ Plant สำรอง" hint="ใช้เมื่อหาหัวคอลัมน์ไม่เจอ เช่น EH"><input className={input} value={tpl.plantColFallback} onChange={(e) => setTpl({ ...tpl, plantColFallback: e.target.value })} /></Field>
      </div>
      <Field label="กำลังการผลิต (capacityOverrides)" hint="บรรทัดละ 1 รายการ รูปแบบ  ชื่อ=ตัวเลข  เช่น BP|DOCK1=5000">
        <textarea rows={3} className={`${input} font-mono`} value={tpl.caps} onChange={(e) => setTpl({ ...tpl, caps: e.target.value })} />
      </Field>
      {errors.length > 0 && <Banner tone="error" message={errors.join('\n')} />}
      <Button onClick={save}>บันทึกการตั้งค่าขั้นสูง</Button>
    </div>
  );
}

// ---------------------------------------------------------------- panel
export default function SettingsPanel({ state, actions }) {
  const { profile } = state;
  const [section, setSection] = useState('general');
  const [errors, setErrors] = useState([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);
  const [rev, setRev] = useState(0); // remounts the advanced draft after import / reset

  const download = () => downloadText(exportProfile(profile), 'moowhan-profile.json', 'application/json');
  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = importProfile(await file.text());
    if (!res.ok) { setErrors(res.errors); return; }
    setErrors([]);
    actions.replaceProfile(mergeWithDefaults(res.profile));
    setRev((n) => n + 1);
    pushToast({ message: 'นำเข้าโปรไฟล์แล้ว', tone: 'success' });
  };

  return (
    <div className="space-y-4" data-testid="settings-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="หมวดตั้งค่า">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}
              className={`px-4 min-h-[44px] rounded-lg text-sm font-medium whitespace-nowrap ${section === s.id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>{s.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button variant="secondary" size="sm" onClick={download}>ส่งออกโปรไฟล์ (JSON)</Button>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>นำเข้าโปรไฟล์</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>คืนค่าเริ่มต้น</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="profile-import" onChange={onImport} />
        </div>
      </div>
      {errors.length > 0 && <Banner tone="error" message={`นำเข้าโปรไฟล์ไม่ได้ โปรไฟล์เดิมยังใช้งานอยู่\n${errors.join('\n')}`} onDismiss={() => setErrors([])} />}
      <Chip tone="info">โปรไฟล์เก็บในเบราว์เซอร์นี้เท่านั้น ไม่ส่งออกไปที่ใด</Chip>

      {section === 'general' && <General profile={profile} setProfile={actions.setProfile} productionMonth={state.productionMonth} />}
      {section === 'calendar' && <CalendarSection profile={profile} setProfile={actions.setProfile} state={state} />}
      {section === 'advanced' && <Advanced key={rev} profile={profile} setProfile={actions.setProfile} />}

      {confirmReset && (
        <ConfirmDialog
          danger
          title="คืนค่าเริ่มต้นของโปรไฟล์?"
          message={'การตั้งค่าทั้งหมดในหน้านี้จะกลับเป็นค่าเริ่มต้น\nไฟล์ที่อัปโหลดไว้ ผลการประมวลผล และงานที่บันทึกไว้จะไม่ถูกลบ'}
          confirmLabel="คืนค่าเริ่มต้น"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { actions.resetProfile(); setRev((n) => n + 1); setConfirmReset(false); pushToast({ message: 'คืนค่าเริ่มต้นโปรไฟล์แล้ว', tone: 'success' }); }}
        />
      )}
    </div>
  );
}
