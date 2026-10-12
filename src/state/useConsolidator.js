import { useMemo, useRef, useState } from 'react';
import { MONTH_KEYS, PLANTS, dailySheetName } from '../constants.js';
import { buildSummary, computeTotals } from '../lib/excel/aggregate.js';
import { categorizeFile } from '../lib/excel/categorize.js';
import { DEFAULT_PROFILE } from '../features/visibility.js';
import { monthLabels, parseProductionMonth } from '../utils/format.js';
import { sha256 } from '../utils/hash.js';
import { stampSubset } from '../features/provenance-manifest/stamp.js';

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
export default function useConsolidator() {
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
  const [profile, setProfileState] = useState(DEFAULT_PROFILE); // standalone default until settings-profile persists it

  // refs so async actions always see the latest values
  const refs = useRef({});
  refs.current = { template, sourceFiles, processedData, summaryData, productionMonth, features };
  const processingRef = useRef(false);

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
      setError(`ไม่สามารถอ่านไฟล์หลักได้: ${err.message}`);
    }
  };

  const removeTemplate = () => {
    setTemplate(null);
    setNotice(null);
  };

  // ---------- source files ----------
  const addSourceFiles = (files) => {
    const existing = new Set(refs.current.sourceFiles.map((f) => f.name));
    const accepted = [];
    const rejected = [];
    const duplicates = [];
    Array.from(files || []).forEach((file) => {
      const category = categorizeFile(file.name);
      if (!category) rejected.push(file.name);
      else if (existing.has(file.name)) duplicates.push(file.name);
      else {
        existing.add(file.name);
        accepted.push({ id: nextId(), name: file.name, size: file.size, category, file, status: 'ready', rowCount: 0, error: null, meta: null });
      }
    });
    if (accepted.length) setSourceFiles((prev) => [...prev, ...accepted]);

    const problems = [];
    if (rejected.length) problems.push(`ไม่สามารถจัดประเภทไฟล์ได้ ${rejected.length} ไฟล์: ${rejected.join(', ')}\nชื่อไฟล์ต้องขึ้นต้นด้วย BP, BPK, GW หรือ SR`);
    if (duplicates.length) problems.push(`ข้ามไฟล์ที่เพิ่มไว้แล้ว: ${duplicates.join(', ')}`);
    setError(problems.length ? problems.join('\n') : null);
  };

  const removeSourceFile = (id) => setSourceFiles((prev) => prev.filter((f) => f.id !== id));
  const clearSourceFiles = () => setSourceFiles([]);

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

    try {
      const excel = await loadExcel();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProcessing({ active: true, current: i, total: files.length, status: `กำลังอ่านไฟล์: ${f.name}` });
        setSourceFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'processing', error: null } : x)));
        await yieldToBrowser();
        try {
          const buffer = await f.file.arrayBuffer();
          const digest = f.sha256 || await sha256(buffer); // hashed once per file, reused by the manifest
          const { rows, meta } = excel.readSourceBuffer(buffer);
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
          setSourceFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'done', rowCount: rows.length, meta, sha256: digest } : x)));
        } catch (err) {
          setSourceFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'error', error: err.message } : x)));
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
        files: files.map((f) => ({ id: f.id, name: f.name, category: f.category })),
      };
    } catch (err) {
      setError(`เกิดข้อผิดพลาดในการประมวลผล: ${err.message}`);
      return false;
    } finally {
      processingRef.current = false;
      setProcessing(emptyProcessing);
    }
  };

  // ---------- manual edits (N..N+3 of one row) ----------
  const updateRowValues = (sheetName, rowId, patch, reason = '') => {
    const current = refs.current.processedData;
    if (!current?.[sheetName]) return false;
    const idx = current[sheetName].findIndex((r) => r.id === rowId);
    if (idx === -1) return false;
    const before = current[sheetName][idx];
    const row = { ...before, rawRow: [...(before.rawRow || [])] };
    const changes = [];
    MONTH_KEYS.forEach((k) => {
      if (patch[k] === undefined || patch[k] === null || patch[k] === '') return;
      const value = Number(patch[k]);
      if (!Number.isFinite(value) || value === before[k]) return;
      row[k] = value;
      const col = before.colPositions?.[`${k}Col`];
      if (col !== undefined) row.rawRow[col] = value;
      changes.push(`${k.toUpperCase().replace('N1', 'N+1').replace('N2', 'N+2').replace('N3', 'N+3')}: ${before[k]} → ${value}`);
    });
    if (!changes.length) return false;
    row.edited = true;
    const next = { ...current, [sheetName]: current[sheetName].map((r, i) => (i === idx ? row : r)) };
    const { summary, matching } = buildSummary(next);
    setProcessedData(next);
    setSummaryData(summary);
    setMatchingDetails(matching);
    log({ fileName: before.fileName, plant: before.plant, partNumber: before.partNumber, dockCode: before.dockCode, action: 'edit', details: `${changes.join(', ')}${reason ? ` (${reason})` : ''}` });
    return true;
  };

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
        highlight: options.highlight ?? true,
        extraSheets: options.extraSheets || [],
        cellWrites: options.cellWrites || [],
        protectedSheets: options.protectedSheets || [],
        overflow: options.overflow,
        clearBeyondTable: options.clearBeyondTable,
        addAutoFilter: options.addAutoFilter,
        stamp: options.stamp ?? await optionalStamp(options.now),
      });
      result.report.fileName = result.fileName;
      result.report.sha256 = await sha256(result.blob); // identifies the bytes this app produced
      if (options.download !== false) excel.downloadBlob(result.blob, result.fileName);
      setExportReport(result.report);
      const parts = result.report.mode === 'template'
        ? `เขียนลงเทมเพลต: ${result.report.patched.map((p) => `${p.sheet} ${p.rows} แถว`).join(', ')}`
        : 'สร้างไฟล์ใหม่ (ไม่มีเทมเพลต .xlsx)';
      const warn = result.report.warnings?.length ? `\n${result.report.warnings.join('\n')}` : '';
      setNotice(`ดาวน์โหลด ${result.fileName} แล้ว • ${parts}${warn}`, result.report.warnings?.length ? 'warning' : 'success');
      log({ fileName: result.fileName, action: 'export', details: parts });
      return result;
    } catch (err) {
      setError(`เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์: ${err.message}`);
      return null;
    } finally {
      setExporting(false);
    }
  };

  // ---------- reset ----------
  const reset = () => {
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
  };

  const state = {
    template, sourceFiles, processing, exporting,
    processedData, summaryData, matchingDetails, changeLog,
    productionMonth, monthLabels: labels, totals, fileCounts,
    error, notice, exportReport, isStale, features, profile,
  };
  const actions = {
    setTemplateFile, removeTemplate,
    addSourceFiles, removeSourceFile, clearSourceFiles,
    processAll, updateRowValues, exportExcel, reset,
    setError, setNotice, log, setFeatureData, setProfile, setUiMode,
    dismissError: () => setError(null),
    dismissNotice: () => setNoticeState(null),
  };
  return { state, actions };
}
