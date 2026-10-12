import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { lazyComponent } from '../lazy.js';
import { buildDailyTotalAoa } from '../../lib/excel/daily.js';
import { ID, DAILY_TOTAL_SHEET, settingsOf, updateSettings, setPrint } from './settings.js';

export { DAILY_TOTAL_SHEET };

const DailyGridTab = lazyComponent(() => import('./DailyGridTab.jsx'));
const PrintView = lazyComponent(() => import('./PrintView.jsx'));

export default defineFeature({
  id: ID,
  order: 25,
  group: 'core',
  description: 'ตารางยอดรายวัน ค้นหา คัดลอก และพิมพ์แผนรายวัน',
  tab: {
    label: 'ตารางรายวัน',
    Icon: Icons.Eye,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    Component: DailyGridTab,
  },
  headerActions: (ctx) => {
    if (!ctx.state.processedData) return [];
    const on = settingsOf(ctx).includeInExport;
    return [
      { label: 'พิมพ์แผนรายวัน', Icon: Icons.File, onClick: () => setPrint(ctx, true), priority: 1 },
      { label: `ส่งออกชีท ${DAILY_TOTAL_SHEET}: ${on ? 'เปิด' : 'ปิด'}`, Icon: Icons.Sort, onClick: () => updateSettings(ctx, { includeInExport: !on }), priority: 0 },
    ];
  },
  exportSheets: (ctx) => {
    const s = settingsOf(ctx);
    if (!s.includeInExport || !ctx.state.processedData) return [];
    return [{ name: DAILY_TOTAL_SHEET, aoa: buildDailyTotalAoa(ctx.state.processedData, { merged: s.view === 'merged', labels: ctx.monthLabels }) }];
  },
  slots: {
    banner: (ctx) => (ctx.state.features?.[ID]?.printOpen && ctx.state.processedData ? (
      <PrintView
        processedData={ctx.state.processedData}
        monthLabels={ctx.monthLabels}
        productionMonth={ctx.state.productionMonth}
        sourceFiles={ctx.state.sourceFiles}
        onClose={() => setPrint(ctx, false)}
      />
    ) : null),
  },
});
