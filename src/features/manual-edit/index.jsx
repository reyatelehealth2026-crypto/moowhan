import Banner from '../../components/Banner.jsx';
import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import { ID, editedRowCount, featureData, liveLedger, replayAfterProcess } from './controller.js';
import EditTab from './EditTab.jsx';
import { buildLedgerAoa } from './edits.js';

export const SHEET_NAME = 'Manual Edits';
const CUSTOMER_PROFILE = 'ส่งลูกค้า';

export default defineFeature({
  id: ID,
  order: 52,
  group: 'ตรวจสอบ',
  description: 'แก้ไขตัวเลข N..N+3 ด้วยมือ พร้อมเหตุผล เลิกทำ และนำกลับมาใช้หลังประมวลผลใหม่',
  tab: {
    label: 'แก้ไขตัวเลข',
    Icon: Icons.Function,
    enabled: (ctx) => !!ctx.state.processedData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    badge: (ctx) => editedRowCount(ctx.state),
    Component: EditTab,
  },
  // counter in the header: jumps to the tab
  headerActions: (ctx) => {
    const n = editedRowCount(ctx.state);
    if (!n) return null;
    return (
      <button type="button" onClick={() => ctx.actions.goTo?.(ID)} data-testid="manual-edit-counter"
        className="hidden sm:inline-flex items-center px-3 py-2 min-h-[44px] bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-sm font-medium">
        แก้ไขด้วยมือ {n} รายการ
      </button>
    );
  },
  slots: {
    banner: (ctx) => {
      const n = featureData(ctx.state).ledger.length;
      return n && ctx.state.isStale ? <Banner tone="warning" message={`มีการแก้ไข ${n} รายการ จะถูกนำกลับมาใช้หลังประมวลผลใหม่`} /> : null;
    },
  },
  onProcessed: (ctx, result) => { replayAfterProcess(ctx, result); },
  // 'Manual Edits' ledger: only when edits exist, not for the customer profile, and unless switched off in the tab
  exportSheets: (ctx) => {
    const d = featureData(ctx.state);
    if (d.exportLedger === false || ctx.state.profile?.recipient === CUSTOMER_PROFILE) return [];
    const ledger = liveLedger(ctx.state);
    return ledger.length ? [{ name: SHEET_NAME, aoa: buildLedgerAoa(ledger) }] : [];
  },
});
