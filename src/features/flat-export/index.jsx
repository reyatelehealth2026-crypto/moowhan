import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { PLANTS, dailySheetName } from '../../constants.js';
import FlatExportModal from './FlatExportModal.jsx';
import { applyPreset, loadSettings, presetById, saveSettings } from './presets.js';
import { buildLongRows } from './logic.js';

const ID = 'flat-export';
export const FLAT_SHEET = 'Data (flat)';

const hasRows = (state) => PLANTS.some((p) => state.processedData?.[dailySheetName(p)]?.length > 0);
const settingsOf = (ctx) => ctx.state.features?.[ID]?.settings ?? loadSettings();
const setOpen = (ctx, open) => ctx.actions.setFeatureData(ID, { open });
// Hook: when settings-profile lands, persist through the profile store instead of localStorage here.
const updateSettings = (ctx, patch) => {
  const next = { ...settingsOf(ctx), ...patch };
  saveSettings(next);
  ctx.actions.setFeatureData(ID, { settings: next });
};

export default defineFeature({
  id: ID,
  order: 50,
  group: 'ตรวจสอบ',
  description: 'ส่งออกข้อมูลดิบ CSV/JSON พร้อม schema สำหรับระบบอื่น',
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
