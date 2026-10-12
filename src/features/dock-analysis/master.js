// ==================== DOCK MASTER (alias / packing type override / boxes per pallet) ====================
export const STORAGE_KEY = 'moowhan.dockAnalysis.v1';
export const MAX_BYTES = 200 * 1024;
export const MAX_STR = 40;
export const MAX_DOCKS = 100;
export const MAX_PALLETS = 2000;

export const emptyMaster = () => ({ docks: {}, pallets: {} });

const isStr = (v) => typeof v === 'string' && v.length <= MAX_STR;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10000;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const fail = (error) => ({ ok: false, error, master: emptyMaster() });

/** Validates a parsed master. Never throws. */
export const validateMaster = (obj) => {
  if (!isObj(obj)) return fail('ไฟล์ตั้งค่าไม่ถูกต้อง: ต้องเป็นออบเจ็กต์ JSON ที่มี docks และ pallets');
  const docks = obj.docks ?? {};
  const pallets = obj.pallets ?? {};
  if (!isObj(docks) || !isObj(pallets)) return fail('ไฟล์ตั้งค่าไม่ถูกต้อง: docks และ pallets ต้องเป็นออบเจ็กต์');
  if (Object.keys(docks).length > MAX_DOCKS) return fail(`มี Dock เกิน ${MAX_DOCKS} รายการ`);
  if (Object.keys(pallets).length > MAX_PALLETS) return fail(`มีค่ากล่องต่อพาเลทเกิน ${MAX_PALLETS} รายการ`);
  const out = emptyMaster();
  for (const [k, v] of Object.entries(docks)) {
    if (!isStr(k) || !isObj(v)) return fail(`ข้อมูล Dock "${String(k).slice(0, 20)}" ไม่ถูกต้อง`);
    const e = {};
    if (v.alias !== undefined && v.alias !== '') { if (!isStr(v.alias)) return fail(`ชื่อเรียกของ Dock "${k}" ต้องเป็นข้อความไม่เกิน ${MAX_STR} ตัวอักษร`); e.alias = v.alias; }
    if (v.packingType !== undefined && v.packingType !== '') { if (!isStr(v.packingType)) return fail(`Packing Type ของ Dock "${k}" ต้องเป็นข้อความไม่เกิน ${MAX_STR} ตัวอักษร`); e.packingType = v.packingType; }
    if (e.alias || e.packingType) out.docks[k] = e;
  }
  for (const [k, v] of Object.entries(pallets)) {
    if (!isStr(k) || !isNum(v)) return fail(`ค่ากล่องต่อพาเลทของ "${String(k).slice(0, 30)}" ต้องเป็นตัวเลข 1 ถึง 10000`);
    out.pallets[k] = v;
  }
  return { ok: true, master: out, error: null };
};

/** Parses JSON text (size capped). Corrupt input -> ok:false + empty master + Thai message. */
export const parseMasterJson = (text) => {
  if (typeof text !== 'string') return fail('อ่านไฟล์ตั้งค่าไม่ได้');
  if (text.length > MAX_BYTES) return fail('ไฟล์ตั้งค่าใหญ่เกิน 200KB จึงไม่นำเข้า');
  let obj;
  try { obj = JSON.parse(text); } catch { return fail('ไฟล์ตั้งค่าเสียหายหรือไม่ใช่ JSON กรุณาตรวจสอบไฟล์'); }
  return validateMaster(obj);
};

export const exportMasterJson = (master) => JSON.stringify({ docks: master?.docks || {}, pallets: master?.pallets || {} }, null, 2);

const defaultStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export const loadMaster = (storage = defaultStorage()) => {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? parseMasterJson(raw).master : emptyMaster();
  } catch { return emptyMaster(); }
};

export const saveMaster = (master, storage = defaultStorage()) => {
  try { storage?.setItem(STORAGE_KEY, exportMasterJson(master)); return true; } catch { return false; }
};

/** "BN (CPN-TP)" when an alias exists, otherwise just the dock code. */
export const dockLabel = (master, plant, dockCode) => {
  const code = String(dockCode ?? '').trim() || '-';
  const alias = master?.docks?.[`${plant}|${String(dockCode ?? '').trim()}`]?.alias;
  return alias ? `${code} (${alias})` : code;
};

export const setDock = (master, key, patch) => {
  const cur = { ...(master.docks[key] || {}), ...patch };
  const docks = { ...master.docks };
  if (cur.alias || cur.packingType) docks[key] = cur; else delete docks[key];
  return { ...master, docks };
};

export const setPallet = (master, key, value) => {
  const pallets = { ...master.pallets };
  if (value === '' || value === null || value === undefined) delete pallets[key]; else pallets[key] = Number(value);
  return { ...master, pallets };
};
