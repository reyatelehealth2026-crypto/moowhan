import { useMemo, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import CopyButton from '../../components/CopyButton.jsx';
import Icons from '../../components/Icons.jsx';
import { Button } from '../ui-kit/index.js';
import { canShare, shareText } from '../../utils/clipboard.js';
import { buildShareModel, buildShareText } from './logic.js';

const MODES = [
  { id: 'short', label: 'สั้น (LINE)' },
  { id: 'full', label: 'เต็ม (อีเมล)' },
  { id: 'tsv', label: 'ตาราง TSV' },
];

export default function ShareModal({ state, actions, monthLabels, onClose }) {
  const [mode, setMode] = useState('short');
  const [lang, setLang] = useState('th');
  const model = useMemo(() => buildShareModel(state, monthLabels), [state, monthLabels]);
  const generated = useMemo(() => buildShareText(model, { mode, lang }), [model, mode, lang]);
  const [edits, setEdits] = useState({}); // edited text per mode+lang, reset when the choice changes
  const key = `${mode}:${lang}`;
  const text = edits[key] ?? generated;
  const [manual, setManual] = useState(false);

  const record = (what, detail) => actions.log?.({ fileName: '-', action: 'share', details: `${what} (${MODES.find((m) => m.id === mode).label}, ${lang.toUpperCase()}, ${detail} ตัวอักษร)` });

  const onCopied = (res) => {
    record(res.ok ? 'คัดลอก' : 'คัดลอกไม่สำเร็จ', res.text.length);
    if (res.ok) { setManual(false); actions.setNotice?.('คัดลอกแล้ว - วางลง LINE/อีเมลได้เลย', 'success'); } else {
      setManual(true);
      actions.setNotice?.('เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ — เลือกข้อความด้านล่างแล้วกด Ctrl+C');
    }
  };
  const share = async () => {
    try {
      if (await shareText(text, 'สรุปแผนการผลิต TMT')) record('แชร์', text.length);
    } catch {
      actions.setNotice?.('แชร์ไม่สำเร็จ — ลองคัดลอกแทน');
    }
  };

  const pill = (active) => `px-3 min-h-[44px] rounded-lg border text-sm font-medium cursor-pointer ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`;

  return (
    <Modal onClose={onClose} label="แชร์สรุป" className="max-w-2xl max-h-[92vh]">
      <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3">
        <h3 className="font-semibold text-lg">แชร์สรุป</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>ปิด</Button>
      </div>
      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
        <div className="flex flex-wrap gap-2 justify-between">
          <div role="radiogroup" aria-label="รูปแบบ" className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <label key={m.id} className={pill(mode === m.id)}>
                <input type="radio" name="share-mode" className="sr-only" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span className="inline-flex items-center min-h-[44px]">{m.label}</span>
              </label>
            ))}
          </div>
          <div role="group" aria-label="ภาษา" className="flex gap-2">
            {['th', 'en'].map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={pill(lang === l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <textarea
          data-testid="share-text"
          aria-label="ข้อความที่จะแชร์"
          value={text}
          readOnly={false}
          onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
          onFocus={manual ? (e) => e.target.select() : undefined}
          rows={14}
          className="w-full border border-slate-300 rounded-lg p-3 text-sm font-mono resize-y"
        />
        <p className="text-xs text-slate-500">
          {mode === 'short' ? `${text.length}/1000 ตัวอักษร · ` : ''}แก้ไขข้อความได้ก่อนคัดลอก
          {manual && ' · คัดลอกอัตโนมัติไม่ได้ ให้เลือกข้อความแล้วกด Ctrl+C'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <CopyButton variant="primary" getText={() => text} onCopied={onCopied} className="flex-1" data-testid="share-copy" />
          {canShare() && <Button variant="secondary" Icon={Icons.Share} onClick={share} className="flex-1">แชร์…</Button>}
        </div>
      </div>
    </Modal>
  );
}
