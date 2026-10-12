import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { fixture, SOURCE_FILES } from './helpers.js';
import { readSourceBuffer, categorizeFile } from '../src/lib/excel/index.js';
import { classify, lastPackDate, STATUS_LABEL } from '../src/features/runout-alerts/classify.js';
import { buildRunoutRows, buildRunoutAoa, withOverride, rowKey, cleanIsoDate } from '../src/features/runout-alerts/rows.js';
import { businessFindings } from '../src/features/runout-alerts/rules.js';
import { runRules } from '../src/features/qa-engine/engine.js';
import runout from '../src/features/runout-alerts/index.jsx';

let data; let pm; let files;
beforeAll(() => {
  data = { 'BP Daily': [], 'BPK Daily': [], 'GW Daily': [], 'SR Daily': [] };
  files = [];
  SOURCE_FILES.forEach((f) => {
    const { rows, meta } = readSourceBuffer(fixture(f));
    const plant = categorizeFile(f.split('/')[1]);
    const name = f.split('/')[1];
    rows.forEach((r) => { r.plant = plant; r.fileName = name; });
    data[`${plant} Daily`].push(...rows);
    files.push({ id: name, name, category: plant, status: 'done', meta });
    pm = meta.productionMonth;
  });
});

const find = (rows, plant, part) => rows.find((r) => r.plant === plant && r.partNumber === part);

describe('classify', () => {
  it.each([
    [{ n: 2, n1: 4, n2: 0, n3: 0 }, 'runout-n2'],
    [{ n: 1891, n1: 1677, n2: 919, n3: 0 }, 'runout-n3'],
    [{ n: 0, n1: 0, n2: 100, n3: 120 }, 'new'],
    [{ n: 100, n1: 0, n2: 50, n3: 60 }, 'gap'],
    [{ n: 5790, n1: 7980, n2: 5490, n3: 3720 }, 'normal'],
    [{ n: 0, n1: 0, n2: 0, n3: 0 }, 'zero'],
    [{ n: 5, n1: 0, n2: 0, n3: 0 }, 'runout-n1'],
    [{ n: 0, n1: 3, n2: 0, n3: 0 }, 'gap'],
    [{ n: 0, n1: 0, n2: 0, n3: 7 }, 'new'],
  ])('%j -> %s', (v, expected) => {
    expect(classify(v)).toBe(expected);
    expect(STATUS_LABEL[expected]).toBeTruthy();
  });
});

describe('lastPackDate on fixtures', () => {
  it('SR 0K141 = 2026-03-27, BP 0K051 = 2026-04-30, BP 0K080 = 2026-03-31', () => {
    expect(pm).toEqual({ year: 2026, month: 2 });
    const pick = (sheet, part) => data[sheet].find((r) => r.partNumber === part);
    expect(lastPackDate(pick('SR Daily', '86790-0K141-00'), pm)).toMatchObject({ monthIndex: 1, day: 27, iso: '2026-03-27' });
    expect(lastPackDate(pick('BP Daily', '86790-0K051-00'), pm).iso).toBe('2026-04-30');
    expect(lastPackDate(pick('BP Daily', '86790-0K080-00'), pm).iso).toBe('2026-03-31');
  });
  it('falls back to default columns and returns null for an all-zero row', () => {
    const raw = Array(150).fill(0);
    raw[39 - 31 + 4] = 9; // day 5 of N, no colPositions
    expect(lastPackDate({ rawRow: raw }, pm)).toMatchObject({ monthIndex: 0, day: 5, iso: '2026-02-05' });
    expect(lastPackDate({ rawRow: Array(150).fill(0) }, pm)).toBeNull();
  });
});

describe('buildRunoutRows', () => {
  it('yields exactly 8 signals, BPK and GW normal, ordered run-out first', () => {
    const rows = buildRunoutRows(data, pm);
    const sig = rows.filter((r) => r.signal);
    expect(sig).toHaveLength(8);
    expect(sig.filter((r) => r.status === 'runout-n3').map((r) => `${r.plant} ${r.partNumber.slice(6, 9)}`).sort())
      .toEqual(['BP 0K0', 'BP 0K1', 'BP 0K1', 'BP 0K2', 'SR 0K0', 'SR 0K1'].sort());
    expect(sig.filter((r) => r.status === 'runout-n3')).toHaveLength(6);
    expect(sig.filter((r) => r.status === 'runout-n2').map((r) => `${r.plant} ${r.partNumber}`).sort())
      .toEqual(['BP 86790-0K080-00', 'SR 86790-0K141-00']);
    rows.filter((r) => r.plant === 'BPK' || r.plant === 'GW').forEach((r) => {
      expect(r.status).toBe('normal');
      expect(r.continues).toBe(true);
    });
    const rank = { 'runout-n1': 0, 'runout-n2': 1, 'runout-n3': 2, new: 3, gap: 4, normal: 5 };
    for (let i = 1; i < rows.length; i++) expect(rank[rows[i].status] ?? 6).toBeGreaterThanOrEqual(rank[rows[i - 1].status] ?? 6);
  });

  it('applies official overrides and notes; invalid dates are ignored', () => {
    const base = buildRunoutRows(data, pm);
    const target = find(base, 'SR', '86790-0K141-00');
    const ov = withOverride({}, target.key, '2026-03-20', new Date('2026-02-10T00:00:00Z'));
    const rows = buildRunoutRows(data, pm, ov, { [target.key]: ['รอ TMT ยืนยัน'] });
    const t = find(rows, 'SR', '86790-0K141-00');
    expect(t.lastPackOfficial).toBe('2026-03-20');
    expect(t.officialEditedAt).toBe('2026-02-10');
    expect(t.lastPackEstimated).toBe('2026-03-27'); // estimate untouched
    expect(t.notes).toEqual(['รอ TMT ยืนยัน']);
    expect(buildRunoutRows(data, pm, { [target.key]: { date: '2026-02-30' } }).find((r) => r.key === target.key).lastPackOfficial).toBe('');
    expect(withOverride(ov, target.key, '')).toEqual({});
    expect(cleanIsoDate('2026-02-29')).toBe('');
    expect(rowKey('SR', 'P', 'S1')).toBe('SR|P|S1');
  });
});

describe('B01 rule', () => {
  it('rules.js imports classify from classify.js and has no copy of the thresholds', () => {
    const src = fs.readFileSync(new URL('../src/features/runout-alerts/rules.js', import.meta.url), 'utf8');
    expect(src).toMatch(/from '\.\/classify\.js'/);
    expect(src).not.toMatch(/n2 === 0 && .*n3 === 0 &&/);
  });

  it('finding count equals signal rows; level, category, weight and wording', () => {
    const issues = runRules({ processedData: data, sourceFiles: files, productionMonth: pm, today: new Date('2026-02-10') }).filter((i) => i.rule === 'B01');
    const signals = buildRunoutRows(data, pm).filter((r) => r.signal);
    expect(issues).toHaveLength(signals.length);
    expect(issues).toHaveLength(8);
    issues.forEach((i) => {
      expect(i.group).toBe('business');
      expect(i.category).toBe('business');
      expect(i.level).toBe('warning');
      expect(i.message).toContain('สัญญาณ');
      expect(i.rowNumber).toBeGreaterThan(13);
    });
    expect(issues.filter((i) => i.weight === 'high')).toHaveLength(2); // the two runout-n2 rows
  });

  it('weight is high only when N+2 and N+3 are both zero; new/gap are info', () => {
    const ctxOf = (n, n1, n2, n3) => {
      const row = { partNumber: 'X-1', dockCode: 'D', n, n1, n2, n3, rawRow: [] };
      return { processedData: { 'BP Daily': [row] }, productionMonth: pm, entries: [{ row, sheet: 'BP Daily', plant: 'BP', rowNumber: 14 }], monthLabel: (p, k) => `N+${k}` };
    };
    expect(businessFindings(ctxOf(5, 4, 3, 0))[0]).toMatchObject({ weight: 'medium', level: 'warning' });
    expect(businessFindings(ctxOf(5, 0, 0, 0))[0]).toMatchObject({ weight: 'high', level: 'warning' });
    expect(businessFindings(ctxOf(0, 0, 4, 5))[0]).toMatchObject({ level: 'info' });
    expect(businessFindings(ctxOf(4, 0, 4, 5))[0]).toMatchObject({ level: 'info' });
  });

  it('business findings never add to the error count', () => {
    const issues = runRules({ processedData: data, sourceFiles: files, productionMonth: pm, today: new Date('2026-02-10') });
    expect(issues.filter((i) => i.rule === 'B01' && i.level === 'error')).toHaveLength(0);
  });
});

describe('export sheet (opt-in)', () => {
  const stateOf = (slot) => ({ processedData: data, productionMonth: pm, profile: { features: { 'runout-alerts': slot } }, features: {} });

  it('returns nothing when opt-in is off', () => {
    expect(runout.exportSheets({ state: stateOf({}) })).toEqual([]);
    expect(runout.exportSheets({ state: stateOf({ includeInExport: false }) })).toEqual([]);
  });

  it('returns the Runout sheet with text dates when on', () => {
    const target = find(buildRunoutRows(data, pm), 'SR', '86790-0K141-00');
    const sheets = runout.exportSheets({ state: stateOf({ includeInExport: true, overrides: { [target.key]: { date: '2026-03-20' } } }) });
    expect(sheets).toHaveLength(1);
    const { name, aoa } = sheets[0];
    expect(name).toBe('Runout');
    expect(aoa[0]).toEqual(['Plant', 'Dock', 'Part', 'Part Code', 'สถานะ', 'Last Pack (ประมาณ)', 'Last Pack (ทางการ)', 'N', 'N+1', 'N+2', 'N+3', 'หมายเหตุ']);
    expect(aoa).toHaveLength(1 + 29);
    const row = aoa.find((r) => r[0] === 'SR' && r[2] === '86790-0K141-00');
    expect(row[5]).toBe('2026-03-27');
    expect(row[6]).toBe('2026-03-20');
    expect(typeof row[5]).toBe('string');
    expect(aoa[1][4]).toMatch(/สัญญาณ/); // run-out rows first
  });

  it('is a registered feature without its own badge or validate hook', () => {
    expect(runout.id).toBe('runout-alerts');
    expect(runout.group).toBe('วิเคราะห์');
    expect(runout.tab.badge).toBeUndefined();
    expect(buildRunoutAoa([], {})).toHaveLength(1);
  });
});
