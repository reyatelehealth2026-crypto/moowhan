import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { buildSummary, buildAnalyzeRows } from '../src/lib/excel/aggregate.js';
import { dayValues, sumArray } from '../src/lib/excel/daily.js';
import { patchTemplate } from '../src/lib/excel/templatePatcher.js';
import { MONTH_KEYS } from '../src/constants.js';
import {
  STRATEGIES, applyBatch, applyDayMove, applyRowEdit, buildLedgerAoa, countEditedRows, dayMismatches, editKey, mergeLedger,
  planBatchCommit, reconcileDays, replayEdits, revertRow,
} from '../src/features/manual-edit/edits.js';
import { exportEditsCsv, matchAdjustments, matchesToItems, parseAdjustments } from '../src/features/manual-edit/paste.js';
import { mergeNotes, notesFromLedger, sanitizeCellText } from '../src/features/manual-edit/notes.js';
import { UNDO_MS, createUndoStore } from '../src/features/manual-edit/undo.js';
import feature from '../src/features/manual-edit/index.jsx';
import { collectExportSheets } from '../src/features/runtime.js';
import { fixture, SOURCE_FILES } from './helpers.js';

const load = () => {
  const data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  SOURCE_FILES.forEach((f) => {
    const plant = categorizeFile(f.split('/').pop());
    readSourceBuffer(fixture(f)).rows.forEach((row, i) => {
      data[`${plant} Daily`].push({ ...row, id: `${plant}-${i}`, plant, fileName: f.split('/').pop() });
    });
  });
  return data;
};
const find = (data, sheet, part, dock) => data[sheet].find((r) => r.partNumber === part && (!dock || r.dockCode === dock));
const SR = '86790-0K051-00';

let data;
beforeEach(() => { data = load(); });

describe('editKey', () => {
  it('normalises plant, part number and dock', () => {
    expect(editKey({ partNumber: ' 86790-0k051-00 ', dockCode: ' bn ' }, 'bpk')).toBe('BPK|86790-0K051-00|BN');
    expect(editKey({ plant: 'SR', partNumber: SR, dockCode: 'S1' })).toBe(`SR|${SR}|S1`);
  });
});

describe('applyRowEdit', () => {
  it('lastWorkingDay: 1352 -> 1300 lowers day 28 from 64 to 12 and keeps the day sum equal to N', () => {
    const row = find(data, 'SR Daily', SR);
    const res = applyRowEdit(row, { n: 1300 });
    expect(res.error).toBeNull();
    expect(res.row.n).toBe(1300);
    expect(res.row.rawRow[39]).toBe(1300);
    expect(sumArray(dayValues(res.row, 0))).toBe(1300);
    expect(dayValues(res.row, 0)[27]).toBe(12);
    expect(res.changes).toContain('N: 1352 → 1300');
    expect(res.row.edited).toBe(true);
    expect(res.row.original.n).toBe(1352);
    expect(row.n).toBe(1352); // input untouched
  });

  it('1200 zeroes days 28 and 27 and day 26 becomes 50', () => {
    const res = applyRowEdit(find(data, 'SR Daily', SR), { n: 1200 });
    const d = dayValues(res.row, 0);
    expect([d[27], d[26], d[25]]).toEqual([0, 0, 50]);
    expect(sumArray(d)).toBe(1200);
  });

  it('an increase goes to the last non-zero day', () => {
    const res = applyRowEdit(find(data, 'SR Daily', SR), { n: 1400 });
    expect(dayValues(res.row, 0)[27]).toBe(64 + 48);
    expect(sumArray(dayValues(res.row, 0))).toBe(1400);
  });

  it('proportional keeps an exact day sum for every fixture row and month', () => {
    Object.values(data).flat().forEach((row) => {
      MONTH_KEYS.forEach((k, m) => {
        [0, 1, Math.max(0, row[k] - 37), Math.round(row[k] * 0.83), row[k] + 101, row[k] * 2 + 7].forEach((target) => {
          const days = reconcileDays(row, m, target, 'proportional');
          expect(sumArray(days), `${row.partNumber} ${k} -> ${target}`).toBe(target);
          expect(days.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
        });
      });
    });
    const res = applyRowEdit(find(data, 'BP Daily', '86790-0K051-00'), { n: 1500 }, { strategy: 'proportional' });
    expect(sumArray(dayValues(res.row, 0))).toBe(1500);
    expect(dayMismatches(res.row)).toEqual([]);
  });

  it("'none' leaves the days alone and flags a mismatch", () => {
    const row = find(data, 'BP Daily', '86790-0K051-00');
    const res = applyRowEdit(row, { n: 1500 }, { strategy: 'none' });
    expect(dayValues(res.row, 0)).toEqual(dayValues(row, 0));
    expect(res.row.n).toBe(1500);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]).toMatchObject({ code: 'R01', dayTotal: 1891, total: 1500 });
  });

  it('edits N+1 and several months at once', () => {
    const row = find(data, 'BPK Daily', SR, 'BN');
    const res = applyRowEdit(row, { n: 600, n1: 0 });
    expect(res.cells.map((c) => c.label)).toEqual(['N', 'N+1']);
    expect(sumArray(dayValues(res.row, 1))).toBe(0);
    expect(sumArray(dayValues(res.row, 0))).toBe(600);
  });

  it('rejects -5, "abc" and decimals without changing anything', () => {
    const row = find(data, 'SR Daily', SR);
    [-5, 'abc', '12.5', 1.5].forEach((v) => {
      const res = applyRowEdit(row, { n: v });
      expect(res.error).toBe('ต้องเป็นจำนวนเต็ม 0 ขึ้นไป');
      expect(res.row).toBe(row);
    });
    expect(applyRowEdit(row, { n: 1352 }).unchanged).toBe(true);
  });

  it('only marks the changed cells (total + days) as edited', () => {
    const res = applyRowEdit(find(data, 'SR Daily', SR), { n: 1300 });
    expect(res.row.editedCells).toEqual([8 + 27, 39]);
  });
});

describe('revertRow', () => {
  it('restores n..n3, rawRow and the days and drops the markers', () => {
    const row = find(data, 'SR Daily', SR);
    const edited = applyRowEdit(row, { n: 1200, n1: 10 }).row;
    const back = revertRow(edited);
    expect(MONTH_KEYS.map((k) => back[k])).toEqual(MONTH_KEYS.map((k) => row[k]));
    expect(back.rawRow).toEqual(row.rawRow);
    expect(back.edited).toBeUndefined();
    expect(back.original).toBeUndefined();
    expect(back.editedCells).toBeUndefined();
  });
  it('editing a value back to the original un-edits the row', () => {
    const row = find(data, 'SR Daily', SR);
    const once = applyRowEdit(row, { n: 1300 }).row;
    const twice = applyRowEdit(once, { n: 1352 }).row;
    expect(twice.edited).toBeUndefined();
    expect(twice.rawRow).toEqual(row.rawRow);
  });
});

describe('applyDayMove', () => {
  it('moves 20 from day 14 to day 16 and keeps N', () => {
    const row = find(data, 'SR Daily', SR);
    const res = applyDayMove(row, 0, 14, 16, 20);
    expect(res.error).toBeNull();
    const d = dayValues(res.row, 0);
    expect([d[13], d[15]]).toEqual([39, 84]);
    expect(res.row.n).toBe(1352);
    expect(sumArray(d)).toBe(1352);
    expect(res.row.edited).toBe(true);
  });
  it('refuses more than the source has, missing days and the same day', () => {
    const row = find(data, 'SR Daily', SR);
    expect(applyDayMove(row, 0, 14, 16, 60).error).toBe('วันที่ 14 มีเพียง 59 ชิ้น');
    expect(applyDayMove(row, 0, 14, 40, 5).error).toBeTruthy();
    expect(applyDayMove(row, 0, 14, 14, 5).error).toBeTruthy();
    expect(applyDayMove(row, 0, 14, 16, 0).error).toBeTruthy();
    const cal = [[...Array(31)].map((_, i) => ({ day: i + 1, exists: i < 28, isWeekend: false }))];
    expect(applyDayMove(row, 0, 14, 30, 5, { calendar: cal }).error).toBe('เดือนนี้ไม่มีวันที่ 30');
  });
  it('a non-working target needs the confirm flag', () => {
    const row = find(data, 'SR Daily', SR);
    const blocked = applyDayMove(row, 0, 14, 15, 10); // day 15 has 0 pieces
    expect(blocked.needsConfirm).toBe(true);
    expect(blocked.row).toBe(row);
    const ok = applyDayMove(row, 0, 14, 15, 10, { confirmNonWorking: true });
    expect(ok.error).toBeNull();
    expect(dayValues(ok.row, 0)[14]).toBe(10);
  });
});

describe('applyBatch / planBatchCommit / mergeLedger', () => {
  const items20 = () => data['BP Daily'].concat(data['BPK Daily']).slice(0, 20).map((r) => ({
    sheet: `${r.plant} Daily`, rowId: r.id, patch: { n: r.n + 10 }, reason: 'TMT แจ้งแก้',
  }));

  it('20 items: buildSummary once, 20 log entries, input not mutated', () => {
    const spy = vi.fn(buildSummary);
    const before = JSON.stringify(data);
    const plan = planBatchCommit(data, items20(), { buildSummary: spy });
    expect(plan.applied).toBe(20);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(plan.logs).toHaveLength(20);
    expect(plan.logs[0]).toMatchObject({ action: 'edit', plant: 'BP' });
    expect(plan.logs[0].details).toContain('(TMT แจ้งแก้)');
    expect(JSON.stringify(data)).toBe(before);
    expect(countEditedRows(plan.processedData)).toBe(20);
    expect(plan.summary.length).toBeGreaterThan(0);
  });

  it('nothing applied -> no summary rebuild', () => {
    const spy = vi.fn(buildSummary);
    const plan = planBatchCommit(data, [{ sheet: 'SR Daily', rowId: 'nope', patch: { n: 1 } }], { buildSummary: spy });
    expect(plan.applied).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(plan.results[0].error).toBeTruthy();
  });

  it('ledger entries are added, reverts remove them', () => {
    const row = find(data, 'SR Daily', SR);
    const a = applyBatch(data, [{ sheet: 'SR Daily', rowId: row.id, patch: { n: 1300 }, reason: 'ปรับตามสต็อก' }]);
    let ledger = mergeLedger([], a.results);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ key: `SR|${SR}|S1`, kind: 'total', reason: 'ปรับตามสต็อก', strategy: 'lastWorkingDay' });
    expect(ledger[0].cells[0]).toMatchObject({ label: 'N', before: 1352, after: 1300 });
    const b = applyBatch(a.processedData, [{ sheet: 'SR Daily', rowId: row.id, kind: 'revert' }]);
    ledger = mergeLedger(ledger, b.results);
    expect(ledger).toEqual([]);
    expect(find(b.processedData, 'SR Daily', SR).edited).toBeUndefined();
  });
});

describe('replayEdits', () => {
  it('re-applies on fresh data, reports orphans when the file is gone', () => {
    const row = find(data, 'SR Daily', SR);
    const first = applyBatch(data, [
      { sheet: 'SR Daily', rowId: row.id, patch: { n: 1300 }, reason: 'TMT แจ้งแก้' },
      { sheet: 'SR Daily', rowId: row.id, kind: 'dayMove', monthIdx: 0, fromDay: 14, toDay: 16, qty: 20, reason: 'ปรับตามกำลังผลิต' },
    ]);
    const ledger = mergeLedger([], first.results);
    expect(ledger).toHaveLength(2);

    const fresh = load();
    const out = replayEdits(fresh, ledger);
    expect(out.applied).toHaveLength(2);
    expect(out.orphans).toEqual([]);
    const r = find(out.processedData, 'SR Daily', SR);
    expect(r.n).toBe(1300);
    expect(dayValues(r, 0)[15]).toBe(84);
    expect(sumArray(dayValues(r, 0))).toBe(1300);
    expect(find(fresh, 'SR Daily', SR).n).toBe(1352);

    const withoutSr = { ...load(), 'SR Daily': [] };
    const orphaned = replayEdits(withoutSr, ledger);
    expect(orphaned.applied).toEqual([]);
    expect(orphaned.orphans).toHaveLength(2);
    expect(orphaned.ledger).toHaveLength(2); // kept, comes back when the file is added again
  });

  it('drops an edit whose value now equals the new file', () => {
    const row = find(data, 'SR Daily', SR);
    const ledger = mergeLedger([], applyBatch(data, [{ sheet: 'SR Daily', rowId: row.id, patch: { n: 1352 + 8 }, reason: 'x' }]).results);
    const fresh = load();
    find(fresh, 'SR Daily', SR).n = 1360;
    const out = replayEdits(fresh, ledger);
    expect(out.unchanged).toHaveLength(1);
    expect(out.ledger).toEqual([]);
  });
});

describe('notes / sanitize', () => {
  it('neutralises formulas and control characters, idempotently', () => {
    expect(sanitizeCellText('=1+1')).toBe("'=1+1");
    expect(sanitizeCellText("'=1+1")).toBe("'=1+1");
    expect(sanitizeCellText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sanitizeCellText('a\u0000b\nc')).toBe('ab c');
    expect(sanitizeCellText('ปกติ')).toBe('ปกติ');
  });
  it('writes edit notes keyed by row and keeps other notes', () => {
    const ledger = [{ id: 'e1', key: 'SR|P|D', reason: 'TMT แจ้งแก้' }, { id: 'e2', key: 'SR|Q|D', reason: '' }];
    expect(notesFromLedger(ledger, '202602')).toEqual([{ id: 'note-e1', month: '202602', key: 'row:SR|P|D', text: 'TMT แจ้งแก้', source: 'edit' }]);
    const merged = mergeNotes([{ id: 'x', source: 'user', text: 'keep' }, { id: 'old', source: 'edit' }], ledger, '202602');
    expect(merged.map((n) => n.id)).toEqual(['x', 'note-e1']);
  });
});

describe('parseAdjustments / matchAdjustments', () => {
  it('handles tabs, commas, quoted reasons and aliases', () => {
    const tsv = 'Plant\tPart Number\tDock\tN\tN+1\tเหตุผล\nSR\t86790-0K051-00\tS1\t1,300\t\tTMT แจ้งแก้';
    const a = parseAdjustments(tsv);
    expect(a.errors).toEqual([]);
    expect(a.items).toEqual([{ line: 2, plant: 'SR', partNumber: SR, dock: 'S1', n: 1300, reason: 'TMT แจ้งแก้' }]);
    const csv = 'plant,part,dock,n+2,reason\nBP,86790-0K051-00,P1,5,"ตาม ""TMT"", แก้\nด่วน"';
    const b = parseAdjustments(csv);
    expect(b.items[0]).toMatchObject({ plant: 'BP', dock: 'P1', n2: 5, reason: 'ตาม "TMT", แก้ ด่วน' });
  });
  it('works without a header, neutralises formulas and reports bad lines', () => {
    const r = parseAdjustments('SR,86790-0K051-00,S1,1300,,,,=1+1\nSR,,S1,5\nSR,X-1,S1,abc');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].reason).toBe("'=1+1");
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });
  it('caps the number of lines', () => {
    const text = Array.from({ length: 30 }, (_, i) => `SR,P-${i}0000,S1,${i}`).join('\n');
    const r = parseAdjustments(text, { maxLines: 10 });
    expect(r.items).toHaveLength(10);
    expect(r.truncated).toBe(true);
  });
  it('matches BPK without dock as "ต้องระบุ Dock" with BN and D1, case/whitespace insensitive', () => {
    const [none, bn, lower, gone, same] = matchAdjustments(parseAdjustments([
      'BPK,86790-0K051-00,,100',
      'BPK,86790-0K051-00,BN,100',
      '  bpk , 86790-0k051-00 , d1 ,100',
      'BPK,NOPE-12345,BN,1',
      'SR,86790-0K051-00,S1,1352',
    ].join('\n')).items, data);
    expect(none.status).toBe('ต้องระบุ Dock');
    expect([...none.candidates].sort()).toEqual(['BN', 'D1']);
    expect(bn.status).toBe('ตรงกัน');
    expect(bn).toMatchObject({ before: { n: 640 }, after: { n: 100 } });
    expect(lower.status).toBe('ตรงกัน');
    expect(lower.row.dockCode).toBe('D1');
    expect(gone.status).toBe('ไม่พบ');
    expect(same.status).toBe('ไม่เปลี่ยน');
    expect(matchesToItems([none, bn, lower], { strategy: 'proportional', reason: 'ปรับตามสต็อก' })).toHaveLength(2);
  });
  it('exports applied edits as CSV the parser reads back', () => {
    const row = find(data, 'SR Daily', SR);
    const ledger = mergeLedger([], applyBatch(data, [{ sheet: 'SR Daily', rowId: row.id, patch: { n: 1300 }, reason: 'ปรับ, "ตามสต็อก"' }]).results);
    const csv = exportEditsCsv(ledger);
    const back = parseAdjustments(csv);
    expect(back.items[0]).toMatchObject({ plant: 'SR', partNumber: SR, dock: 'S1', n: 1300, reason: 'ปรับ, "ตามสต็อก"' });
  });
});

describe('undo store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('push / restore returns the snapshot once', () => {
    const u = createUndoStore();
    expect(u.has()).toBe(false);
    u.push({ a: 1 });
    expect(u.has()).toBe(true);
    expect(u.restore()).toEqual({ a: 1 });
    expect(u.has()).toBe(false);
    expect(u.restore()).toBeNull();
  });
  it(`expires after ${UNDO_MS} ms`, () => {
    const u = createUndoStore();
    u.push('s');
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(u.has()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(u.has()).toBe(false);
    expect(u.restore()).toBeNull();
  });
  it('a newer push replaces the older one and restarts the timer', () => {
    const u = createUndoStore();
    const first = u.push('one');
    vi.advanceTimersByTime(4000);
    const second = u.push('two');
    vi.advanceTimersByTime(4000);
    expect(u.has()).toBe(true);
    expect(u.restore(first)).toBeNull();
    expect(u.restore(second)).toBe('two');
  });
  it('notifies subscribers and clear() empties it', () => {
    const u = createUndoStore();
    const seen = [];
    u.subscribe((s) => seen.push(!!s));
    u.push(1);
    u.clear();
    expect(seen).toEqual([true, false]);
  });
});

// ---------- export ----------
const fillOf = async (zip, sheetPath, ref) => {
  const sheet = await zip.file(sheetPath).async('string');
  const s = new RegExp(`<c r="${ref}"[^>]*?\\bs="(\\d+)"`).exec(sheet)?.[1];
  const styles = await zip.file('xl/styles.xml').async('string');
  const xfs = [...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const fillId = Number(/fillId="(\d+)"/.exec(xfs[Number(s)])?.[1]);
  const fills = [...styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)[1].matchAll(/<fill>[\s\S]*?<\/fill>/g)].map((m) => m[0]);
  return /rgb="([0-9A-F]{8})"/.exec(fills[fillId])?.[1] ?? null;
};
const xfCount = async (zip) => Number(/<cellXfs count="(\d+)"/.exec(await zip.file('xl/styles.xml').async('string'))[1]);

describe('export', () => {
  const editedData = () => {
    const d = load();
    const row = find(d, 'SR Daily', SR);
    return applyBatch(d, [{ sheet: 'SR Daily', rowId: row.id, patch: { n: 1300 }, reason: '=1+1' }]);
  };

  it('paints only the edited cells amber, once, without growing cellXfs on a second run', async () => {
    const { processedData } = editedData();
    const analyzeRows = buildAnalyzeRows(processedData);
    const first = await patchTemplate(fixture('template.xlsx'), { processedData, analyzeRows, highlight: true });
    const zip = await JSZip.loadAsync(first.buffer);
    // SR Daily is the 4th sheet; locate its part
    const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const rid = new RegExp('<sheet name="SR Daily"[^>]*r:id="(rId\\d+)"').exec(wbXml)[1];
    const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(wbRels);
    const path = `xl/${(target[1] || target[2]).replace(/^\/?(xl\/)?/, '')}`;

    const r = 14 + processedData['SR Daily'].findIndex((x) => x.partNumber === SR);
    expect(await fillOf(zip, path, `AN${r}`)).toBe('FFFFF1C2'); // N total (rawRow 39)
    expect(await fillOf(zip, path, `AJ${r}`)).toBe('FFFFF1C2'); // day 28 (rawRow 35)
    expect(await fillOf(zip, path, `A${r}`)).not.toBe('FFFFF1C2');
    expect(await fillOf(zip, path, `AM${r}`)).not.toBe('FFFFF1C2'); // untouched day 31
    expect(await fillOf(zip, path, `AN${r + 1 > 17 ? 14 : r + 1}`)).not.toBe('FFFFF1C2'); // another row

    // patching the patched file again (the plain blue highlight is not idempotent by design, so compare without it)
    const plain = await patchTemplate(fixture('template.xlsx'), { processedData, analyzeRows, highlight: false });
    const zipPlain = await JSZip.loadAsync(plain.buffer);
    expect(await fillOf(zipPlain, path, `AN${r}`)).toBe('FFFFF1C2');
    const again = await patchTemplate(plain.buffer, { processedData, analyzeRows, highlight: false });
    const zip2 = await JSZip.loadAsync(again.buffer);
    expect(await xfCount(zip2)).toBe(await xfCount(zipPlain));
    expect(await fillOf(zip2, path, `AN${r}`)).toBe('FFFFF1C2');
    const fillsOf = async (z) => /<fills count="(\d+)"/.exec(await z.file('xl/styles.xml').async('string'))[1];
    expect(await fillsOf(zip2)).toBe(await fillsOf(zipPlain));
  });

  it('uses no amber at all when nothing was edited', async () => {
    const out = await patchTemplate(fixture('template.xlsx'), { processedData: load(), analyzeRows: buildAnalyzeRows(load()), highlight: true });
    expect((await JSZip.loadAsync(out.buffer).then((z) => z.file('xl/styles.xml').async('string')))).not.toContain('FFFFF1C2');
  });

  it("feature.exportSheets: 'Manual Edits' has one row per edit, sanitised, absent when unused/switched off", async () => {
    const { processedData, results } = editedData();
    const ledger = mergeLedger([], results);
    const state = { processedData, features: { 'manual-edit': { ledger } }, profile: {} };
    const [sheet] = await collectExportSheets([feature], { state }, {}).then((r) => r.sheets);
    expect(sheet.name).toBe('Manual Edits');
    expect(sheet.aoa).toHaveLength(2);
    expect(sheet.aoa[0]).toEqual(['เวลา', 'โรงงาน', 'Part', 'Dock', 'ช่อง', 'ก่อน', 'หลัง', 'วิธีปรับวัน', 'เหตุผล']);
    expect(sheet.aoa[1].slice(1)).toEqual(['SR', SR, 'S1', 'N', 1352, 1300, STRATEGIES.lastWorkingDay, "'=1+1"]);

    const none = (st) => collectExportSheets([feature], { state: st }, {}).then((r) => r.sheets);
    expect(await none({ ...state, features: {} })).toEqual([]);
    expect(await none({ ...state, features: { 'manual-edit': { ledger: [] } } })).toEqual([]);
    expect(await none({ ...state, features: { 'manual-edit': { ledger, exportLedger: false } } })).toEqual([]);
    // an orphaned entry (row no longer edited) is not exported
    expect(await none({ ...state, processedData: load() })).toEqual([]);
    expect(buildLedgerAoa(ledger)).toHaveLength(2);
  });

  it('is written into the workbook by the patcher as an extra sheet', async () => {
    const { processedData, results } = editedData();
    const aoa = buildLedgerAoa(mergeLedger([], results));
    const { buffer } = await patchTemplate(fixture('template.xlsx'), { processedData, analyzeRows: buildAnalyzeRows(processedData), extraSheets: [{ name: 'Manual Edits', aoa }] });
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    expect(wb.SheetNames).toContain('Manual Edits');
    expect(XLSX.utils.sheet_to_json(wb.Sheets['Manual Edits'], { header: 1 })).toHaveLength(2);
  });
});

describe('feature contract', () => {
  it('is a valid feature with a badge equal to the edited row count', () => {
    expect(feature.id).toBe('manual-edit');
    const { processedData } = applyBatch(load(), [{ sheet: 'SR Daily', rowId: 'SR-0', patch: { n: 1 } }, { sheet: 'BP Daily', rowId: 'BP-0', patch: { n: 1 } }]);
    expect(feature.tab.badge({ state: { processedData } })).toBe(2);
  });
});
