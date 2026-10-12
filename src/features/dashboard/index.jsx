import Icons from '../../components/Icons.jsx';
import { defineFeature } from '../defineFeature.js';
import DashboardTab from './DashboardTab.jsx';

export default defineFeature({
  id: 'dashboard',
  order: 45,
  group: 'core',
  description: 'แดชบอร์ดสรุปผู้บริหาร พิมพ์และบันทึกเป็นรูป',
  tab: {
    label: 'แดชบอร์ด',
    Icon: Icons.PieChart,
    enabled: (ctx) => !!ctx.state.summaryData,
    tooltip: 'ต้องประมวลผลไฟล์ก่อน',
    Component: DashboardTab,
  },
});
