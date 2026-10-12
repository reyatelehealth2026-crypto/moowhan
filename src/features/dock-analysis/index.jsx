import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import DockPanel, { ID, DEFAULTS } from './DockPanel.jsx';
import { buildSheets } from './sheets.js';
import { emptyMaster, loadMaster } from './master.js';
import { readPackingTypeMap } from './packaging.js';

export default defineFeature({
  id: ID,
  order: 75,
  group: 'วิเคราะห์',
  description: 'สรุปยอดตาม Dock, Car Family, Part หลัก และบรรจุภัณฑ์ (กล่อง/พาเลท)',
  tab: {
    label: 'วิเคราะห์ Dock/รุ่น/บรรจุภัณฑ์',
    Icon: Icons.PieChart,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    Component: DockPanel,
  },
  // Extra sheets are opt-in (checkboxes in the panel); nothing is written into template cells.
  exportSheets: async (ctx) => {
    const d = { ...DEFAULTS, ...(ctx.state.features?.[ID] || {}) };
    const o = d.exportOpts || {};
    if (!ctx.state.processedData || !(o.dock || o.carFamily || o.boxes)) return [];
    const master = d.master || loadMaster() || emptyMaster();
    let map = d.packMap;
    if (o.boxes && !map && ctx.state.template?.kind === 'xlsx') map = await readPackingTypeMap(ctx.state.template.buffer);
    return buildSheets(ctx.state.processedData, o, master, map || null);
  },
});
