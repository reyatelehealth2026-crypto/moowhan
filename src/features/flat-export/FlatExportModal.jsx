import { useMemo, useState } from 'react';
import Icons from '../../components/Icons.jsx';
import Modal from '../../components/Modal.jsx';
import { Button, pushToast } from '../ui-kit/index.js';
import { downloadBlob, downloadText } from '../../utils/download.js';
import { BUILTIN_PRESETS, applyPreset, presetById } from './presets.js';
import { buildJsonExport, buildLongRows, buildSummaryRows, monthToken } from './logic.js';
import { toCsv } from './serialize.js';

const CSV_MIME = 'text/csv;charset=utf-8';
const TOTAL_HINT = {
  all: 'รวมแถวรายวันและแถว TOTAL (ถ้าทำ Pivot ให้กรอง day ออกอย่างใดอย่างหนึ่งเพื่อไม่ให้นับซ้ำ)',
  only: 'เฉพาะแถว TOTAL ของแต่ละเดือน',
  days: 'เฉพาะแถวรายวัน (ไม่มี TOTAL จึงใช้ทำ Pivot ได้ทันทีโดยไม่นับซ้ำ)',
};

/** Builds the three files lazily (only when a button is pressed). */
export const buildFiles = (state, preset) => {
  const token = monthToken(state);
  const long = applyPreset(buildLongRows(state.processedData, state.productionMonth, { files: state.sourceFiles }), preset);
  return {
    long: { name: `forecast_long_${token}.csv`, content: toCsv(long.aoa, { delimiter: long.delimiter }) },
    wide: { name: `forecast_summary_${token}.csv`, content: toCsv(buildSummaryRows(state.summaryData, state.productionMonth), { delimiter: long.delimiter }) },
    json: { name: `forecast_${token}.json`, content: JSON.stringify(buildJsonExport(state), null, 2) },
    zipName: `forecast_${token}.zip`,
  };
};

export default function FlatExportModal({ state, settings, onSettings, onClose, setError }) {
  const [busy, setBusy] = useState(false);
  const preset = presetById(settings.preset);
  const rowCount = useMemo(() => Object.values(state.processedData || {}).reduce((s, r) => s + r.length, 0), [state.processedData]);

  const run = async (kind) => {
    setBusy(true);
    try {
      const files = buildFiles(state, preset);
      if (settings.zip) {
        const { zipFiles } = await import('../../lib/excel/index.js');
        const bytes = await zipFiles([files.long, files.wide, files.json]);
        downloadBlob(new Blob([bytes], { type: 'application/zip' }), files.zipName);
        pushToast({ message: `ดาวน์โหลด ${files.zipName} แล้ว (CSV รายวัน, CSV สรุป, JSON)`, tone: 'success' });
      } else {
        const f = files[kind];
        downloadText(f.content, f.name, kind === 'json' ? 'application/json;charset=utf-8' : CSV_MIME);
        pushToast({ message: `ดาวน์โหลด ${f.name} แล้ว`, tone: 'success' });
      }
    } catch (err) {
      setError?.(`ส่งออกข้อมูลไม่สำเร็จ: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const btn = (kind, label, hint) => (
    <div className="space-y-1">
      <Button variant="secondary" Icon={Icons.Download} className="w-full justify-start" loading={busy} onClick={() => run(kind)}>{label}</Button>
      <p className="text-xs text-slate-500 px-1">{hint}</p>
    </div>
  );

  return (
    <Modal onClose={onClose} label="ส่งออกข้อมูลสำหรับระบบอื่น" className="max-w-lg max-h-[92vh]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <h2 className="text-lg font-bold min-w-0">ส่งออกข้อมูลสำหรับระบบอื่น</h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="flex-shrink-0">ปิด</Button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto min-w-0">
        <p className="text-sm text-slate-600">ข้อมูล {rowCount.toLocaleString('en-US')} แถวจากไฟล์ที่ประมวลผลแล้ว · ไฟล์ CSV เป็น UTF-8 เปิดใน Excel ได้ภาษาไทยถูกต้อง</p>
        <label className="block text-sm space-y-1">
          <span className="font-medium">รูปแบบสำหรับ</span>
          <select value={preset.id} onChange={(e) => onSettings({ preset: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white min-h-[44px]">
            {BUILTIN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="block text-xs text-slate-500">{TOTAL_HINT[preset.totalMode]}</span>
        </label>
        {btn('long', 'ดาวน์โหลด CSV รายวัน (long)', '1 แถวต่อ โรงงาน × Part × เดือน × วัน (ใช้รูปแบบข้างบน)')}
        {btn('wide', 'ดาวน์โหลด CSV สรุป (wide)', '1 แถวต่อ Part Number: ยอด N..N+3 รวมทุกโรงงาน')}
        {btn('json', 'ดาวน์โหลด JSON', 'ครบทั้งไฟล์ ยอดรายวัน และสรุป ตาม schema เวอร์ชัน 1 (docs/schema/flat-export.schema.json)')}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={settings.zip} onChange={(e) => onSettings({ zip: e.target.checked })} />
          <span>ดาวน์โหลดเป็นชุด (.zip) — ปุ่มด้านบนจะรวม CSV รายวัน, CSV สรุป และ JSON ไว้ในไฟล์เดียว</span>
        </label>
        <label className="flex items-start gap-2 text-sm border-t border-slate-200 pt-3">
          <input type="checkbox" className="mt-1" checked={settings.includeSheet} onChange={(e) => onSettings({ includeSheet: e.target.checked })} />
          <span>ใส่ชีท “Data (flat)” ในไฟล์ Excel ตอนดาวน์โหลด (ปิดไว้เป็นค่าเริ่มต้น เพื่อให้ไฟล์เทมเพลตเหมือนเดิม)</span>
        </label>
      </div>
    </Modal>
  );
}
