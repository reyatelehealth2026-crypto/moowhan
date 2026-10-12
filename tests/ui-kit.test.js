import { describe, it, expect, beforeAll } from 'vitest';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer } from '../src/lib/excel/index.js';
import { searchRows, sortRows, nextSort, ariaSort } from '../src/features/ui-kit/gridUtils.js';
import { dispatchHotkey, acquireKeyboard, keyboardOwned, registerHotkey, listHotkeys } from '../src/features/ui-kit/hotkeys.js';
import { STRINGS, GLOSSARY, foundOf } from '../src/features/ui-kit/strings.js';
import { createToastStore, createLiveStore } from '../src/features/ui-kit/toastStore.js';
import { cycleIndex } from '../src/hooks/useFocusTrap.js';
import { formatDate, relativeTime, formatDelta, format } from '../src/utils/format.js';
import { SOURCE_HEADERS, PLANT_META } from '../src/constants.js';

let rows;
beforeAll(() => {
  rows = readSourceBuffer(fixture(SOURCE_FILES[0])).rows;
});

describe('searchRows', () => {
  it('matches partCode case-insensitively across partNumber/partCode/dockCode', () => {
    const sample = [
      { partNumber: 'AB-1', partCode: 'W036', dockCode: 'D1' },
      { partNumber: 'CD-2', partCode: 'X', dockCode: 'w036-dock' },
      { partNumber: 'EF-3', partCode: 'Y', dockCode: 'Z' },
    ];
    expect(searchRows(sample, 'w036').map((r) => r.partNumber)).toEqual(['AB-1', 'CD-2']);
    expect(searchRows(sample, '  ')).toBe(sample);
  });
  it('works on real fixture rows', () => {
    const code = String(rows[0].partCode);
    const hit = searchRows(rows, code.toLowerCase());
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((r) => `${r.partNumber}${r.partCode}${r.dockCode}`.toLowerCase().includes(code.toLowerCase()))).toBe(true);
  });
});

describe('sortRows', () => {
  const data = [{ id: 'a', v: 2 }, { id: 'b', v: null }, { id: 'c', v: 1 }, { id: 'd', v: 2 }, { id: 'e', v: undefined }];
  it('is stable for equal values and puts nulls last in both directions', () => {
    expect(sortRows(data, 'v', 'asc').map((r) => r.id)).toEqual(['c', 'a', 'd', 'b', 'e']);
    expect(sortRows(data, 'v', 'desc').map((r) => r.id)).toEqual(['a', 'd', 'c', 'b', 'e']);
  });
  it('does not mutate and sorts strings naturally', () => {
    const copy = [...data];
    sortRows(data, 'v');
    expect(data).toEqual(copy);
    expect(sortRows([{ s: 'P10' }, { s: 'P2' }], 's').map((r) => r.s)).toEqual(['P2', 'P10']);
  });
  it('toggles sort state', () => {
    let s = nextSort(null, 'n');
    expect(s).toEqual({ key: 'n', dir: 'asc' });
    s = nextSort(s, 'n');
    expect(ariaSort(s, 'n')).toBe('descending');
    expect(ariaSort(s, 'x')).toBe('none');
  });
});

describe('hotkeys', () => {
  const ev = (o) => ({ key: '', ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'DIV' }, ...o });
  const input = { tagName: 'INPUT' };
  it('ignores input targets except Escape', () => {
    expect(dispatchHotkey(ev({ key: '/', target: input }), { canExport: true })).toBeNull();
    expect(dispatchHotkey(ev({ key: 's', ctrlKey: true, target: input }), { canExport: true })).toBeNull();
    expect(dispatchHotkey(ev({ key: 'Escape', target: input }), {}).action).toBe('escape');
  });
  it('Ctrl/Cmd+S prevents default only when export is enabled', () => {
    expect(dispatchHotkey(ev({ key: 's', ctrlKey: true }), { canExport: false })).toBeNull();
    expect(dispatchHotkey(ev({ key: 'S', metaKey: true }), { canExport: true })).toEqual({ action: 'export', preventDefault: true });
  });
  it('Ctrl+Enter processes only when allowed; "/" focuses search', () => {
    expect(dispatchHotkey(ev({ key: 'Enter', ctrlKey: true }), { canProcess: false })).toBeNull();
    expect(dispatchHotkey(ev({ key: 'Enter', ctrlKey: true }), { canProcess: true }).action).toBe('process');
    expect(dispatchHotkey(ev({ key: '/' }), {}).action).toBe('focusSearch');
  });
  it('is suspended while a modal owns the keyboard', () => {
    expect(dispatchHotkey(ev({ key: 's', ctrlKey: true }), { canExport: true, suspended: true })).toBeNull();
    const release = acquireKeyboard();
    expect(keyboardOwned()).toBe(true);
    release();
    release();
    expect(keyboardOwned()).toBe(false);
  });
  it('supports registered shortcuts (help-center hook)', () => {
    const off = registerHotkey({ id: 'help', key: '?', ctrl: false });
    expect(dispatchHotkey(ev({ key: '?' }), {}, listHotkeys()).action).toBe('custom:help');
    off();
    expect(listHotkeys()).toEqual([]);
  });
});

describe('format policy', () => {
  it('formatDate long/short/time in Asia/Bangkok with Gregorian year', () => {
    const iso = '2026-10-05T07:32:00Z';
    expect(formatDate(iso, 'long', { tz: 'Asia/Bangkok' })).toBe('5 ต.ค. 2026 14:32');
    expect(formatDate(iso, 'short')).toBe('5 ต.ค. 2026');
    expect(formatDate(iso, 'time')).toBe('14:32');
    expect(formatDate('nope')).toBe('-');
    expect(formatDate(null)).toBe('-');
  });
  it('relativeTime and injectable clock', () => {
    const t = '2026-10-05T07:30:00Z';
    expect(relativeTime(t, new Date('2026-10-05T07:31:30Z'))).toBe('2 นาทีที่แล้ว');
    const orig = format.now;
    format.now = () => new Date('2026-10-05T09:30:00Z').getTime();
    expect(relativeTime(t)).toBe('2 ชั่วโมงที่แล้ว');
    format.now = orig;
  });
  it('formatDelta', () => {
    expect(formatDelta(1234, 0.026)).toBe('+1,234 (+2.6%)');
    expect(formatDelta(-50, -0.1)).toBe('-50 (-10.0%)');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('strings catalog', () => {
  const walk = (o, out = []) => { Object.values(o).forEach((v) => (typeof v === 'object' ? walk(v, out) : out.push(v))); return out; };
  it('has no empty values', () => {
    const all = walk(STRINGS);
    expect(all.length).toBeGreaterThan(10);
    all.forEach((v) => expect(String(v).trim()).not.toBe(''));
  });
  it('glossary labels match column headers', () => {
    const headers = SOURCE_HEADERS.map((h) => h.toLowerCase());
    ['partNumber', 'partCode', 'dockCode', 'packingSize'].forEach((k) => expect(headers).toContain(GLOSSARY[k].toLowerCase()));
    expect([GLOSSARY.n, GLOSSARY.n1, GLOSSARY.n2, GLOSSARY.n3]).toEqual(['N', 'N+1', 'N+2', 'N+3']);
  });
  it('plant labels match constants', () => {
    Object.keys(PLANT_META).forEach((p) => expect(STRINGS.plants[p]).toBe(`${p} – ${PLANT_META[p].label}`));
    expect(foundOf(3, 1200)).toBe('พบ 3 จาก 1,200');
  });
});

describe('stores and focus helpers', () => {
  it('toast store pushes, caps and dismisses', () => {
    const s = createToastStore();
    const seen = [];
    s.subscribe((i) => seen.push(i.length));
    const id = s.push({ message: 'ok' });
    expect(s.get()[0]).toMatchObject({ tone: 'success', duration: 6000 });
    s.dismiss(id);
    expect(s.get()).toEqual([]);
    for (let i = 0; i < 6; i++) s.push({ message: String(i) });
    expect(s.get().length).toBe(4);
    expect(seen.length).toBeGreaterThan(2);
  });
  it('live store announces', () => {
    const l = createLiveStore();
    l.announce('ประมวลผลเสร็จ: 5 ไฟล์ 10 แถว');
    expect(l.get().msg).toContain('ประมวลผลเสร็จ');
  });
  it('cycleIndex wraps both ways', () => {
    expect(cycleIndex(3, 2, false)).toBe(0);
    expect(cycleIndex(3, 0, true)).toBe(2);
    expect(cycleIndex(3, -1, false)).toBe(0);
    expect(cycleIndex(0, 0, false)).toBe(-1);
  });
});
