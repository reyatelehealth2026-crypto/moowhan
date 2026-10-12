// ==================== GLOSSARY (single content source of the help center) ====================
// Pure data + helpers (no React/DOM). Everything the help modal, InfoTips and docs say about a term lives here.
import { ANALYZE_SHEET, DAILY_SHEETS, PLANTS, PLANT_CODE_MAP, PLANT_META, SOURCE_HEADERS, SUMMARY_SHEET, TEMPLATE, dailySheetName } from '../../constants.js';

export const GROUP_LABELS = {
  month: 'เดือนและการพยากรณ์',
  column: 'คอลัมน์ในไฟล์ต้นทาง',
  plant: 'โรงงาน',
  file: 'ไฟล์',
  sheet: 'ชีทในเทมเพลต',
  supply: 'การส่งของและซัพพลาย',
  ui: 'คำในหน้าจอ',
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const entry = (group, key, term, th, example = '', en = '', source = 'fixture-inferred') => ({ key, term, th, en, example, group, source });

const plantEntries = PLANTS.map((p) => {
  const letter = Object.keys(PLANT_CODE_MAP).find((l) => PLANT_CODE_MAP[l] === p);
  return entry(
    'plant', `plant-${slug(p)}`, p,
    `โรงงาน ${PLANT_META[p]?.label || p} (ชีท “${dailySheetName(p)}”) ชื่อไฟล์ต้นทางต้องขึ้นต้นด้วย ${p}${letter ? ` และในหัวไฟล์ PLANT CODE = ${letter}` : ''}`,
    `${p} veh 481D.xls`, PLANT_META[p]?.label || p,
  );
});

const columnEntries = [
  ['PART NUMBER', 'หมายเลขชิ้นส่วนเต็ม ใช้เป็นกุญแจหลักในการรวมข้อมูลข้ามโรงงาน', '86790-0K050-00'],
  ['PART CODE', 'รหัสย่อของชิ้นส่วน (ใช้ค้นหาและจับคู่ในแท็บ Matching)', ''],
  ['PART DESC', 'ชื่อ/คำอธิบายชิ้นส่วนตามที่ TMT ระบุ', ''],
  ['SUPP CODE', 'รหัสผู้ส่งมอบ (Supplier) ของชิ้นส่วนนั้น', ''],
  ['SHIPPING DOCK', 'ท่าส่งของ/ท่ารับของที่ TMT ระบุสำหรับการจัดส่ง ต่างจาก DOCK CODE ตรงที่เป็นชื่อท่า ไม่ใช่รหัส', ''],
  ['DOCK CODE', 'รหัสท่า (Dock) ที่แอปใช้จัดกลุ่มในแท็บวิเคราะห์ Dock', ''],
  ['CAR FAMILY', 'กลุ่มรุ่นรถที่ชิ้นส่วนนี้ใช้ เช่น 481D, DG7', '481D'],
  ['PACKING SIZE', 'จำนวนชิ้นต่อกล่อง/ภาชนะบรรจุ ใช้ประเมินจำนวนกล่องที่ต้องส่ง', ''],
].map(([h, th, ex]) => entry('column', slug(h), h, th, ex, '', 'fixture-inferred'));

const sheetDefs = [
  [SUMMARY_SHEET, 'สรุปยอดรวมต่อ Part Number (pivot/สูตรในเทมเพลต) แอปไม่เขียนทับสูตร'],
  ['By Plant', 'สรุปยอดแยกตามโรงงาน (pivot/สูตรในเทมเพลต)'],
  ['Monthly FC', 'ตารางพยากรณ์รายเดือนในเทมเพลต (อ้างถึงชีท Daily)'],
  ...DAILY_SHEETS.map((s) => [s, `ข้อมูลพยากรณ์ของโรงงาน ${s.replace(' Daily', '')} คัดลอก 1:1 จากไฟล์ต้นทาง หัวตารางแถว ${TEMPLATE.dailyHeaderRow} ข้อมูลเริ่มแถว ${TEMPLATE.dailyDataStartRow}`]),
  ['Total', 'ยอดรวมทุกโรงงาน (สูตรในเทมเพลต)'],
  [ANALYZE_SHEET, `ข้อมูลทุกโรงงานรวมเป็นตารางเดียวสำหรับ pivot หัวตารางแถว ${TEMPLATE.analyzeHeaderRow} ข้อมูลเริ่มแถว ${TEMPLATE.analyzeDataStartRow}`],
  ['Sheet1', 'ชีทเสริมของเทมเพลต (pivot) แอปไม่แตะ'],
  ['Sheet2', 'ชีทเสริมของเทมเพลต (pivot) แอปไม่แตะ'],
].map(([name, th]) => entry('sheet', `sheet-${slug(name)}`, name, th, '', '', 'fixture-inferred'));

export const GLOSSARY = [
  entry('month', 'n', 'N', 'เดือนผลิตปัจจุบัน (ตาม PRODUCTION MONTH ในไฟล์)', "Feb'26", 'Current month'),
  entry('month', 'n1', 'N+1', 'เดือนถัดไปอีก 1 เดือน', "Mar'26", 'Next month'),
  entry('month', 'n2', 'N+2', 'อีก 2 เดือนถัดจาก N', "Apr'26", 'Month +2'),
  entry('month', 'n3', 'N+3', 'อีก 3 เดือนถัดจาก N', "May'26", 'Month +3'),
  entry('month', 'production-month', 'PRODUCTION MONTH', 'เดือนผลิตแบบ YYYYMM ในหัวไฟล์ แอปใช้กำหนดป้ายเดือน N..N+3 ถ้าไฟล์ในชุดเดียวกันไม่ตรงกันจะเตือน', '202602', '', 'tmt-doc'),
  entry('month', 'issue-date', 'ISSUE DATE', 'วันที่ TMT ออกเอกสารพยากรณ์ (วัน/เดือน/ปี)', '23/01/2026', '', 'tmt-doc'),
  entry('month', 'revision', 'REVISION', 'REVISION TYPE / REVISION NUMBER บอกว่าเป็นฉบับแก้ไขครั้งที่เท่าไรและแก้แบบใด', 'M / 0', '', 'tmt-doc'),
  entry('month', 'forecast-type', 'FORECAST TYPE', 'ประเภทการพยากรณ์ในหัวไฟล์ (F ในไฟล์ตัวอย่าง) ความหมายตามเอกสาร TMT', 'F', '', 'fixture-inferred'),
  ...columnEntries,
  ...plantEntries,
  entry('file', 'part-type', 'PART TYPE', 'V = ชิ้นส่วนตัวรถ (veh), P = บรรจุภัณฑ์ (packing) ดูได้จากชื่อไฟล์ต้นทาง', 'V / P', '', 'fixture-inferred'),
  entry('file', 'file-name-rule', 'กติกาชื่อไฟล์', 'ชื่อไฟล์ต้องขึ้นต้น BP/BPK/GW/SR เพื่อให้แอปรู้ว่าเป็นของโรงงานใด', 'BPK packing 481D.xls', '', 'team'),
  ...sheetDefs,
  entry('supply', 'dock-vs-code', 'SHIPPING DOCK vs DOCK CODE', 'SHIPPING DOCK คือชื่อท่าตามเอกสาร ส่วน DOCK CODE คือรหัสท่าที่ใช้จัดกลุ่ม อาจมีหลาย SHIPPING DOCK ต่อ 1 DOCK CODE', '', '', 'fixture-inferred'),
  entry('supply', 'packing-usage', 'PACKING SIZE (การใช้งาน)', 'ยอดแผน ÷ PACKING SIZE ≈ จำนวนกล่อง ใช้ดูภาระการขนส่ง', '', '', 'team'),
  entry('supply', 'firm-vs-fc', 'Firm vs FC', 'Firm = ยอดที่ยืนยันแล้ว, FC (Forecast) = ยอดพยากรณ์ที่ยังเปลี่ยนได้ โดยทั่วไปเดือน N ใกล้เคียง Firm มากกว่า N+1..N+3', '', 'Firm / Forecast', 'team'),
  entry('supply', 'run-out', 'Run-out', 'ช่วงที่ชิ้นส่วนรุ่นเก่าใกล้ผลิตหมด (ยอด N+1..N+3 ลดลงเป็น 0) ใช้เฝ้าระวังก่อนหยุดสั่ง', '', 'Run-out', 'team'),
  entry('ui', 'matching', 'Matching', 'การจับคู่ Part Number เดียวกันที่ปรากฏในหลายโรงงาน', '', '', 'team'),
  entry('ui', 'overflow', 'แถวเกินตาราง', 'แถวข้อมูลที่เกินพื้นที่เหนือแถวสูตรของเทมเพลต แอปจะไม่เขียนทับสูตร', '', 'Overflow', 'team'),
];

const BY_KEY = new Map(GLOSSARY.map((e) => [e.key, e]));
export const getEntry = (key) => BY_KEY.get(key) || null;

/** Case-insensitive search over term/th/en/example. Empty query returns everything. */
export const searchGlossary = (q, list = GLOSSARY) => {
  const needle = String(q ?? '').trim().toLowerCase();
  if (!needle) return list;
  return list.filter((e) => `${e.term} ${e.th} ${e.en} ${e.example} ${e.key}`.toLowerCase().includes(needle));
};

/** Which template cells the app writes and which stay manual. Derived from constants. */
export const renderWritePlanSummary = () => ({
  writes: [
    ...DAILY_SHEETS.map((sheet) => ({
      sheet,
      text: `${sheet}: เขียนข้อมูลตั้งแต่แถว ${TEMPLATE.dailyDataStartRow} (หัวตารางแถว ${TEMPLATE.dailyHeaderRow}) เฉพาะเหนือแถวสูตรรวมด้านล่าง`,
    })),
    { sheet: ANALYZE_SHEET, text: `${ANALYZE_SHEET}: เขียนข้อมูลตั้งแต่แถว ${TEMPLATE.analyzeDataStartRow} (คอลัมน์ B เป็นต้นไป และคอลัมน์ Plant) ไม่แตะคอลัมน์สูตร key` },
  ],
  manual: [
    { sheet: SUMMARY_SHEET, text: `${SUMMARY_SHEET}, By Plant, Total, Sheet1/Sheet2: เป็น pivot/สูตร แอปไม่เขียนทับ ต้อง Refresh Pivot ใน Excel เอง` },
    { sheet: 'สูตร', text: 'เซลล์ที่มีสูตรทุกเซลล์ในเทมเพลตจะไม่ถูกเขียนทับ' },
  ],
});

/** Text of a tip for a glossary entry; month entries are prefixed with the resolved month label. */
export const tipText = (entry, { monthLabels } = {}) => {
  if (!entry) return '';
  const i = ['n', 'n1', 'n2', 'n3'].indexOf(entry.key);
  const label = i >= 0 && monthLabels?.[i] ? `${monthLabels[i]} — ` : '';
  return `${label}${entry.th}`;
};
