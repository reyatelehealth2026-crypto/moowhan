// qa-file-guards: pure logic (no DOM/React). Duplicate files, revision comparison, expected-file checklist,
// Part+Dock duplicate keys and Firm/FC horizon info. Rules that feed the QA engine live in rules.js.
//
// A "file" here is a state.sourceFiles entry:
//   { id, name, category, size, file?, sha256?, rowsHash?, meta?: { partType, revision, issueDate, productionMonthRaw, forecastType } }

const squash = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const plantOf = (f) => f.category || f.plant || '';
const typeOf = (f) => f.meta?.partType || f.partType || '';

export const PART_TYPE_LABEL = { V: 'Vehicle', P: 'Packing' };
const SHORT_TYPE = { V: 'veh', P: 'packing' };

/** "GW veh DG7.xls" -> 'V', "BPK packing 481D.xls" -> 'P', otherwise '' */
export const partTypeFromName = (name) => {
  const n = String(name || '').toLowerCase();
  if (/\bveh/.test(n)) return 'V';
  if (/\bpack/.test(n)) return 'P';
  return '';
};

/** "23/01/2026" | "2026-01-23" -> timestamp (ms) or NaN */
export const parseIssueDate = (s) => {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return NaN;
};

const revNum = (f) => {
  const n = Number(String(f.meta?.revision ?? '').trim());
  return String(f.meta?.revision ?? '').trim() === '' || !Number.isFinite(n) ? NaN : n;
};
const stamp = (f) => { const t = parseIssueDate(f.meta?.issueDate); return t; };
const modified = (f) => Number(f.lastModified ?? f.file?.lastModified) || 0;

/** Compare two files; > 0 when a is newer. Revision number > issue date > file lastModified. */
const newness = (a, b) => {
  const ra = revNum(a); const rb = revNum(b);
  if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
  const da = stamp(a); const db = stamp(b);
  if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
  return modified(a) - modified(b);
};

/** The newer of two files (ties: b, the one added later). */
export const resolveNewer = (a, b) => (newness(a, b) > 0 ? a : b);

/**
 * Files whose content equals an earlier file under a different name.
 * Same sha256 (any plant) or same rowsHash within the same plant. -> [{ id, name, duplicateOf, duplicateOfId, reason }]
 */
export const findDuplicateFiles = (files = []) => {
  const bySha = new Map(); const byRows = new Map(); const out = [];
  files.forEach((f) => {
    const sha = f.sha256 && f.sha256 !== 'n/a' ? f.sha256 : '';
    const rowsKey = f.rowsHash ? `${plantOf(f)}|${f.rowsHash}` : '';
    const first = (sha && bySha.get(sha)) || (rowsKey && byRows.get(rowsKey)) || null;
    if (first && first.name !== f.name) {
      out.push({ id: f.id, name: f.name, duplicateOf: first.name, duplicateOfId: first.id, reason: sha && bySha.get(sha) ? 'sha256' : 'rows' });
      return; // a duplicate never becomes the reference of later files
    }
    if (sha && !bySha.has(sha)) bySha.set(sha, f);
    if (rowsKey && !byRows.has(rowsKey)) byRows.set(rowsKey, f);
  });
  return out;
};

/**
 * Same plant + part type + production month with different revision / issue date -> the older files.
 * [{ id, name, plant, partType, revision, newerId, newerName, newerRevision }]
 */
export const compareRevisions = (files = []) => {
  const groups = new Map();
  files.filter((f) => f.meta).forEach((f) => {
    const key = `${plantOf(f)}|${typeOf(f)}|${f.meta.productionMonthRaw || ''}`;
    groups.set(key, [...(groups.get(key) || []), f]);
  });
  const out = [];
  groups.forEach((list) => {
    if (list.length < 2) return;
    const sig = (f) => `${f.meta.revision ?? ''}|${f.meta.issueDate ?? ''}`;
    if (new Set(list.map(sig)).size < 2) return;
    const newest = list.reduce((best, f) => (newness(f, best) > 0 ? f : best));
    list.forEach((f) => {
      if (f === newest || sig(f) === sig(newest)) return;
      out.push({
        id: f.id, name: f.name, plant: plantOf(f), partType: typeOf(f), revision: f.meta.revision ?? '', issueDate: f.meta.issueDate ?? '',
        newerId: newest.id, newerName: newest.name, newerRevision: newest.meta.revision ?? '', newerIssueDate: newest.meta.issueDate ?? '',
      });
    });
  });
  return out;
};

/** "GW veh" / "BPK packing" / "SR" */
export const expectedLabel = (plant, partType) => [plant, SHORT_TYPE[partType]].filter(Boolean).join(' ');

/**
 * Files of the previous run vs the current upload -> [{ plant, partType, label, present }].
 * A previous entry without part type matches by plant only.
 */
export const expectedFilesChecklist = (prevSnapshotFiles = [], currentFiles = []) => {
  const seen = new Map();
  prevSnapshotFiles.forEach((p) => {
    const plant = p.plant || p.category;
    if (!plant) return;
    const partType = p.partType || partTypeFromName(p.name);
    seen.set(`${plant}|${partType}`, { plant, partType });
  });
  return [...seen.values()].map(({ plant, partType }) => ({
    plant, partType, label: expectedLabel(plant, partType),
    present: currentFiles.some((c) => plantOf(c) === plant && (!partType || !typeOf(c) || typeOf(c) === partType)),
  }));
};

/**
 * Rows sharing plant + Part Number + DOCK CODE. `entries` = qa-engine ctx.entries ({ row, plant, ... }).
 * The first occurrence is kept; later ones are D02 (from another file) or D03 (same file). DOCK CODE is part of the key
 * so BPK 0K051 on dock BN and D1 is not flagged.
 */
export const findDuplicateKeys = (entries = []) => {
  const first = new Map(); const out = [];
  entries.forEach((e) => {
    const key = `${e.plant}|${squash(e.row.partNumber)}|${squash(e.row.dockCode)}`;
    const prev = first.get(key);
    if (!prev) { first.set(key, e); return; }
    out.push({ rule: prev.row.fileName === e.row.fileName ? 'D03' : 'D02', entry: e, firstEntry: prev });
  });
  return out;
};

/**
 * Firm/FC badges. `firm` = every known file is forecastType F; `others` = distinct other forecast types.
 */
export const horizonInfo = (sourceFiles = []) => {
  const types = sourceFiles.map((f) => String(f.meta?.forecastType ?? '').trim().toUpperCase()).filter(Boolean);
  const others = [...new Set(types.filter((t) => t !== 'F'))];
  return { known: types.length > 0, firm: types.length > 0 && others.length === 0, others };
};

/** Chip text for a file card: "เดือน 202602 · ออก 23/01/2026 · Rev 0 · Vehicle · F · 12 แถว" */
export const fileMetaParts = (f) => {
  const m = f.meta || {};
  const rows = f.rowCount ?? f.rows;
  return [
    m.productionMonthRaw && `เดือน ${m.productionMonthRaw}`,
    m.issueDate && `ออก ${m.issueDate}`,
    m.revision !== undefined && m.revision !== '' && `Rev ${m.revision}`,
    PART_TYPE_LABEL[m.partType],
    m.forecastType,
    rows > 0 && `${rows} แถว`,
  ].filter(Boolean);
};
