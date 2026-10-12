import { defineFeature } from '../defineFeature.js';

// No tab and no header button on purpose: the 'แชร์สรุป' button (ShareButton.jsx) lives in the SummaryTab row.
export default defineFeature({
  id: 'share-clipboard',
  order: 75,
  description: 'แชร์สรุปเป็นข้อความ (LINE/อีเมล/TSV) และคัดลอกตารางลงคลิปบอร์ด',
});
