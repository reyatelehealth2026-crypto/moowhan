// ==================== CLI PIPELINE (Node only, no React / DOM / network) ====================
// scan -> categorize -> read -> summary -> QA rules + export gate -> build -> verify -> outputs.
// Imports only src/lib/**, src/utils/**, src/constants.js and pure feature modules (see tests/cli.test.js).
import fs from 'node:fs/promises';
import path from 'node:path';
import { PLANTS, dailySheetName } from '../../constants.js';
import { buildSummary, computeTotals } from '../../lib/excel/aggregate.js';
import { inspectSourceBuffer, readTemplateBuffer, buildExport, verifyExport, zipFiles } from '../../lib/excel/index.js';
import { monthLabels, parseProductionMonth, renderFileName } from '../../utils/format.js';
import { sha256 } from '../../utils/hash.js';
import { runRules } from '../qa-engine/engine.js';
import { toContractIssue } from '../qa-engine/model.js';
import { buildGate } from '../export-gate/gate.js';
import { defaultFilePattern } from '../export-gate/plan.js';
import { buildManifest, manifestFileName, manifestJson } from '../provenance-manifest/manifest.js';
import { stampSubset } from '../provenance-manifest/stamp.js';
import { BUILTIN_PRESETS, applyPreset, presetById } from '../flat-export/presets.js';
import { buildJsonExport, buildLongRows, buildSummaryRows, monthToken } from '../flat-export/logic.js';
import { toCsv } from '../flat-export/serialize.js';
import { categorizeFile } from '../../lib/excel/categorize.js';
import '../qa-file-guards/rules.js'; // registers D01-D04 / F01 into the qa-engine (same gate as the UI)

export const SCHEMA_VERSION = 1;
export const EXIT = { ok: 0, fatal: 1, gate: 2, verification: 3 };

export const USAGE = `ใช้งาน: consolidate --input <โฟลเดอร์ไฟล์ .xls> --template <template.xlsx> [--out <โฟลเดอร์>]
  [--profile <profile.json>] [--name <รูปแบบชื่อไฟล์>] [--csv] [--json] [--bundle]
  [--allow-warnings] [--now <ISO>] [--quiet]
  consolidate verify <ไฟล์.xlsx> --input <โฟลเดอร์> [--template <template.xlsx>] [--now <ISO>]
exit code: 0 สำเร็จ · 1 ผิดพลาดร้ายแรง · 2 ไม่ผ่านด่านตรวจ · 3 ตรวจไฟล์ที่ส่งออกไม่ผ่าน`;

const FLAGS = new Set(['csv', 'json', 'bundle', 'allow-warnings', 'quiet', 'help']);
const VALUE_OPTS = new Set(['input', 'template', 'out', 'profile', 'name', 'now']);

export const parseArgs = (argv = []) => {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { opts._.push(a); continue; }
    const [key, inline] = a.slice(2).split(/=(.*)/s);
    if (FLAGS.has(key)) opts[key] = true;
    else if (VALUE_OPTS.has(key)) {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith('--')) throw new CliError(`ตัวเลือก --${key} ต้องมีค่า`);
      opts[key] = v;
    } else throw new CliError(`ไม่รู้จักตัวเลือก --${key}\n${USAGE}`);
  }
  return opts;
};

class CliError extends Error {}

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const SOURCE_EXT = /\.(xls|xlsx)$/i;
const LEVEL = { error: 'block', warning: 'confirm', info: 'info', block: 'block', confirm: 'confirm' };

const parseNow = (value) => {
  if (value === undefined) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new CliError(`--now ต้องเป็นวันที่แบบ ISO เช่น 2026-02-05T09:00:00Z (ได้รับ "${value}")`);
  return d;
};

/** Reads *.xls / *.xlsx in `dir` (not recursive), skipping the template itself. Names sorted for stable output. */
async function loadSources(dir, templatePath, warnings) {
  let names;
  try { names = await fs.readdir(dir); } catch { throw new CliError(`เปิดโฟลเดอร์ --input ไม่ได้: ${dir}`); }
  const skipTemplate = templatePath ? path.resolve(templatePath) : null;
  const sourceFiles = [];
  let seq = 0;
  for (const name of names.filter((n) => SOURCE_EXT.test(n) && !n.startsWith('~$')).sort()) {
    const full = path.join(dir, name);
    if (skipTemplate && path.resolve(full) === skipTemplate) continue;
    const category = categorizeFile(name);
    if (!category) {
      warnings.push(`ข้ามไฟล์ ${name}: จัดประเภทโรงงานไม่ได้ (ชื่อไฟล์ต้องขึ้นต้นด้วย BP, BPK, GW หรือ SR)`);
      continue;
    }
    const buf = await fs.readFile(full);
    const ab = toArrayBuffer(buf);
    const entry = { id: `f${++seq}`, name, size: buf.length, category, status: 'ready', rowCount: 0, error: null, meta: null, sha256: await sha256(ab), buffer: ab };
    try {
      const { rows, meta, fingerprint } = inspectSourceBuffer(ab);
      entry.rowsHash = fingerprint;
      entry.rows = rows;
      entry.meta = meta;
      entry.rowCount = rows.length;
      entry.status = rows.length ? 'done' : 'warning';
      if (!rows.length) warnings.push(`${name}: ไม่พบแถวข้อมูล (ตรวจสอบแถวหัวตาราง "PART NUMBER")`);
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
      warnings.push(`${name}: อ่านไฟล์ไม่สำเร็จ - ${err.message}`);
    }
    sourceFiles.push(entry);
  }
  return sourceFiles;
}

const processFiles = (sourceFiles) => {
  const data = Object.fromEntries(PLANTS.map((p) => [dailySheetName(p), []]));
  const months = [];
  sourceFiles.forEach((f) => {
    (f.rows || []).forEach((row, idx) => {
      row.id = `${f.id}-${idx}`;
      row.plant = f.category;
      row.fileName = f.name;
      row.partType = f.meta?.partType || '';
      data[dailySheetName(f.category)].push(row);
    });
    if (f.meta?.productionMonthRaw && !months.includes(f.meta.productionMonthRaw)) months.push(f.meta.productionMonthRaw);
  });
  const { summary, matching } = buildSummary(data);
  const productionMonth = months.length ? parseProductionMonth(months[0]) : null;
  return { data, summary, matching, productionMonth };
};

const normalise = (source, i) => ({
  source,
  level: LEVEL[i.level] || 'info',
  code: i.rule || i.code || '',
  message: i.message || '',
  ...(i.sheet ? { sheet: i.sheet } : {}),
  ...(i.fileName ? { fileName: i.fileName } : {}),
  ...(i.fix ? { fix: i.fix } : {}),
});

// info findings can number in the hundreds (R08, K05): keep one entry per rule with a count.
const compactInfo = (findings) => {
  const info = new Map();
  const rest = [];
  findings.forEach((f) => {
    if (f.level !== 'info') { rest.push(f); return; }
    const key = `${f.source}|${f.code}`;
    const cur = info.get(key);
    if (cur) cur.count += 1;
    else info.set(key, { ...f, count: 1 });
  });
  return [...rest, ...[...info.values()].map(({ count, fix, sheet, fileName, ...f }) => ({ ...f, count }))];
};

const loadProfile = async (file) => {
  if (!file) return {};
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (err) { throw new CliError(`อ่านไฟล์ --profile ไม่ได้ (${err.message})`); }
};

const newResult = () => ({
  schemaVersion: SCHEMA_VERSION, outputs: [], files: [], totals: null, findings: [], verification: null, warnings: [], exitCode: EXIT.ok,
});

const describeOutput = async (file, bytes) => ({ path: file, sha256: await sha256(bytes), bytes: bytes.byteLength ?? bytes.length });

/** Writes bytes and returns the output record. */
async function writeOut(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return describeOutput(file, bytes);
}

/** Builds the state-like object the feature modules (gate, QA, manifest, flat-export) expect. */
const makeState = ({ template, sourceFiles, processed, profile }) => ({
  template, sourceFiles, processedData: processed.data, summaryData: processed.summary, matchingDetails: processed.matching,
  productionMonth: processed.productionMonth, totals: computeTotals(processed.summary), monthLabels: monthLabels(processed.productionMonth),
  changeLog: [], features: {}, isStale: false, profile,
});

const publicFiles = (sourceFiles, month) => sourceFiles.filter((f) => f.status !== 'error').map((f) => ({
  name: f.name, plant: f.category, rows: f.rowCount, productionMonth: f.meta?.productionMonthRaw || month, revision: f.meta?.revision || '', sha256: f.sha256,
}));

/**
 * Runs the consolidation. Never throws: failures become { exitCode: 1 } plus `error` text for stderr.
 * @returns {Promise<{ result: object, stderr: string[] }>}
 */
export async function runConsolidate(opts, { cwd = process.cwd() } = {}) {
  const result = newResult();
  const stderr = [];
  try {
    if (!opts.input) throw new CliError(`ต้องระบุ --input\n${USAGE}`);
    if (!opts.template) throw new CliError(`ต้องระบุ --template\n${USAGE}`);
    const now = parseNow(opts.now);
    const abs = (p) => path.resolve(cwd, p);
    const profile = await loadProfile(opts.profile && abs(opts.profile));

    let tplBytes;
    try { tplBytes = await fs.readFile(abs(opts.template)); } catch { throw new CliError(`เปิดไฟล์ --template ไม่ได้: ${opts.template}`); }
    const tplBuffer = toArrayBuffer(tplBytes);
    const info = await readTemplateBuffer(tplBuffer);
    const template = { name: path.basename(opts.template), size: tplBytes.length, sha256: await sha256(tplBuffer), ...info };

    const sourceFiles = await loadSources(abs(opts.input), abs(opts.template), result.warnings);
    if (!sourceFiles.length) throw new CliError('ไม่พบไฟล์ต้นทาง .xls/.xlsx ที่ขึ้นต้นด้วย BP, BPK, GW หรือ SR ในโฟลเดอร์ --input');

    const processed = processFiles(sourceFiles);
    const state = makeState({ template, sourceFiles, processed, profile });
    result.files = publicFiles(sourceFiles, state.productionMonth ? `${state.productionMonth.year}${String(state.productionMonth.month).padStart(2, '0')}` : '');
    result.totals = { overall: state.totals, rows: Object.fromEntries(PLANTS.map((p) => [p, processed.data[dailySheetName(p)].length])) };

    // --- gate: the same QA rules and export-gate rules the UI uses ---
    const qa = runRules({
      processedData: processed.data, sourceFiles, productionMonth: processed.productionMonth, template,
      settings: profile?.features?.['qa-engine']?.settings, today: now,
    });
    qa.filter((i) => !i.waived).map(toContractIssue).forEach((i) => result.findings.push(normalise('qa', i)));
    buildGate({ state }).forEach((i) => result.findings.push(normalise('gate', i)));
    result.findings = compactInfo(result.findings);
    const blocking = result.findings.filter((f) => f.level === 'block');
    const confirm = result.findings.filter((f) => f.level === 'confirm');
    result.findings.filter((f) => f.level !== 'info').forEach((f) => stderr.push(`[${f.level === 'block' ? 'ต้องแก้' : 'ควรดู'}] ${f.code} ${f.message}`));
    if (blocking.length || (confirm.length && !opts['allow-warnings'])) {
      result.exitCode = EXIT.gate;
      stderr.push(blocking.length
        ? `ไม่สร้างไฟล์: พบรายการที่ต้องแก้ ${blocking.length} รายการ`
        : `ไม่สร้างไฟล์: พบรายการที่ควรดู ${confirm.length} รายการ (ใช้ --allow-warnings หากรับทราบแล้ว)`);
      return { result, stderr };
    }

    // --- build + verify ---
    const extraSheets = [];
    const stamp = await stampSubset({ template, sourceFiles, productionMonth: processed.productionMonth }, { now });
    const built = await buildExport({ template, processedData: processed.data, summaryData: processed.summary, highlight: true, extraSheets, stamp, now });
    const bytes = new Uint8Array(await built.blob.arrayBuffer());
    const verification = await verifyExport(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
      processedData: processed.data, extraSheets, templateBuffer: template.kind === 'xlsx' ? template.buffer : null, report: built.report,
    });
    result.verification = { ok: verification.ok, mode: verification.mode, failed: (verification.failed || []).map((c) => ({ id: c.id, message: c.message })) };
    result.warnings.push(...(built.report.warnings || []));

    const outDir = abs(opts.out || 'out');
    const pattern = profile?.export?.fileNamePattern || opts.name || defaultFilePattern(template);
    let fileName = renderFileName(opts.name || pattern, { productionMonth: processed.productionMonth, date: now.toISOString().slice(0, 10), now });
    if (verification.ok === false) {
      fileName = fileName.replace(/\.xlsx$/i, '_UNVERIFIED.xlsx');
      result.exitCode = EXIT.verification;
      result.verification.failed.forEach((c) => stderr.push(`[ตรวจไฟล์ไม่ผ่าน] ${c.id} ${c.message || ''}`));
      stderr.push('ไฟล์ที่ส่งออกไม่ผ่านการตรวจสอบ จึงเติม _UNVERIFIED ท้ายชื่อไฟล์ - อย่าส่งต่อ');
    }
    result.outputs.push(await writeOut(path.join(outDir, fileName), bytes));
    built.report.sha256 = result.outputs[0].sha256;
    built.report.fileName = fileName;

    // --- manifest + optional flat exports ---
    const exportState = { ...state, exportReport: built.report, sourceFiles: sourceFiles.map(({ buffer, rows, ...rest }) => rest) };
    const manifest = buildManifest(exportState, { now });
    result.outputs.push(await writeOut(path.join(outDir, manifestFileName(manifest)), new TextEncoder().encode(manifestJson(manifest))));

    if (opts.csv || opts.json || opts.bundle) {
      const token = monthToken(exportState);
      const preset = presetById(profile?.features?.['flat-export']?.settings?.preset, BUILTIN_PRESETS);
      const long = applyPreset(buildLongRows(processed.data, processed.productionMonth, { files: exportState.sourceFiles }), preset);
      const files = {
        long: { name: `forecast_long_${token}.csv`, content: toCsv(long.aoa, { delimiter: long.delimiter }) },
        wide: { name: `forecast_summary_${token}.csv`, content: toCsv(buildSummaryRows(processed.summary, processed.productionMonth), { delimiter: long.delimiter }) },
        json: { name: `forecast_${token}.json`, content: JSON.stringify(buildJsonExport(exportState, { now: () => now }), null, 2) },
      };
      const write = async (f) => result.outputs.push(await writeOut(path.join(outDir, f.name), new TextEncoder().encode(f.content)));
      if (opts.csv) { await write(files.long); await write(files.wide); }
      if (opts.json) await write(files.json);
      if (opts.bundle) result.outputs.push(await writeOut(path.join(outDir, `forecast_${token}.zip`), await zipFiles([files.long, files.wide, files.json])));
    }
    return { result, stderr };
  } catch (err) {
    result.exitCode = EXIT.fatal;
    stderr.push(err instanceof CliError ? err.message : `เกิดข้อผิดพลาด: ${err?.message || err}`);
    return { result, stderr };
  }
}

/** `consolidate verify <xlsx> --input <dir>`: re-checks an output file against the sources it was built from. */
export async function runVerify(opts, { cwd = process.cwd() } = {}) {
  const result = newResult();
  const stderr = [];
  try {
    const file = opts._[1];
    if (!file || !opts.input) throw new CliError(`ใช้งาน: consolidate verify <ไฟล์.xlsx> --input <โฟลเดอร์>\n${USAGE}`);
    const abs = (p) => path.resolve(cwd, p);
    let bytes;
    try { bytes = await fs.readFile(abs(file)); } catch { throw new CliError(`เปิดไฟล์ไม่ได้: ${file}`); }
    let template = null;
    if (opts.template) template = { ...(await readTemplateBuffer(toArrayBuffer(await fs.readFile(abs(opts.template))))) };
    const sourceFiles = await loadSources(abs(opts.input), opts.template ? abs(opts.template) : null, result.warnings);
    const processed = processFiles(sourceFiles);
    result.files = publicFiles(sourceFiles, '');
    const v = await verifyExport(toArrayBuffer(bytes), { processedData: processed.data, templateBuffer: template?.kind === 'xlsx' ? template.buffer : null });
    result.verification = { ok: v.ok, mode: v.mode, failed: (v.failed || []).map((c) => ({ id: c.id, message: c.message })) };
    result.outputs.push(await describeOutput(abs(file), bytes));
    if (v.ok === false) {
      result.exitCode = EXIT.verification;
      result.verification.failed.forEach((c) => stderr.push(`[ตรวจไม่ผ่าน] ${c.id} ${c.message || ''}`));
    }
  } catch (err) {
    result.exitCode = EXIT.fatal;
    stderr.push(err instanceof CliError ? err.message : `เกิดข้อผิดพลาด: ${err?.message || err}`);
  }
  return { result, stderr };
}

/** Entry used by scripts/consolidate.mjs. Prints exactly one JSON line on stdout; findings go to stderr. */
export async function main(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(s));
  const err = io.stderr || ((s) => process.stderr.write(s));
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    err(`${e.message}\n`);
    const r = newResult(); r.exitCode = EXIT.fatal; out(`${JSON.stringify(r)}\n`);
    return EXIT.fatal;
  }
  if (opts.help || opts._[0] === 'help') { err(`${USAGE}\n`); const r = newResult(); out(`${JSON.stringify(r)}\n`); return EXIT.ok; }
  const { result, stderr } = opts._[0] === 'verify' ? await runVerify(opts, io) : await runConsolidate(opts, io);
  if (!opts.quiet) stderr.forEach((l) => err(`${l}\n`));
  out(`${JSON.stringify(result)}\n`);
  return result.exitCode;
}
