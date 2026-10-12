// ==================== PROFILE (pure, no DOM) ====================
// The single settings document of the app. Stored under moowhan.prefs.profile.v1 (see useProfileStore.js),
// exported/imported as JSON. Stamps are DATA only: the writer is the export gate / patcher via cellWrites.
import { PLANTS, PLANT_META, SOURCE_HEADERS, TEMPLATE, ANALYZE_SHEET, dailySheetName } from '../../constants.js';
import { getColumnIndex } from '../../utils/format.js';
import { normalizeCalendar } from './calendar.js';

export const PROFILE_SCHEMA_VERSION = 1;
export const PROFILE_STORAGE_KEY = 'profile.v1'; // registered in tier "prefs" => localStorage "moowhan.prefs.profile.v1"
export const MAX_PROFILE_BYTES = 64 * 1024;
/** Sheets that a stamp may target (never the formula/pivot sheets). */
export const WRITABLE_SHEETS = ['By Plant', ANALYZE_SHEET];
export const DEFAULT_FILE_NAME_PATTERN = 'Production_Updated_{monthLabel}_{date}.xlsx';
const SOURCE_PLANT_CODES = { BP: 'P', BPK: 'B', GW: 'G', SR: 'S' };
const TOP_KEYS = ['schemaVersion', 'plants', 'source', 'template', 'export', 'startTab', 'features', 'ui'];

export const DEFAULT_PROFILE = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  ui: { mode: 'advanced' },
  plants: PLANTS.map((code) => ({
    code,
    label: PLANT_META[code]?.label ?? code,
    filePrefixes: [`^${code}(?![A-Z])`],
    sourcePlantCode: SOURCE_PLANT_CODES[code] ?? code[0],
    dailySheet: dailySheetName(code),
    color: PLANT_META[code]?.color ?? '#64748b',
  })),
  source: { headerCell: SOURCE_HEADERS[0] },
  template: {
    analyzeSheet: ANALYZE_SHEET,
    plantColFallback: 'EH',
    capacityOverrides: {},
    stamps: [
      { sheet: 'By Plant', cell: 'C2', value: '', enabled: false },
      { sheet: 'By Plant', cell: 'C3', value: '', enabled: false },
      { sheet: ANALYZE_SHEET, cell: 'B1', value: '', enabled: false },
    ],
  },
  export: { fileNamePattern: DEFAULT_FILE_NAME_PATTERN, highlight: true, extraSheets: {} },
  startTab: 'upload',
  features: { calendar: { workingWeekdays: [1, 2, 3, 4, 5], scopes: { all: { holidays: [], extraWorkDays: [], shutdowns: [] } } } },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const defaultProfile = () => clone(DEFAULT_PROFILE);

/** Fills missing keys from the defaults (objects deep, arrays and scalars taken from the input as-is). */
export const mergeWithDefaults = (json) => {
  const input = isObj(json) ? json : {};
  const merge = (def, val) => {
    if (!isObj(def)) return val === undefined ? clone(def) : clone(val);
    if (!isObj(val)) return clone(def);
    const out = {};
    for (const k of new Set([...Object.keys(def), ...Object.keys(val)])) {
      out[k] = k in val ? (k in def ? merge(def[k], val[k]) : clone(val[k])) : clone(def[k]);
    }
    return out;
  };
  const out = merge(DEFAULT_PROFILE, input);
  // arrays are replaced wholesale, but plant entries still get their missing fields from the matching default plant
  if (Array.isArray(input.plants)) {
    out.plants = input.plants.map((p) => {
      const def = DEFAULT_PROFILE.plants.find((d) => d.code === p?.code);
      return isObj(p) ? { ...(def ? clone(def) : {}), ...clone(p) } : p;
    });
  }
  return out;
};

const byteLength = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length);
const A1 = /^[A-Z]{1,3}[1-9][0-9]{0,6}$/;

/**
 * validateProfile(json | text) -> { ok, errors: [Thai messages] }. Pure. A profile that fails must never
 * replace the active one (callers: setProfile only after ok).
 */
export const validateProfile = (input) => {
  const errors = [];
  const bad = (m) => errors.push(m);
  let p = input;
  if (typeof input === 'string') {
    if (byteLength(input) > MAX_PROFILE_BYTES) return { ok: false, errors: [`โปรไฟล์ใหญ่เกิน ${MAX_PROFILE_BYTES / 1024} KB`] };
    try { p = JSON.parse(input); } catch { return { ok: false, errors: ['ไฟล์โปรไฟล์ไม่ใช่ JSON ที่ถูกต้อง'] }; }
  } else {
    let size = 0;
    try { size = byteLength(JSON.stringify(input) ?? ''); } catch { return { ok: false, errors: ['โปรไฟล์ไม่ใช่ JSON ที่ถูกต้อง'] }; }
    if (size > MAX_PROFILE_BYTES) return { ok: false, errors: [`โปรไฟล์ใหญ่เกิน ${MAX_PROFILE_BYTES / 1024} KB`] };
  }
  if (!isObj(p)) return { ok: false, errors: ['โปรไฟล์ต้องเป็นออบเจ็กต์ JSON'] };

  if (p.schemaVersion !== PROFILE_SCHEMA_VERSION) bad(`ไม่รู้จัก schemaVersion "${p.schemaVersion}" (รองรับเฉพาะเวอร์ชัน ${PROFILE_SCHEMA_VERSION})`);
  Object.keys(p).filter((k) => !TOP_KEYS.includes(k)).forEach((k) => {
    bad(k === 'files' ? 'โปรไฟล์ห้ามมีคีย์ "files" (โปรไฟล์เก็บเฉพาะการตั้งค่า ไม่เก็บไฟล์)' : `ไม่รู้จักคีย์ระดับบน "${k}"`);
  });

  if (p.plants !== undefined) {
    if (!Array.isArray(p.plants) || !p.plants.length) bad('plants ต้องเป็นรายการโรงงานอย่างน้อย 1 โรงงาน');
    else {
      const codes = new Set(); const sheets = new Set();
      p.plants.forEach((pl, i) => {
        const at = `โรงงานลำดับที่ ${i + 1}`;
        if (!isObj(pl)) { bad(`${at}: รูปแบบไม่ถูกต้อง`); return; }
        const code = typeof pl.code === 'string' ? pl.code.trim() : '';
        if (!code) bad(`${at}: ต้องระบุรหัสโรงงาน`);
        else if (codes.has(code.toUpperCase())) bad(`รหัสโรงงาน "${code}" ซ้ำกัน`);
        codes.add(code.toUpperCase());
        const sheet = typeof pl.dailySheet === 'string' ? pl.dailySheet.trim() : '';
        if (!sheet) bad(`${at}: ต้องระบุชื่อชีต Daily`);
        else if (sheet.length > 31) bad(`${at}: ชื่อชีต "${sheet}" ยาวเกิน 31 ตัวอักษร`);
        else if (sheets.has(sheet.toLowerCase())) bad(`ชื่อชีต Daily "${sheet}" ซ้ำกัน`);
        sheets.add(sheet.toLowerCase());
        if (!Array.isArray(pl.filePrefixes) || !pl.filePrefixes.length || pl.filePrefixes.some((x) => typeof x !== 'string' || !x.trim())) {
          bad(`${at}${code ? ` (${code})` : ''}: ต้องมี filePrefixes อย่างน้อย 1 รายการ และห้ามเว้นว่าง`);
        } else {
          pl.filePrefixes.forEach((x) => { try { new RegExp(x); } catch { bad(`${at}${code ? ` (${code})` : ''}: รูปแบบชื่อไฟล์ "${x}" ไม่ใช่ regex ที่ถูกต้อง`); } });
        }
      });
    }
  }
  if (p.source !== undefined && (!isObj(p.source) || (p.source.headerCell !== undefined && (typeof p.source.headerCell !== 'string' || !p.source.headerCell.trim())))) bad('source.headerCell ต้องเป็นข้อความที่ไม่ว่าง');

  if (p.template !== undefined) {
    const t = p.template;
    if (!isObj(t)) bad('template ต้องเป็นออบเจ็กต์');
    else {
      if (t.analyzeSheet !== undefined && (typeof t.analyzeSheet !== 'string' || !t.analyzeSheet.trim() || t.analyzeSheet.length > 31)) bad('template.analyzeSheet ต้องเป็นชื่อชีตไม่เกิน 31 ตัวอักษร');
      if (t.plantColFallback !== undefined && !/^[A-Z]{1,3}$/.test(String(t.plantColFallback))) bad('template.plantColFallback ต้องเป็นตัวอักษรคอลัมน์ เช่น EH');
      if (t.capacityOverrides !== undefined) {
        if (!isObj(t.capacityOverrides) || Object.values(t.capacityOverrides).some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) bad('template.capacityOverrides ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      }
      if (t.stamps !== undefined) {
        if (!Array.isArray(t.stamps)) bad('template.stamps ต้องเป็นรายการ');
        else t.stamps.forEach((s, i) => {
          if (!isObj(s)) { bad(`stamp ลำดับที่ ${i + 1} รูปแบบไม่ถูกต้อง`); return; }
          if (!WRITABLE_SHEETS.includes(s.sheet)) bad(`stamp ลำดับที่ ${i + 1}: ชีต "${s.sheet}" ไม่อยู่ในชีตที่เขียนได้ (${WRITABLE_SHEETS.join(', ')})`);
          if (!A1.test(String(s.cell ?? ''))) bad(`stamp ลำดับที่ ${i + 1}: เซลล์ "${s.cell}" ไม่ถูกต้อง (เช่น C2)`);
        });
      }
    }
  }
  if (p.export !== undefined) {
    const e = p.export;
    if (!isObj(e)) bad('export ต้องเป็นออบเจ็กต์');
    else {
      if (e.fileNamePattern !== undefined && (typeof e.fileNamePattern !== 'string' || !e.fileNamePattern.trim() || e.fileNamePattern.length > 150)) bad('export.fileNamePattern ต้องเป็นข้อความที่ไม่ว่างและไม่เกิน 150 ตัวอักษร');
      if (e.highlight !== undefined && typeof e.highlight !== 'boolean') bad('export.highlight ต้องเป็นจริง/เท็จ');
      if (e.extraSheets !== undefined && !isObj(e.extraSheets)) bad('export.extraSheets ต้องเป็นออบเจ็กต์');
    }
  }
  if (p.startTab !== undefined && (typeof p.startTab !== 'string' || !p.startTab.trim())) bad('startTab ต้องเป็นรหัสแท็บ');
  if (p.ui !== undefined && !isObj(p.ui)) bad('ui ต้องเป็นออบเจ็กต์');
  if (p.features !== undefined) {
    if (!isObj(p.features)) bad('features ต้องเป็นออบเจ็กต์');
    else if (p.features.calendar !== undefined) normalizeCalendar(p.features.calendar).errors.forEach(bad);
  }
  return { ok: errors.length === 0, errors };
};

/** Pretty JSON of a profile (what the "ส่งออกโปรไฟล์" button downloads). */
export const exportProfile = (profile) => JSON.stringify(profile, null, 2);

/** Parses, validates and fills defaults. Never throws; { ok:false, errors } leaves the active profile alone. */
export const importProfile = (text) => {
  const v = validateProfile(text);
  if (!v.ok) return { ok: false, profile: null, errors: v.errors };
  return { ok: true, profile: mergeWithDefaults(JSON.parse(text)), errors: [] };
};

/** Column number (1-based) of template.plantColFallback, defaulting to the constants.js value. */
export const plantColumnFallback = (profile) => {
  const letters = profile?.template?.plantColFallback;
  return /^[A-Z]{1,3}$/.test(letters || '') ? getColumnIndex(letters) : TEMPLATE.analyzePlantCol;
};
