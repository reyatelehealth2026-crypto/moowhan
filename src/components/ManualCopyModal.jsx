import { useEffect, useRef } from 'react';
import Modal from './Modal.jsx';
import { Button } from '../features/ui-kit/index.js';

/**
 * Fallback when the browser refuses clipboard access: shows the text pre-selected so the user can press Ctrl+C
 * (⌘+C) themselves. `text` is the exact string the copy button tried to put on the clipboard.
 */
export default function ManualCopyModal({ text, title = 'คัดลอกด้วยตนเอง', onClose }) {
  const area = useRef(null);
  useEffect(() => { area.current?.focus(); area.current?.select(); }, []);
  return (
    <Modal onClose={onClose} label={title} className="max-w-2xl max-h-[92vh]">
      <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3">
        <h3 className="font-semibold text-lg">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>ปิด</Button>
      </div>
      <div className="p-4 sm:p-6 space-y-3 overflow-y-auto min-w-0">
        <p className="text-sm text-slate-600">เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ — ข้อความด้านล่างถูกเลือกไว้แล้ว กด Ctrl+C (Mac: ⌘+C) แล้ววางลง Excel / Google Sheets</p>
        <textarea
          ref={area}
          data-testid="manual-copy-text"
          aria-label="ข้อความที่ต้องคัดลอก"
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          rows={12}
          className="w-full border border-slate-300 rounded-lg p-3 text-sm font-mono resize-y"
        />
      </div>
    </Modal>
  );
}
