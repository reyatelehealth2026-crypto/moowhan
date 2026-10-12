// ==================== FILE -> PLANT ====================
// Kept free of xlsx imports so the UI can use it without loading the heavy libs.
import { PLANTS } from '../../constants.js';

// "BPK packing 481D.xls" -> "BPK", "BP veh 481D.xls" -> "BP", other -> null
export const categorizeFile = (filename) => {
  const name = String(filename || '').toUpperCase();
  // Longest prefix first so "BPK" is not mistaken for "BP".
  const ordered = [...PLANTS].sort((a, b) => b.length - a.length);
  return ordered.find((p) => new RegExp(`^${p}(?![A-Z])`).test(name)) || null;
};
