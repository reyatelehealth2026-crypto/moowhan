import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, inspectSourceBuffer, fingerprintRows, categorizeFile } from '../src/lib/excel/index.js';
import { sha256Hex } from '../src/features/qa-file-guards/hash.js';
import {
  findDuplicateFiles, compareRevisions, resolveNewer, expectedFilesChecklist, horizonInfo, findDuplicateKeys, partTypeFromName,
  setPreviousFilesProvider, refreshPreviousFiles, getPreviousFiles,
} from '../src/features/qa-file-guards/logic.js';
import feature from '../src/features/qa-file-guards/index.jsx';
import { runRules } from '../src/features/qa-engine/engine.js';
import { countByLevel } from '../src/features/qa-engine/model.js';
import { HORIZON_META } from '../src/constants.js';

const PM = { year: 2026, month: 2 };
const TODAY = new Date(2026, 1, 10);
const nameOf = (f) => f.split('/')[1];

// Build state like useConsolidator does (inspect + process); `extra` = [{ from: fixture path, as: new name, mutate? }]
const build = async (extra = []) => {
  const data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  const files = [];
  const list = [...SOURCE_FILES.map((f) => ({ from: f, as: nameOf(f) })), ...extra];
  for (const [fi, item] of list.entries()) {
    const buf = fixture(item.from);
    const info = inspectSourceBuffer(buf);
    const category = categorizeFile(item.as);
    const meta = item.meta ? { ...info.meta, ...item.meta } : info.meta;
    files.push({ id: `f${fi}`, name: item.as, category, status: 'done', rowCount: info.rowCount, meta, sha256: await sha256Hex(buf), rowsHash: info.fingerprint, lastModified: item.lastModified });
    info.rows.forEach((r, i) => Object.assign(r, { id: `f${fi}-${i}`, plant: category, fileName: item.as, partType: meta.partType }));
    data[`${category} Daily`].push(...info.rows);
  }
  return { data, files };
};
const run = (b, over = {}) => runRules({ processedData: b.data, sourceFiles: b.files, productionMonth: PM, today: TODAY, ...over });
const ofRule = (issues, r) => issues.filter((i) => i.rule === r);

let base;
beforeAll(async () => { base = await build(); });

describe('readSource metadata + fingerprint', () => {
  it('reads partType / revisionType / wocWeek on all 5 fixtures', () => {
    const want = { 'BP veh 481D.xls': 'V', 'BPK packing 481D.xls': 'P', 'GW packing B-MPV.xls': 'P', 'GW veh DG7.xls': 'V', 'SR veh 481D.xls': 'V' };
    SOURCE_FILES.forEach((f) => {
      const { meta } = readSourceBuffer(fixture(f));
      expect(meta.partType).toBe(want[nameOf(f)]);
      expect(meta.revisionType).toBe('M');
      expect(meta.wocWeek).toBe('00-00');
    });
  });

  it('defaults to empty strings when the header lines are missing', () => {
    const aoa = [['PART NUMBER', 'PART CODE', 'PART DESC', 'SUPP CODE', 'SHIPPING DOCK', 'DOCK CODE', 'CAR FAMILY', 'PACKING SIZE']];
    // extractSourceRows is exercised through the real fixtures; here only the metadata reader
    return import('../src/lib/excel/readSource.js').then(({ readMetadata }) => {
      const m = readMetadata([['PRODUCTION MONTH', '202602'], ...aoa], 1);
      expect(m.partType).toBe('');
      expect(m.revisionType).toBe('');
      expect(m.wocWeek).toBe('');
    });
  });

  it('fingerprintRows ignores PART DESC / spacing and changes when N changes', () => {
    const rows = readSourceBuffer(fixture(SOURCE_FILES[1])).rows;
    const same = rows.map((r) => ({ ...r, partDesc: `  ${r.partDesc}   x  `, partNumber: ` ${r.partNumber.toLowerCase()} ` }));
    expect(fingerprintRows(same)).toBe(fingerprintRows(rows));
    const changed = rows.map((r, i) => (i === 0 ? { ...r, n: r.n + 1 } : r));
    expect(fingerprintRows(changed)).not.toBe(fingerprintRows(rows));
  });

  it('inspectSourceBuffer returns meta, rowCount, rows and fingerprint from one parse', () => {
    const info = inspectSourceBuffer(fixture(SOURCE_FILES[1]));
    expect(info.rowCount).toBe(12);
    expect(info.rows).toHaveLength(12);
    expect(info.meta.productionMonthRaw).toBe('202602');
    expect(info.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('sha256Hex', () => {
  it('is stable for the same bytes and differs for others', async () => {
    const a = await sha256Hex(fixture(SOURCE_FILES[0]));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(fixture(SOURCE_FILES[0]))).toBe(a);
    expect(await sha256Hex(fixture(SOURCE_FILES[1]))).not.toBe(a);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('duplicate guards on fixtures', () => {
  it('normal fixtures raise no D/F issue (BPK 0K051 BN/D1 is not flagged)', () => {
    const issues = run(base);
    expect(issues.filter((i) => /^(D0|F0)/.test(i.rule))).toEqual([]);
    expect(countByLevel(issues).error).toBe(0);
  });

  it('BPK packing uploaded twice -> D01 x1 and D02 x12', async () => {
    const dup = await build([{ from: SOURCE_FILES[1], as: 'BPK packing 481D (copy).xls' }]);
    expect(findDuplicateFiles(dup.files)).toMatchObject([{ name: 'BPK packing 481D (copy).xls', duplicateOf: 'BPK packing 481D.xls', reason: 'sha256' }]);
    const issues = run(dup);
    const d01 = ofRule(issues, 'D01');
    expect(d01).toHaveLength(1);
    expect(d01[0].level).toBe('error');
    expect(d01[0].action).toMatchObject({ kind: 'removeFile', payload: { name: 'BPK packing 481D (copy).xls' } });
    expect(ofRule(issues, 'D02')).toHaveLength(12);
    expect(ofRule(issues, 'D03')).toHaveLength(0);
  });

  it('removing the duplicate restores N of 86790-0K051-00 = 9673', async () => {
    const dup = await build([{ from: SOURCE_FILES[1], as: 'BPK packing 481D (copy).xls' }]);
    const sumN = (b) => Object.values(b.data).flat().filter((r) => r.partNumber === '86790-0K051-00').reduce((a, r) => a + r.n, 0);
    expect(sumN(dup)).toBeGreaterThan(9673);
    const cleaned = { data: structuredClone(dup.data), files: dup.files.filter((f) => !f.name.includes('(copy)')) };
    Object.keys(cleaned.data).forEach((k) => { cleaned.data[k] = cleaned.data[k].filter((r) => !r.fileName.includes('(copy)')); });
    expect(sumN(cleaned)).toBe(9673);
    expect(run(cleaned).filter((i) => /^D0/.test(i.rule))).toEqual([]);
  });

  it('same rows in one file -> D03 warning, not D02', () => {
    const e = (fileName, n) => ({ plant: 'BP', row: { partNumber: 'A', dockCode: 'D1', fileName }, rowNumber: n });
    expect(findDuplicateKeys([e('a.xls', 14), e('a.xls', 15)]).map((d) => d.rule)).toEqual(['D03']);
    expect(findDuplicateKeys([e('a.xls', 14), e('b.xls', 14)]).map((d) => d.rule)).toEqual(['D02']);
    const dock = (d) => ({ plant: 'BPK', row: { partNumber: '86790-0K051-00', dockCode: d, fileName: 'x' }, rowNumber: 1 });
    expect(findDuplicateKeys([dock('BN'), dock('D1')])).toEqual([]);
  });
});

describe('revisions', () => {
  it('BP with revision 0 and 1 -> D04 on rev 0 and resolveNewer picks rev 1', async () => {
    const b = await build([{ from: SOURCE_FILES[0], as: 'BP veh 481D rev1.xls', meta: { revision: '1' } }]);
    const [rev0, rev1] = [b.files.find((f) => f.name === 'BP veh 481D.xls'), b.files.find((f) => f.name === 'BP veh 481D rev1.xls')];
    expect(compareRevisions(b.files)).toMatchObject([{ name: 'BP veh 481D.xls', newerName: 'BP veh 481D rev1.xls' }]);
    expect(resolveNewer(rev0, rev1)).toBe(rev1);
    expect(resolveNewer(rev1, rev0)).toBe(rev1);
    const d04 = ofRule(run(b), 'D04');
    expect(d04).toHaveLength(1);
    expect(d04[0]).toMatchObject({ level: 'warning', fileName: 'BP veh 481D.xls', action: { kind: 'useNewer' } });
  });

  it('issue date and lastModified break ties after revision', () => {
    const f = (revision, issueDate, lastModified) => ({ meta: { revision, issueDate }, lastModified });
    expect(resolveNewer(f('0', '23/01/2026'), f('0', '30/01/2026'))).toMatchObject({ meta: { issueDate: '30/01/2026' } });
    const a = f('0', '23/01/2026', 5); const b = f('0', '23/01/2026', 9);
    expect(resolveNewer(a, b)).toBe(b);
    expect(resolveNewer(b, a)).toBe(b);
  });
});

describe('expected files', () => {
  const prev = [
    { name: 'BP veh 481D.xls', plant: 'BP', partType: 'V' }, { name: 'GW veh DG7.xls', plant: 'GW', partType: 'V' },
    { name: 'GW packing B-MPV.xls', plant: 'GW' }, // part type inferred from the name
  ];
  it('flags the missing GW veh file (F01) and ticks the rest', () => {
    const cur = base.files.filter((f) => f.name !== 'GW veh DG7.xls');
    const list = expectedFilesChecklist(prev, cur);
    expect(list.find((c) => c.label === 'GW veh').present).toBe(false);
    expect(list.filter((c) => c.present).map((c) => c.label)).toEqual(['BP veh', 'GW packing']);
    const issues = run({ ...base, files: cur }, { settings: { previousFiles: prev } });
    expect(ofRule(issues, 'F01')).toMatchObject([{ plant: 'GW', level: 'warning', expected: 'GW veh' }]);
  });
  it('returns nothing without a snapshot and reads it through the provider', async () => {
    expect(expectedFilesChecklist([], base.files)).toEqual([]);
    setPreviousFilesProvider(async () => prev);
    await refreshPreviousFiles();
    expect(getPreviousFiles().map((f) => f.partType)).toEqual(['V', 'V', 'P']);
    setPreviousFilesProvider(async () => { throw new Error('boom'); });
    expect(await refreshPreviousFiles()).toEqual([]);
    setPreviousFilesProvider();
    expect(partTypeFromName('SR veh 481D.xls')).toBe('V');
  });
});

describe('horizon + feature contract', () => {
  it('Firm only when every file is forecastType F', () => {
    expect(HORIZON_META.map((h) => h.badge)).toEqual(['Firm', 'FC', 'FC', 'FC']);
    expect(horizonInfo(base.files)).toMatchObject({ known: true, firm: true, others: [] });
    const other = base.files.map((f, i) => (i === 0 ? { ...f, meta: { ...f.meta, forecastType: 'T' } } : f));
    expect(horizonInfo(other)).toMatchObject({ firm: false, others: ['T'] });
    expect(horizonInfo([]).known).toBe(false);
  });

  it('part type counts: Packing 14 rows, Vehicle 15 rows', () => {
    const rows = Object.values(base.data).flat();
    expect(rows.filter((r) => r.partType === 'P')).toHaveLength(14);
    expect(rows.filter((r) => r.partType === 'V')).toHaveLength(15);
  });

  it('feature object has no onProcessed / setNotice and offers the upload panel slot', () => {
    expect(feature.id).toBe('qa-file-guards');
    expect(feature.onProcessed).toBeUndefined();
    expect(feature.setNotice).toBeUndefined();
    expect(typeof feature.slots.uploadPanel).toBe('function');
  });
});
