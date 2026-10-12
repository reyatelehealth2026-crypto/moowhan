import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(root, 'scripts', 'consolidate.mjs');
const NOW = '2026-02-05T09:00:00Z';
let tmp;

const run = (args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter(Boolean);
  return { status: r.status, stderr: r.stderr, lines, json: JSON.parse(lines[0]) };
};
const copyInput = (dest, filter = () => true) => {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(path.join(root, 'input')).filter(filter).forEach((f) => fs.copyFileSync(path.join(root, 'input', f), path.join(dest, f)));
  return dest;
};

beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moowhan-cli-')); });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('consolidate CLI', () => {
  it('fixtures: exit 0 with --allow-warnings, one JSON line, correct workbook cells', () => {
    const out = path.join(tmp, 'ok');
    const r = run(['--input', 'input', '--template', 'template.xlsx', '--out', out, '--now', NOW, '--allow-warnings', '--quiet']);
    expect(r.status).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.stderr).toBe('');
    expect(r.json.exitCode).toBe(0);
    expect(r.json.files).toHaveLength(5);
    expect(r.json.warnings.join(' ')).toMatch(/download\.xlsx/);
    expect(r.json.verification.ok).toBe(true);
    const xlsxOut = r.json.outputs.find((o) => o.path.endsWith('.xlsx'));
    expect(xlsxOut.bytes).toBeGreaterThan(1000);
    const wb = XLSX.read(fs.readFileSync(xlsxOut.path));
    expect(wb.Sheets['BP Daily'].A14.v).toBe('86790-0K051-00');
    expect(wb.Sheets.Analyze.EH3.v).toBe('BP');
    expect(r.json.outputs.some((o) => /run_202602\.json$/.test(o.path))).toBe(true);
  });

  it('fixtures: QA warnings do not gate the export, so the CLI writes a workbook without --allow-warnings', () => {
    const out = path.join(tmp, 'nowarn');
    const r = run(['--input', 'input', '--template', 'template.xlsx', '--out', out, '--now', NOW, '--quiet']);
    expect(r.status).toBe(0);
    expect(r.json.exitCode).toBe(0);
    expect(r.json.findings.some((f) => f.level === 'confirm' || f.level === 'block')).toBe(false);
    expect(r.json.outputs.some((o) => o.path.endsWith('.xlsx'))).toBe(true);
  });

  it('a confirm-level finding (a plant has no file) gives exit 2 and no workbook without --allow-warnings, exit 0 with it', () => {
    const dir = copyInput(path.join(tmp, 'noSR'), (f) => !/^SR /.test(f));
    const out = path.join(tmp, 'gate');
    const r = run(['--input', dir, '--template', 'template.xlsx', '--out', out, '--now', NOW]);
    expect(r.status).toBe(2);
    expect(r.json.outputs).toEqual([]);
    expect(r.json.findings.some((f) => f.level === 'confirm' && f.code === 'G02')).toBe(true);
    expect(r.stderr).toMatch(/--allow-warnings/);
    expect(fs.existsSync(out)).toBe(false);
    const ok = run(['--input', dir, '--template', 'template.xlsx', '--out', path.join(tmp, 'gate-ok'), '--now', NOW, '--allow-warnings', '--quiet']);
    expect(ok.status).toBe(0);
  });

  it('a block-level finding (month differs between files) gives exit 2 even with --allow-warnings', () => {
    const dir = copyInput(path.join(tmp, 'bad'));
    // a copy of the SR file whose PRODUCTION MONTH is changed => M01 (month differs between files) is an error
    const wb = XLSX.read(fs.readFileSync(path.join(dir, 'SR veh 481D.xls')));
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const row = aoa.find((r) => String(r[0]).trim() === 'PRODUCTION MONTH');
    row[1] = '202603';
    const bad = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(bad, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    fs.writeFileSync(path.join(dir, 'SR veh 481D.xls'), XLSX.write(bad, { bookType: 'biff8', type: 'buffer' }));
    const out = path.join(tmp, 'bad-out');
    const r = run(['--input', dir, '--template', 'template.xlsx', '--out', out, '--now', NOW, '--allow-warnings']);
    expect(r.status).toBe(2);
    expect(r.json.findings.some((f) => f.level === 'block')).toBe(true);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('two runs with the same --now produce an identical workbook hash', () => {
    const a = run(['--input', 'input', '--template', 'template.xlsx', '--out', path.join(tmp, 'a'), '--now', NOW, '--allow-warnings', '--quiet']);
    const b = run(['--input', 'input', '--template', 'template.xlsx', '--out', path.join(tmp, 'b'), '--now', NOW, '--allow-warnings', '--quiet']);
    const sha = (r) => r.json.outputs.find((o) => o.path.endsWith('.xlsx')).sha256;
    expect(sha(a)).toBe(sha(b));
  });

  it('--csv --json --bundle write the flat exports; verify re-checks an output and detects tampering', () => {
    const out = path.join(tmp, 'flat');
    const r = run(['--input', 'input', '--template', 'template.xlsx', '--out', out, '--now', NOW, '--allow-warnings', '--quiet', '--csv', '--json', '--bundle']);
    const names = r.json.outputs.map((o) => path.basename(o.path));
    expect(names).toEqual(expect.arrayContaining(['forecast_long_202602.csv', 'forecast_summary_202602.csv', 'forecast_202602.json', 'forecast_202602.zip']));
    const xlsxPath = r.json.outputs.find((o) => o.path.endsWith('.xlsx')).path;
    const ok = run(['verify', xlsxPath, '--input', 'input', '--template', 'template.xlsx', '--quiet']);
    expect(ok.status).toBe(0);
    expect(ok.json.verification.ok).toBe(true);
    // verify against a source set that is missing a plant: the workbook no longer matches
    const fewer = copyInput(path.join(tmp, 'fewer'), (f) => !f.startsWith('SR'));
    const bad = run(['verify', xlsxPath, '--input', fewer, '--template', 'template.xlsx', '--quiet']);
    expect(bad.status).toBe(3);
  });

  it('fatal errors exit 1 with a Thai message and still print one JSON line', () => {
    const r = run(['--input', path.join(tmp, 'missing'), '--template', 'template.xlsx']);
    expect(r.status).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.stderr).toMatch(/เปิดโฟลเดอร์/);
  });
});
