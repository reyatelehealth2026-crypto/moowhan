// "Sent" sign-off helpers (pure). The record lives in state.features['provenance-manifest'].sent.
import { MONTH_KEYS } from '../../constants.js';
import { shortHash } from '../../utils/hash.js';

/**
 * Signature of the data a sent file was built from: source files (id + hash), manual edits and totals.
 * It changes after an edit, a re-process with other inputs or a source change.
 */
export const dataSignature = ({ sourceFiles = [], changeLog = [], totals = null } = {}) =>
  [
    sourceFiles.map((f) => `${f.id}:${shortHash(f.sha256)}`).join(','),
    `edits:${changeLog.filter((l) => l.action === 'edit').length}`,
    MONTH_KEYS.map((k) => totals?.[k] ?? 0).join('/'),
  ].join('|');

export const makeSentRecord = ({ fileName, sha256, month, totals, rowCounts, note = '', by = '', now, dataSignature: signature }) => ({
  fileName: fileName || '',
  sha256: sha256 || 'n/a',
  month: month || '',
  totals: totals || null,
  rowCounts: rowCounts || null,
  note: String(note || '').trim(),
  by: String(by || '').trim(), // free text typed by the user, never auto-collected
  at: new Date(now ?? Date.now()).toISOString(),
  dataSignature: signature || '',
});

export const isStaleSent = (record, currentSignature) => !!record && record.dataSignature !== currentSignature;

const hhmm = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const sentChipText = (record, { stale = false } = {}) =>
  record ? `ส่งแล้ว ${hhmm(record.at)} · ${shortHash(record.sha256)}${stale ? ' (มีการแก้ไขหลังส่ง)' : ''}` : '';
