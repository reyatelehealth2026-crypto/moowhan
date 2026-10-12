import { useMemo, useRef, useState } from 'react';
import { PLANTS, dailySheetName } from '../constants.js';
import { describeIntake, expandIncoming, isArchive } from '../features/import-cli/intake.js';
import { buildSummary, computeTotals } from '../lib/excel/aggregate.js';
import { categorizeFile } from '../lib/excel/categorize.js';
import { defaultProfile, DEFAULT_FILE_NAME_PATTERN } from '../features/settings-profile/profile.js';
import useProfileStore from '../features/settings-profile/useProfileStore.js';
import { sha256Hex } from '../features/qa-file-guards/hash.js';
import { findDuplicateFiles, resolveNewer } from '../features/qa-file-guards/logic.js';
import { monthLabels, parseProductionMonth, renderFileName } from '../utils/format.js';
import { sha256 } from '../utils/hash.js';
import { stampSubset } from '../features/provenance-manifest/stamp.js';
import { buildExportNotice, toUserError, userErrorText } from '../lib/errors.js';
import { planBatchCommit } from '../features/manual-edit/edits.js';
import { makeLastExport, redownload } from '../features/export-gate/lastExport.js';

// xlsx + jszip are only downloaded the first time a file is read/exported.
const loadExcel = () => import('../lib/excel/index.js');

let idSeq = 0;
const nextId = () => `f${++idSeq}-${Math.random().toString(36).slice(2, 7)}`;
const stamp = (entry) => ({ timestamp: new Date().toISOString(), ...entry });
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

const emptyProcessing = { active: false, current: 0, total: 0, status: '' };

/**
 * All application state + actions for the consolidator.
 * Components receive `{ state, actions }`; features get the same object as `ctx`.
 */
export default function useConsolidator({ expandFiles = null } = {}) {
  const [template, setTemplate] = useState(null);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [processing, setProcessing] = useState(emptyProcessing);
  const [exporting, setExporting] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [matchingDetails, setMatchingDetails] = useState(null);
  const [changeLog, setChangeLog] = useState([]);
  const [productionMonth, setProductionMonth] = useState(null);
  const [processedSignature, setProcessedSignature] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNoticeState] = useState(null); // { tone: 'warning' | 'success', message }
  const [exportReport, setExportReport] = useState(null);
  const [features, setFeatures] = useState({}); // per-feature data: state.features[id]
  const [isDemo, setIsDemo] = useState(false); // onboarding: sample data in use
  const [profile, setProfileState] = useState(defaultProfile); // loaded/saved by settings-profile (useProfileStore)
  const [lastExport, setLastExportState] = useState(null); // export-gate: { blob, fileName, report, verification, extraSheets } kept in memory
  const lastExportRef = useRef(null);

  // refs so async actions always see the latest values
  const refs = useRef({});
  refs.current = { template, sourceFiles, processedData, summaryData, profile, productionMonth, features, isDemo, processedSignature };
  const processingRef = useRef(false);
  const inspectCache = useRef(new Map()); // qa-file-guards: file id -> parsed source (processAll reuses it)

  const fileCounts = useMemo(
    () => PLANTS.reduce((acc, p) => ({ ...acc, [p]: sourceFiles.filter((f) => f.category === p).length }), {}),
    [sourceFiles],
  );
  const totals = useMemo(() => computeTotals(summaryData), [summaryData]);
  const labels = useMemo(() => monthLabels(productionMonth), [productionMonth]);
  const currentSignature = sourceFiles.map((f) => f.id).join('|');
  const isStale = !!processedData && processedSignature !== currentSignature;

  const log = (entries) => {
    const list = (Array.isArray(entries) ? entries : [entries]).map(stamp);
    if (list.length) setChangeLog((prev) => [...prev, ...list]);
  };
  const setFeatureData = (id, patchOrFn) =>
    setFeatures((prev) => {
      const cur = prev[id] || {};
      const patch = typeof patchOrFn === 'function' ? patchOrFn(cur) : patchOrFn;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  const setProfile = (patchOrFn) =>
    setProfileState((prev) => {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
      return { ...prev, ...patch, ui: { ...prev.ui, ...patch?.ui }, features: { ...prev.features, ...patch?.features } };
    });
  const replaceProfile = (next) => setProfileState(next); // whole-profile swap (import / hydrate); callers validate first
  const resetProfile = () => setProfileState(defaultProfile());
  useProfileStore(profile, replaceProfile);
  const setUiMode = (mode) => setProfile({ ui: { mode } });
  const setNotice = (message, tone = 'warning') => setNoticeState(message ? { tone, message } : null);

  // ---------- template ----------
  const setTemplateFile = async (file) => {
    if (!file) return;
    try {
      const excel = await loadExcel();
      const buffer = await file.arrayBuffer();
      const info = await excel.readTemplateBuffer(buffer);
      setTemplate({ name: file.name, size: file.size, sha256: await sha256(buffer), ...info });
      setError(null);
      if (info.kind === 'xls') {
        setNotice('ไฟล์หลักเป็น .xls จึงไม่สามารถเขียนลงไฟล์เดิมได้ ระบบจะสร้างไฟล์ใหม่โดยคัดลอกเฉพาะค่า (pivot/สูตรจะไม่ถูกรักษาไว้) แนะนำให้บันทึกเทมเพลตเป็น .xlsx');
      } else {
        setNotice(null);
      }
      log({ fileName: file.name, action: 'file', details: `โหลดไฟล์หลัก (${info.kind}, ${info.sheets.length} sheets)` });
    } catch (err) {
      setError(`ไม่สามารถอ่านไฟล์หลักได้: ${userErrorText(toUserError(err))}`);
    }
  };

  const removeTemplate = () => {
    setTemplate(null);
    setNotice(null);
  };

  // ---------- source files ----------
  // import-cli: `expandFiles(file)` (feature hook) turns .zip/.eml into File[]; everything then takes the normal path.
  // Plain files take the synchronous path (callers such as restore/makeCtx rely on it); only archives await.
  const addSourceFiles = (incoming) => {
    const list = Array.from(incoming || []);
    if (!expandFiles || !list.some((f) => isArchive(f.name))) return intake({ files: list, origin: new Map(), reports: [] });
    return expandIncoming(list, expandFiles).then(intake);
  };
  const intake = ({ files, origin, reports }) => {
    const existing = new Set(refs.current.sourceFiles.map((f) => f.name));
    const accepted = [];
    const rejected = [];
    const duplicates = [];
    files.forEach((file) => {
      const category = categorizeFile(file.name);
      if (!category) rejected.push(file);
      else if (existing.has(file.name)) duplicates.push(file);
      else {
        existing.add(file.name);
        accepted.push({ id: nextId(), name: file.name, size: file.size, category, file, status: 'inspecting', rowCount: 0, error: null, meta: null });
      }
    });
    if (accepted.length) { setSourceFiles((prev) => [...prev, ...accepted]); inspectFiles(accepted); }

    const problems = [];
    if (rejected.length) problems.push(`ไม่สามารถจัดประเภทไฟล์ได้ ${rejected.length} ไฟล์: ${rejected.map((f) => f.name).join(', ')}\nชื่อไฟล์ต้องขึ้นต้นด้วย BP, BPK, GW หรือ SR`);
    if (duplicates.length) problems.push(`ข้ามไฟล์ที่เพิ่มไว้แล้ว: ${duplicates.map((f) => f.name).join(', ')}`);
    const archiveErrors = reports.filter((r) => r.error).map((r) => describeIntake(r));
    setError([...archiveErrors, ...problems].join('\n') || null);

    const notes = reports.filter((r) => !r.error).map((report) => {
      const from = (f) => origin.get(f) === report.source;
      return describeIntake(report, {
        added: accepted.filter((a) => from(a.file)).map((a) => a.name),
        skipped: [
          ...rejected.filter(from).map((f) => ({ name: f.name, reason: 'จัดประเภทโรงงานไม่ได้' })),
          ...duplicates.filter(from).map((f) => ({ name: f.name, reason: 'เพิ่มไว้แล้ว' })),
        ],
      });
    });
    if (notes.length) {
      setNotice(notes.join('\n'), notes.some((n) => n.includes('ข้าม')) ? 'warning' : 'success');
      log(notes.map((details) => ({ action: 'file', details })));
    }
  };

  const removeSourceFile = (id) => { inspectCache.current.delete(id); setSourceFiles((prev) => prev.filter((f) => f.id !== id)); };
  const clearSourceFiles = () => { inspectCache.current.clear(); setSourceFiles([]); };

  // ---------- qa-file-guards: fingerprint + metadata as soon as a file arrives ----------
  const markDuplicates = (list) => {
    const dups = new Map(findDuplicateFiles(list).map((d) => [d.id, d.duplicateOf]));
    return list.map((f) => ((f.duplicateOf || null) === (dups.get(f.id) || null) ? f : { ...f, duplicateOf: dups.get(f.id) || null }));
  };
  const inspectFiles = async (list) => {
    let excel;
    try { excel = await loadExcel(); } catch { excel = null; }
    for (const f of list) {
      let patch = { status: 'ready' };
      try {
        if (!excel) throw new Error('no excel');
        const buffer = await f.file.arrayBuffer();
        const info = excel.inspectSourceBuffer(buffer);
        inspectCache.current.set(f.id, info.parsed);
        patch = { status: 'ready', sha256: await sha256Hex(buffer), rowsHash: info.fingerprint, meta: info.meta, rowCount: info.rowCount };
      } catch {
        // unreadable files are reported by processAll with the real error message
      }
      setSourceFiles((prev) => markDuplicates(prev.map((x) => (x.id === f.id && x.status === 'inspecting' ? { ...x, ...patch } : x))));
    }
  };

  // keep the newer of two files (revision > issue date > lastModified) and drop the other
  const useNewerFile = (idA, idB) => {
    const cur = refs.current.sourceFiles;
    const a = cur.find((f) => f.id === idA);
    const b = cur.find((f) => f.id === idB);
    if (!a || !b) return false;
    const newer = resolveNewer(a, b);
    const older = newer === a ? b : a;
    removeSourceFile(older.id);
    log({ fileName: older.name, plant: older.category, action: 'file', details: `ใช้ ${newer.name} (ใหม่กว่า) แทน ${older.name}` });
    return true;
  };

  // swap one file for another upload, keeping its place in the list
  const replaceSourceFile = (id, file) => {
    const cur = refs.current.sourceFiles;
    const old = cur.find((f) => f.id === id);
    const category = file && categorizeFile(file.name);
    if (!old || !category) { setError(`ไม่สามารถจัดประเภทไฟล์ได้: ${file?.name || ''}\nชื่อไฟล์ต้องขึ้นต้นด้วย BP, BPK, GW หรือ SR`); return false; }
    if (cur.some((f) => f.id !== id && f.name === file.name)) { setError(`ข้ามไฟล์ที่เพิ่มไว้แล้ว: ${file.name}`); return false; }
    const entry = { id: nextId(), name: file.name, size: file.size, category, file, status: 'inspecting', rowCount: 0, error: null, meta: null };
    inspectCache.current.delete(id);
    setSourceFiles((prev) => prev.map((f) => (f.id === id ? entry : f)));
    inspectFiles([entry]);
    setError(null);
    log({ fileName: file.name, plant: category, action: 'file', details: `แทนที่ ${old.name} ด้วย ${file.name}` });
    return true;
  };

  // ---------- processing ----------
  const processAll = async () => {
    const files = refs.current.sourceFiles;
    if (!files.length || processingRef.current) return false;
    processingRef.current = true;
    setProcessing({ active: true, current: 0, total: files.length, status: 'กำลังเริ่มต้นประมวลผล...' });
    setError(null);
    setNoticeState(null);

    const data = Object.fromEntries(PLANTS.map((p) => [dailySheetName(p), []]));
    const logs = [];
    const months = new Map(); // "202602" -> [file names]
    const outcomes = new Map(); // file id -> { status, rowCount, meta, error } (ProcessResult.files, used by qa-engine and run-history)

    try {
      const excel = await loadExcel();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProcessing({ active: true, current: i, total: files.length, status: `กำลังอ่านไฟล์: ${f.name}` });
        setSourceFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'processing', error: null } : x)));
        await yieldToBrowser();
        try {
          const cached = inspectCache.current.get(f.id);
          const parsed = cached || excel.readSourceBuffer(await f.file.arrayBuffer());
          const rows = parsed.rows.map((r) => ({ ...r })); // copies: row.id / plant below must not touch the cache
          const meta = parsed.meta;
          const digest = f.sha256 || await sha256(await f.file.arrayBuffer()); // hashed once per file, reused by the manifest
          rows.forEach((row, idx) => {
            row.id = `${f.id}-${idx}`;
            row.plant = f.category;
            row.fileName = f.name;
            row.partType = meta.partType || '';
            data[dailySheetName(f.category)].push(row);
            logs.push({ fileName: f.name, plant: f.category, partNumber: row.partNumber, action: 'extracted', details: `N=${row.n}, N+1=${row.n1}, N+2=${row.n2}, N+3=${row.n3}` });
          });
          if (!rows.length) {
            logs.push({ fileName: f.name, plant: f.category, action: 'warning', details: 'ไม่พบแถวข้อมูล (ตรวจสอบแถวหัวตาราง "PART NUMBER")' });
          }
          if (meta.productionMonthRaw) months.set(meta.productionMonthRaw, [...(months.get(meta.productionMonthRaw) || []), f.name]);
          const status = rows.length ? 'done' : 'warning';
          outcomes.set(f.id, { status, rowCount: rows.length, meta, error: null, size: f.size ?? f.file?.size ?? 0, sha256: digest, rows: rows.length }); // size/sha256/rows feed run-history
          setSourceFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status, rowCount: rows.length, meta, sha256: digest } : x)));
        } catch (err) {
          const userMsg = toUserError(err).code === 'generic' ? err.message : toUserError(err).title;
          outcomes.set(f.id, { status: 'error', rowCount: 0, meta: null, error: userMsg });
          setSourceFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'error', error: userMsg } : x)));
          logs.push({ fileName: f.name, plant: f.category, action: 'error', details: err.message });
        }
      }

      setProcessing({ active: true, current: files.length, total: files.length, status: 'กำลังคำนวณข้อมูลสรุป...' });
      await yieldToBrowser();

      const { summary, matching } = buildSummary(data);
      const distinct = [...months.keys()];
      const pm = distinct.length ? parseProductionMonth(distinct[0]) : null;
      if (distinct.length > 1) {
        const msg = `ไฟล์ที่อัปโหลดมี PRODUCTION MONTH ไม่ตรงกัน: ${distinct.map((m) => `${m} (${months.get(m).join(', ')})`).join(' | ')} กรุณาตรวจสอบก่อนส่งออก`;
        setNotice(msg);
        logs.push({ action: 'warning', details: msg });
      }
      const errors = logs.filter((l) => l.action === 'error').length;
      if (errors) setError(`อ่านไฟล์ไม่สำเร็จ ${errors} ไฟล์ ดูรายละเอียดในแท็บ "ประวัติการแก้ไข"`);

      setProductionMonth(pm);
      setProcessedData(data);
      setSummaryData(summary);
      setMatchingDetails(matching);
      setProcessedSignature(files.map((f) => f.id).join('|'));
      log(logs);
      return {
        processedData: data,
        summary,
        matching,
        productionMonth: pm,
        files: files.map((f) => ({ id: f.id, name: f.name, category: f.category, size: f.size, sha256: f.sha256 || null, ...outcomes.get(f.id) })),
      };
    } catch (err) {
      setError(`เกิดข้อผิดพลาดในการประมวลผล: ${err.message}`);
      return false;
    } finally {
      processingRef.current = false;
      setProcessing(emptyProcessing);
    }
  };

  // ---------- manual edits (pure core: features/manual-edit/edits.js) ----------
  // Replaces processedData as a whole: one buildSummary call, refs updated so a following action in the same tick sees it.
  const commitProcessedData = (next, logEntries = []) => {
    const { summary, matching } = buildSummary(next);
    refs.current = { ...refs.current, processedData: next, summaryData: summary };
    setProcessedData(next);
    setSummaryData(summary);
    setMatchingDetails(matching);
    log(logEntries);
  };

  // items: see applyBatch in edits.js. One buildSummary call and one log entry per applied item.
  const updateRowsBatch = (items, opts = {}) => {
    const current = refs.current.processedData;
    if (!current) return { results: [], applied: 0, processedData: current };
    const plan = { ...planBatchCommit(current, items, { buildSummary, calendar: opts.calendar }), previous: current };
    if (!plan.applied) return plan;
    refs.current = { ...refs.current, processedData: plan.processedData, summaryData: plan.summary };
    setProcessedData(plan.processedData);
    setSummaryData(plan.summary);
    setMatchingDetails(plan.matching);
    log(plan.logs);
    return plan;
  };

  // N..N+3 of one row; the day cells are reconciled (default strategy) so Daily sheets still sum to N.
  const updateRowValues = (sheetName, rowId, patch, reason = '', strategy) =>
    updateRowsBatch([{ sheet: sheetName, rowId, patch, reason, strategy }]).applied > 0;

  // ---------- export ----------
  // provenance-manifest: the stamp is opt-in (feature data), exportedAt only when a clock is supplied
  const optionalStamp = async (now) => {
    const cur = refs.current;
    if (!cur.features?.['provenance-manifest']?.stampEnabled) return null;
    return stampSubset({ template: cur.template, sourceFiles: cur.sourceFiles, productionMonth: cur.productionMonth }, { now });
  };
  const exportExcel = async (options = {}) => {
    const { processedData: data, summaryData: summary, template: tpl } = refs.current;
    if (!data) return null;
    setExporting(true);
    try {
      const excel = await loadExcel();
      const result = await excel.buildExport({
        template: tpl,
        processedData: data,
        summaryData: summary,
        highlight: options.highlight ?? refs.current.profile?.export?.highlight ?? true,
        extraSheets: options.extraSheets || [],
        cellWrites: options.cellWrites || [],
        protectedSheets: options.protectedSheets || [],
        overflow: options.overflow,
        clearBeyondTable: options.clearBeyondTable,
        addAutoFilter: options.addAutoFilter,
        stamp: options.stamp ?? await optionalStamp(options.now),
      });
      if (options.fileName) {
        result.fileName = options.fileName;
      } else {
        const pattern = refs.current.profile?.export?.fileNamePattern;
        if (pattern) {
          const named = renderFileName(pattern, { productionMonth: refs.current.productionMonth, fallback: result.fileName });
          result.fileName = result.report.mode === 'fallback' && pattern === DEFAULT_FILE_NAME_PATTERN ? named.replace('Production_Updated', 'Production_Summary') : named;
        }
      }
      if (refs.current.isDemo && !result.fileName.startsWith('DEMO_')) result.fileName = `DEMO_${result.fileName}`; // onboarding: sample data is never mistaken for real output
      result.report.fileName = result.fileName;
      result.report.sha256 = await sha256(result.blob); // identifies the bytes this app produced
      // signature = which data was downloaded (onboarding step 5); held exports get it when downloadLastExport() runs
      const downloaded = options.download !== false && !options.hold;
      setLastExport(makeLastExport(result, { extraSheets: options.extraSheets || [], highlight: options.highlight ?? true, ...(downloaded ? { signature: refs.current.processedSignature } : {}) }), true);
      if (options.hold) { // export-gate verifies first and downloads later through downloadLastExport()
        setExportReport(result.report);
        return { ...result, extraSheets: options.extraSheets || [] };
      }
      if (options.download !== false) excel.downloadBlob(result.blob, result.fileName);
      setExportReport(result.report);
      const parts = result.report.mode === 'template'
        ? `เขียนลงเทมเพลต: ${result.report.patched.map((p) => `${p.sheet} ${p.rows} แถว`).join(', ')}`
        : 'สร้างไฟล์ใหม่ (ไม่มีเทมเพลต .xlsx)';
      const exportNotice = buildExportNotice(result.report, result.fileName);
      setNotice(exportNotice.message, exportNotice.tone);
      log({ fileName: result.fileName, action: 'export', details: parts });
      return result;
    } catch (err) {
      setError(`เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์: ${err.message}`);
      return null;
    } finally {
      setExporting(false);
    }
  };

  // ---------- last export (export-gate) ----------
  // replace = true stores a whole entry, otherwise `entry` is merged into the remembered one; null clears
  const setLastExport = (entry, replace = false) => {
    const next = entry === null ? null : replace ? entry : lastExportRef.current ? { ...lastExportRef.current, ...entry } : null;
    lastExportRef.current = next;
    setLastExportState(next);
  };
  // download the remembered file again: the template is NOT patched a second time
  // options.saveTo(last) -> { ok, name } | { ok: false, error } saves somewhere else (a chosen folder); on failure the
  // normal browser download runs instead, with a warning
  const downloadLastExport = async ({ saveTo, folderName } = {}) => {
    const last = lastExportRef.current;
    if (!last) return null;
    const excel = await loadExcel();
    const saved = saveTo ? await saveTo(last) : null;
    if (!saved?.ok) redownload(last, excel.downloadBlob);
    setLastExport({ signature: refs.current.processedSignature }); // onboarding: this data has now been downloaded
    const report = last.report;
    const parts = report.mode === 'template'
      ? `เขียนลงเทมเพลต: ${report.patched.map((p) => `${p.sheet} ${p.rows} แถว`).join(', ')}`
      : 'สร้างไฟล์ใหม่ (ไม่มีเทมเพลต .xlsx)';
    const warn = report.warnings?.length ? `\n${report.warnings.join('\n')}` : '';
    const where = saved?.ok ? `บันทึก ${saved.name} ลงโฟลเดอร์ “${folderName || ''}” แล้ว` : `ดาวน์โหลด ${last.fileName} แล้ว`;
    const folderWarn = saved && !saved.ok ? `\nบันทึกลงโฟลเดอร์ไม่สำเร็จ (${saved.error}) จึงดาวน์โหลดผ่านเบราว์เซอร์แทน` : '';
    setNotice(`${where} • ${parts}${warn}${folderWarn}`, report.warnings?.length || folderWarn ? 'warning' : 'success');
    log({ fileName: saved?.ok ? saved.name : last.fileName, action: 'export', details: `${parts}${saved?.ok ? ` • โฟลเดอร์ ${folderName || ''}` : ''}` });
    return saved?.ok ? { ...last, savedAs: saved.name } : last;
  };

  // ---------- reset ----------
  const reset = () => {
    inspectCache.current.clear();
    setLastExport(null);
    setTemplate(null);
    setSourceFiles([]);
    setProcessing(emptyProcessing);
    setProcessedData(null);
    setSummaryData(null);
    setMatchingDetails(null);
    setChangeLog([]);
    setProductionMonth(null);
    setProcessedSignature('');
    setError(null);
    setNoticeState(null);
    setExportReport(null);
    setFeatures({});
    setIsDemo(false);
  };

  const state = {
    template, sourceFiles, processing, exporting,
    processedData, summaryData, matchingDetails, changeLog,
    productionMonth, monthLabels: labels, totals, fileCounts,
    error, notice, exportReport, isStale, features, profile, lastExport,
    isDemo, processedSignature,
  };
  const actions = {
    setTemplateFile, removeTemplate,
    addSourceFiles, removeSourceFile, clearSourceFiles, useNewerFile, replaceSourceFile,
    processAll, updateRowValues, updateRowsBatch, commitProcessedData, exportExcel, reset,
    setError, setNotice, log, setDemo: setIsDemo, setFeatureData, setProfile, replaceProfile, resetProfile, setUiMode,
    downloadLastExport, setLastExport, getLastExport: () => lastExportRef.current,
    dismissError: () => setError(null),
    dismissNotice: () => setNoticeState(null),
  };
  return { state, actions };
}
