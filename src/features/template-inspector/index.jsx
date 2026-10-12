import { defineFeature } from '../defineFeature.js';
import InspectionCard from './InspectionCard.jsx';

// Template inspector: the facts live in state.template.inspection (computed once when the template is
// loaded, see lib/excel/templateInfo.js). This feature only shows them under the upload tab.
// Rules (capacity, readiness) belong to qa-engine / export-gate, which can read the same data.
export default defineFeature({
  id: 'template-inspector',
  order: 66,
  group: 'ตรวจสอบ',
  description: 'ตรวจโครงสร้างเทมเพลต: ชีต แถวหัว ความจุ pivot และโปรแกรมที่บันทึกไฟล์',
  slots: {
    uploadPanel: (ctx) => <InspectionCard inspection={ctx.state.template?.inspection} />,
  },
});
