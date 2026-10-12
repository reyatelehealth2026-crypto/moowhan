import { defineFeature } from '../defineFeature.js';

// Dev-only infrastructure feature: no tab, no hooks. Real value lives in tests/, scripts/ and .github/.
// Shared JSDoc typedefs are in ./types.js.
export default defineFeature({
  id: 'test-infra',
  order: 96,
  group: 'ตั้งค่า',
  description: 'โครงสร้างทดสอบ ฟิกซ์เจอร์ type และ CI (ไม่มีหน้าจอ)',
});
