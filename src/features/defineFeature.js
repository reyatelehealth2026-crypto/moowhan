// ==================== FEATURE CONTRACT ====================
// defineFeature(spec) validates a feature module when it is evaluated.
// See the JSDoc in ./index.js for the full contract.

export const GROUPS = ['core', 'ตรวจสอบ', 'วิเคราะห์', 'ประวัติ', 'ตั้งค่า'];
export const DEFAULT_GROUP = 'วิเคราะห์';
export const GROUP_BANDS = {
  core: [10, 49],
  ตรวจสอบ: [50, 69],
  วิเคราะห์: [70, 89],
  ประวัติ: [90, 94],
  ตั้งค่า: [95, 99],
};
export const KNOWN_KEYS = [
  'id', 'order', 'group', 'description', 'tab', 'headerActions', 'exportSheets', 'exportCellWrites',
  'validate', 'beforeExport', 'onProcessed', 'onExported', 'expandFiles', 'slots', 'settings',
];
const FN_KEYS = ['headerActions', 'exportSheets', 'exportCellWrites', 'validate', 'beforeExport', 'onProcessed', 'onExported', 'expandFiles'];
const TAB_KEYS = ['label', 'Icon', 'enabled', 'tooltip', 'badge', 'Component', 'emptyState'];
const SLOT_KEYS = ['banner', 'uploadPanel'];
const SETTINGS_KEYS = ['defaults', 'Component', 'schema'];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isDev = () => {
  try { return !!import.meta.env?.DEV; } catch { return false; }
};

/** Returns a list of Thai error messages (empty = valid). Pure. */
export const validateFeature = (spec) => {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['ฟีเจอร์ต้องเป็นออบเจ็กต์'];
  const name = spec.id ? `"${spec.id}"` : '(ไม่มี id)';
  const bad = (msg) => errors.push(`ฟีเจอร์ ${name}: ${msg}`);

  if (typeof spec.id !== 'string' || !ID_RE.test(spec.id)) bad('id ต้องเป็นตัวพิมพ์เล็กคั่นด้วยขีดกลาง (kebab-case) เช่น "dock-analysis"');
  Object.keys(spec).filter((k) => !KNOWN_KEYS.includes(k)).forEach((k) => bad(`ไม่รู้จักคีย์ "${k}" (ที่รองรับ: ${KNOWN_KEYS.join(', ')})`));

  const group = spec.group ?? DEFAULT_GROUP;
  if (!GROUPS.includes(group)) bad(`group "${group}" ไม่ถูกต้อง (ใช้ได้: ${GROUPS.join(', ')})`);
  if (typeof spec.order !== 'number' || !Number.isFinite(spec.order)) bad('ต้องระบุ order เป็นตัวเลข');
  else if (GROUP_BANDS[group]) {
    const [lo, hi] = GROUP_BANDS[group];
    if (spec.order < lo || spec.order > hi) bad(`order ${spec.order} อยู่นอกช่วงของกลุ่ม "${group}" (${lo}-${hi})`);
  }

  FN_KEYS.forEach((k) => { if (spec[k] !== undefined && typeof spec[k] !== 'function') bad(`"${k}" ต้องเป็นฟังก์ชัน`); });

  if (spec.tab !== undefined) {
    const t = spec.tab;
    if (!t || typeof t !== 'object') bad('tab ต้องเป็นออบเจ็กต์');
    else {
      Object.keys(t).filter((k) => !TAB_KEYS.includes(k)).forEach((k) => bad(`tab ไม่รู้จักคีย์ "${k}"`));
      if (typeof t.label !== 'string' || !t.label.trim()) bad('tab.label ต้องเป็นข้อความ');
      if (!t.Component) bad('tab.Component จำเป็นต้องมี');
    }
  }
  if (spec.slots !== undefined) {
    if (!spec.slots || typeof spec.slots !== 'object') bad('slots ต้องเป็นออบเจ็กต์');
    else Object.keys(spec.slots).forEach((k) => { if (!SLOT_KEYS.includes(k)) bad(`slots ไม่รู้จักคีย์ "${k}"`); else if (typeof spec.slots[k] !== 'function') bad(`slots.${k} ต้องเป็นฟังก์ชัน`); });
  }
  if (spec.settings !== undefined) {
    if (!spec.settings || typeof spec.settings !== 'object') bad('settings ต้องเป็นออบเจ็กต์');
    else Object.keys(spec.settings).filter((k) => !SETTINGS_KEYS.includes(k)).forEach((k) => bad(`settings ไม่รู้จักคีย์ "${k}"`));
  }
  return errors;
};

/** Validates a whole list: each spec plus unique ids. */
export const validateFeatureList = (list) => {
  const errors = [];
  const seen = new Set();
  list.forEach((f) => {
    errors.push(...validateFeature(f));
    if (f?.id && seen.has(f.id)) errors.push(`ฟีเจอร์ "${f.id}": id ซ้ำกับฟีเจอร์อื่น`);
    seen.add(f?.id);
  });
  return errors;
};

/**
 * Validate and normalise a feature (adds the default group).
 * DEV: throws a Thai Error. Otherwise warns and returns null (the registry excludes it).
 * `opts.dev` overrides the environment (used by tests).
 */
export const defineFeature = (spec, opts = {}) => {
  const errors = validateFeature(spec);
  if (errors.length) {
    const message = errors.join('\n');
    if (opts.dev ?? isDev()) throw new Error(message);
    console.warn(`features: ข้ามฟีเจอร์ที่ไม่ถูกต้อง\n${message}`);
    return null;
  }
  return { ...spec, group: spec.group ?? DEFAULT_GROUP };
};

export default defineFeature;
