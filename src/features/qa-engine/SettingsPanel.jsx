import { DEFAULT_SETTINGS, isRuleOn, mergeSettings } from './settings.js';
import { listRules } from './engine.js';
import { GROUP_LABEL } from './model.js';
import { FEATURE_ID, settingsOf } from './compute.js';
import { Button } from '../ui-kit/index.js';

// Rule switches for the "ขั้นสูง" section of the Settings tab.
// Works with the settings-profile contract (props value/onChange) and standalone (state.features['qa-engine'].settings).
export default function SettingsPanel({ value, onChange, state, actions }) {
  const current = mergeSettings(value ?? settingsOf(state));
  const save = (patch) => {
    const next = { ...current, ...patch };
    if (onChange) onChange(next);
    else actions?.setFeatureData?.(FEATURE_ID, { settings: next });
  };
  const rules = listRules();
  return (
    <div className="space-y-4" data-testid="qa-settings">
      <p className="text-sm text-slate-500">เปิด/ปิดกฎตรวจคุณภาพ รายการ “ต้องแก้” ที่ปิดกฎไว้จะไม่ถูกตรวจ ปิดเฉพาะเมื่อมั่นใจว่ากฎนั้นไม่เหมาะกับข้อมูลของคุณ</p>
      {Object.entries(GROUP_LABEL).map(([group, label]) => {
        const list = rules.filter((r) => r.group === group);
        if (!list.length) return null;
        return (
          <fieldset key={group} className="border border-slate-200 rounded-xl p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">{label}</legend>
            {list.map((r) => (
              <label key={r.id} className="flex items-start gap-2 py-1.5 text-sm min-h-[44px]">
                <input type="checkbox" className="mt-1 w-4 h-4" checked={isRuleOn(r, current)} onChange={(e) => save({ rules: { ...current.rules, [r.id]: e.target.checked } })} />
                <span><span className="font-mono text-xs mr-1">{r.id}</span>{r.title}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="block">SUPP CODE ที่คาด (R05)
          <input className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" value={current.suppCode} onChange={(e) => save({ suppCode: e.target.value })} />
        </label>
        <label className="block">รูปแบบ Part Number (R04, regex ว่าง = ค่าเริ่มต้น)
          <input className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" value={current.partPattern} onChange={(e) => save({ partPattern: e.target.value })} />
        </label>
        <label className="block">ยอดเปลี่ยนแรงตั้งแต่ (เท่า) (K05)
          <input type="number" min="1.5" step="0.5" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" value={current.thresholds.swingRatio} onChange={(e) => save({ thresholds: { ...current.thresholds, swingRatio: Number(e.target.value) || DEFAULT_SETTINGS.thresholds.swingRatio } })} />
        </label>
      </div>
      <Button variant="secondary" size="sm" onClick={() => save({ ...DEFAULT_SETTINGS })}>คืนค่าเริ่มต้น</Button>
    </div>
  );
}
