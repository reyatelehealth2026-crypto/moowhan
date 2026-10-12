import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { PLANTS, dailySheetName } from '../../constants.js';
import { lazyComponent } from '../lazy.js';
import { registerKey } from '../../lib/storage/registry.js';
import { buildLongRows } from './logic.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, applyPreset, normalizeSettings, presetById } from './presets.js';

const FlatExportModal = lazyComponent(() => import('./FlatExportModal.jsx'));
const loadStorage = () => import('../../lib/storage/index.js');

const ID = 'flat-export';
export const FLAT_SHEET = 'Data (flat)';

const hasRows = (state) => PLANTS.some((p) => state.processedData?.[dailySheetName(p)]?.length > 0);
registerKey({ key: SETTINGS_KEY, tier: 'prefs', purpose: 'ตัวเลือกส่งออกข้อมูล CSV/JSON ล่าสุด', retention: null });
// the storage layer is loaded on first use (it is not part of the entry chunk)
const flatStorage = async () => (await loadStorage()).getStorage();

const settingsOf = (ctx) => ctx.state.features?.[ID]?.settings ?? DEFAULT_SETTINGS;
const setOpen = (ctx, open) => ctx.actions.setFeatureData(ID, { open });
// Last choice lives in the storage layer's prefs tier; it is loaded once after the first processing.
// Re-read on every processing: "รีเซ็ต" clears state.features, so a one-shot guard would lose the saved choice (F16).
const hydrate = async (ctx) => {
  if (ctx.state.features?.[ID]?.settings) return;
  const saved = await (await flatStorage()).get('prefs', SETTINGS_KEY);
  if (saved) ctx.actions.setFeatureData(ID, (cur) => (cur.settings ? {} : { settings: normalizeSettings(saved) }));
};
const updateSettings = async (ctx, patch) => {
  const next = { ...settingsOf(ctx), ...patch };
  ctx.actions.setFeatureData(ID, { settings: next });
  (await flatStorage()).put('prefs', SETTINGS_KEY, next);
};

export default defineFeature({
  id: ID,
  order: 50,
  group: 'ตรวจสอบ',
  description: 'ส่งออกข้อมูลดิบ CSV/JSON พร้อม schema สำหรับระบบอื่น',
  onProcessed: (ctx) => hydrate(ctx),
  headerActions: (ctx) => (hasRows(ctx.state)
    ? [{ label: 'ส่งออกข้อมูล (CSV/JSON)', Icon: Icons.Share, onClick: () => setOpen(ctx, true), priority: 1 }]
    : []),
  exportSheets: (ctx) => {
    const s = settingsOf(ctx);
    if (!s.includeSheet || !hasRows(ctx.state)) return [];
    const { processedData, productionMonth, sourceFiles } = ctx.state;
    const long = applyPreset(buildLongRows(processedData, productionMonth, { files: sourceFiles }), presetById(s.preset));
    return [{ name: FLAT_SHEET, aoa: long.aoa }];
  },
  slots: {
    banner: (ctx) => (ctx.state.features?.[ID]?.open && hasRows(ctx.state) ? (
      <FlatExportModal
        state={ctx.state}
        settings={settingsOf(ctx)}
        onSettings={(patch) => updateSettings(ctx, patch)}
        onClose={() => setOpen(ctx, false)}
        setError={ctx.actions.setError}
      />
    ) : null),
  },
});
