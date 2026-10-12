// Validator for the JSON export: a tiny JSON-Schema subset checker (type, const, required, properties,
// items, min/max, minItems/maxItems, oneOf, $ref to #/$defs) so no validator dependency is needed.
import schema from '../../../docs/schema/flat-export.schema.json';
import { SCHEMA_VERSION } from './logic.js';

const typeOk = (t, v) => {
  switch (t) {
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    default: return typeof v === t;
  }
};

export const validateAgainstSchema = (value, node = schema, root = schema, path = '$') => {
  const errors = [];
  if (node.$ref) return validateAgainstSchema(value, node.$ref.split('/').slice(1).reduce((o, k) => o?.[k], root), root, path);
  if (node.oneOf) {
    const hits = node.oneOf.filter((s) => validateAgainstSchema(value, s, root, path).length === 0).length;
    if (hits !== 1) errors.push(`${path}: ไม่ตรงกับรูปแบบที่กำหนด`);
    return errors;
  }
  if ('const' in node && value !== node.const) errors.push(`${path}: ต้องเป็น ${JSON.stringify(node.const)}`);
  if (node.type && !typeOk(node.type, value)) return [...errors, `${path}: ชนิดข้อมูลต้องเป็น ${node.type}`];
  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${path}: ต้องไม่ต่ำกว่า ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) errors.push(`${path}: ต้องไม่เกิน ${node.maximum}`);
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${path}: ต้องมีอย่างน้อย ${node.minItems} รายการ`);
    if (node.maxItems !== undefined && value.length > node.maxItems) errors.push(`${path}: ต้องมีไม่เกิน ${node.maxItems} รายการ`);
    if (node.items) value.forEach((v, i) => errors.push(...validateAgainstSchema(v, node.items, root, `${path}[${i}]`)));
  }
  if (node.type === 'object' && typeOk('object', value)) {
    (node.required || []).forEach((k) => { if (!(k in value)) errors.push(`${path}.${k}: ไม่พบฟิลด์ที่จำเป็น`); });
    Object.entries(node.properties || {}).forEach(([k, s]) => { if (k in value) errors.push(...validateAgainstSchema(value[k], s, root, `${path}.${k}`)); });
  }
  return errors;
};

/** { ok, errors[] }. A higher schemaVersion is rejected first with a Thai message asking to update the app. */
export const validateExport = (doc) => {
  const v = doc?.schemaVersion;
  if (Number.isInteger(v) && v > SCHEMA_VERSION) {
    return { ok: false, errors: [`ไฟล์นี้สร้างจากเวอร์ชันใหม่กว่า (schema ${v}) กรุณาอัปเดตแอป`] };
  }
  const errors = validateAgainstSchema(doc);
  return { ok: errors.length === 0, errors };
};
