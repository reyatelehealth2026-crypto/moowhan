import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ANALYZE_SHEET, DAILY_SHEETS, PLANTS, SOURCE_HEADERS } from '../src/constants.js';
import { GLOSSARY, getEntry, renderWritePlanSummary, searchGlossary, tipText } from '../src/features/help-center/glossary.js';
import { buildExportNotice, toUserError, ERROR_CATALOG } from '../src/lib/errors.js';
import { buildDiagnostics, diagnosticsFileName } from '../src/features/help-center/diagnostics.js';
import { parseChangelog } from '../src/features/help-center/changelog.js';
import { readSourceBuffer } from '../src/lib/excel/readSource.js';
import { listSheetNames } from '../src/lib/excel/templatePatcher.js';
import { fixture, SOURCE_FILES } from './helpers.js';

describe('glossary coverage', () => {
  const terms = new Set(GLOSSARY.map((e) => e.term));
  it('covers PLANTS, SOURCE_HEADERS and sheets with th + source', () => {
    [...PLANTS, ...SOURCE_HEADERS, ...DAILY_SHEETS, ANALYZE_SHEET, 'Summary', 'By Plant', 'Total'].forEach((t) => expect(terms.has(t), t).toBe(true));
    GLOSSARY.forEach((e) => { expect(e.th.length).toBeGreaterThan(0); expect(['fixture-inferred', 'tmt-doc', 'team']).toContain(e.source); });
  });
  it('keys are unique; search and tipText work', () => {
    expect(new Set(GLOSSARY.map((e) => e.key)).size).toBe(GLOSSARY.length);
    expect(searchGlossary('dock').length).toBeGreaterThan(1);
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length);
    expect(tipText(getEntry('n1'), { monthLabels: ['N', "N+1 (Mar'26)"] })).toContain("Mar'26");
  });
  it('write plan sheets exist in template.xlsx', async () => {
    const sheets = await listSheetNames(fixture('template.xlsx'));
    const plan = renderWritePlanSummary();
    plan.writes.forEach((w) => expect(sheets).toContain(w.sheet));
  });
});

describe('errors', () => {
  it('maps the zip error to Thai and keeps the raw text', () => {
    const e = toUserError(new Error("Can't find end of central directory : is this a zip file ?"));
    expect(e.title).toMatch(/[ก-๙]/);
    expect(e.cause && e.fix).toBeTruthy();
    expect(e.technical).toContain('central directory');
  });
  it('falls back to the generic Thai title', () => {
    expect(toUserError(new Error('boom')).title).toBe(ERROR_CATALOG.generic.title);
    expect(toUserError(null).code).toBe('generic');
  });
  it('buildExportNotice: warning with skipped sheets, success without', () => {
    const w = buildExportNotice({ mode: 'template', patched: [], skipped: ['GW Daily'], warnings: [] }, 'x.xlsx');
    expect(w.tone).toBe('warning');
    expect(w.message).toContain('ข้ามชีท');
    expect(w.message).toContain('GW Daily');
    expect(buildExportNotice({ mode: 'template', patched: [{ sheet: 'BP Daily', rows: 3 }], skipped: [], warnings: [] }, 'x.xlsx').tone).toBe('success');
  });
});

describe('diagnostics', () => {
  const rows = readSourceBuffer(fixture(SOURCE_FILES[0])).rows;
  const meta = readSourceBuffer(fixture(SOURCE_FILES[0])).meta;
  const state = {
    template: { name: 'template.xlsx', size: 1234, kind: 'xlsx', sheets: ['BP Daily'], buffer: new ArrayBuffer(1) },
    sourceFiles: [{ name: 'BP veh 481D.xls', size: 99, category: 'BP', rowCount: rows.length, status: 'done', meta, file: {} }],
    exportReport: { mode: 'template', patched: [{ sheet: 'BP Daily', rows: rows.length }], skipped: [], warnings: [], overflow: [] },
    changeLog: rows.slice(0, 3).map((r) => ({ timestamp: 't', action: 'extracted', partNumber: r.partNumber, details: `N=${r.n}` })),
    processedData: { 'BP Daily': rows },
  };
  it('contains names/counts/capacity but no part data', () => {
    const json = JSON.stringify(buildDiagnostics(state, { capacity: { 'BP Daily': 500 } }));
    expect(json).toContain('BP veh 481D.xls');
    expect(json).toContain(`"rows":${rows.length}`);
    expect(json).toContain('500');
    rows.slice(0, 20).forEach((r) => {
      expect(json).not.toContain(r.partNumber);
      if (r.partDesc) expect(json).not.toContain(r.partDesc);
    });
    expect(json).not.toContain('details');
  });
  it('works with empty state and names the file by date', () => {
    expect(buildDiagnostics({}).files).toEqual([]);
    expect(buildDiagnostics().template).toBeNull();
    expect(diagnosticsFileName(new Date('2026-03-04T00:00:00Z'))).toBe('moowhan-diagnostics-2026-03-04.json');
  });
});

describe('docs', () => {
  it('CHANGELOG first version equals package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const first = parseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'))[0];
    expect(first.version).toBe(pkg.version);
    expect(first.items.some((i) => i.startsWith('เทมเพลต:'))).toBe(true);
  });
  it('README mentions the core tab labels and has no stale text', () => {
    const readme = fs.readFileSync('README.md', 'utf8');
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    const labels = [...app.matchAll(/id: '\w+', order: \d+, label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(5);
    labels.forEach((l) => expect(readme, l).toContain(l));
    expect(readme).not.toContain('ข้อมูลจำลอง');
    expect(readme).not.toContain('ชอน');
  });
});

describe('lazy loading', () => {
  it('no entry-side module statically imports the glossary or HelpModal', () => {
    ['src/features/help-center/index.jsx', 'src/features/help-center/GlossaryTip.jsx', 'src/components/PreviewTab.jsx', 'src/components/SummaryTab.jsx', 'src/App.jsx'].forEach((f) => {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^import .*(glossary|HelpModal)/m);
    });
  });
});
