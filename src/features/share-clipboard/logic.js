// Pure share-text builders (no DOM/React). Optional sections come defensively from state.features.
import { PLANTS, MONTH_KEYS } from '../../constants.js';
import { formatNumber } from '../../utils/format.js';
import { toTsv } from '../../utils/serialize.js';
import { computeTotals } from '../../lib/excel/aggregate.js';
import { topMovers } from '../../lib/analytics/movers.js';
import { th, en } from '../../lib/analytics/labels.js';

export const SHORT_LIMIT = 1000;
const sum4 = (r) => MONTH_KEYS.reduce((s, k) => s + (r[k] || 0), 0);
const first = (metas, key) => metas.map((m) => m[key]).find((v) => v !== undefined && v !== '' && v !== null) ?? null;
const pmText = (v) => (v && typeof v === 'object' && v.year ? `${v.year}-${String(v.month).padStart(2, '0')}` : v ? String(v) : null);
const arr = (v) => (Array.isArray(v) ? v : []);

const T = {
  th: { title: 'สรุปแผนการผลิต TMT', month: 'เดือนผลิต', total: 'รวม 4 เดือน', plants: 'รายโรงงาน', movers: 'เปลี่ยนมากสุด (N→N+1)', file: 'ไฟล์', files: 'ไฟล์ต้นทาง', docks: 'แยกตาม Dock', notes: 'หมายเหตุ', gen: 'สร้างเมื่อ', hash: 'รหัสไฟล์', qa: 'QA', cmp: 'เทียบรอบก่อน', sent: 'ส่งแล้ว', warn: 'คำเตือน', empty: 'ยังไม่มีข้อมูลสรุป', none: 'ไม่มี', parts: 'Part Number' },
  en: { title: 'TMT production plan summary', month: 'Production month', total: 'Total 4 months', plants: 'By plant', movers: 'Top changes (N→N+1)', file: 'File', files: 'Source files', docks: 'By dock', notes: 'Notes', gen: 'Generated', hash: 'Hash', qa: 'QA', cmp: 'Vs previous run', sent: 'Sent', warn: 'Warnings', empty: 'No summary data yet', none: 'none', parts: 'Part Number' },
};

/** Plain data for every share mode; tolerant of empty state and missing optional features. */
export const buildShareModel = (state = {}, monthLabels = []) => {
  const summary = arr(state.summaryData);
  const files = arr(state.sourceFiles);
  const done = files.filter((f) => f.status === 'done' || f.meta);
  const metas = done.map((f) => f.meta).filter(Boolean);
  const totals = computeTotals(summary);
  const total4 = MONTH_KEYS.reduce((s, k) => s + totals[k], 0);
  const months = MONTH_KEYS.map((k, i) => ({ key: k, label: monthLabels[i] || th[k], value: totals[k] }));

  const byPlant = PLANTS.map((p) => {
    const rows = arr(state.processedData?.[`${p} Daily`]);
    return { plant: p, rows: rows.length, total: rows.reduce((s, r) => s + sum4(r), 0), rowsData: rows };
  });
  const plantSum = byPlant.reduce((s, p) => s + p.total, 0);
  const plants = byPlant.filter((p) => p.rows > 0).map((p) => ({ plant: p.plant, total: p.total, share: plantSum ? (p.total / plantSum) * 100 : 0 }));

  const docks = new Map();
  byPlant.forEach((p) => p.rowsData.forEach((r) => {
    const key = String(r.dockCode ?? '').trim() || '-';
    docks.set(key, (docks.get(key) || 0) + sum4(r));
  }));

  const f = state.features || {};
  const movers = topMovers(summary, 'n', 'n1', 3);
  const m = [...movers.up, ...movers.down].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3);
  const qaList = arr(f.qa?.findings ?? f.qa?.issues);
  const hash = f.manifest?.hash ?? f['provenance-manifest']?.hash ?? null;

  return {
    productionMonth: pmText(state.productionMonth ?? first(metas, 'productionMonth')),
    months, total4,
    parts: summary.length,
    plants,
    movers: m,
    issueDate: first(metas, 'issueDate'), revision: first(metas, 'revision'), forecastType: first(metas, 'forecastType'),
    docks: [...docks.entries()].map(([dock, total]) => ({ dock, total })).sort((a, b) => b.total - a.total || a.dock.localeCompare(b.dock)),
    notes: [...new Set(metas.map((x) => x.remarks).filter(Boolean))],
    files: files.map((x) => ({ name: x.name, ok: x.status !== 'error', plant: x.category })),
    failedFiles: files.filter((x) => x.status === 'error').map((x) => x.name),
    qa: qaList.length ? { count: qaList.length, blocking: qaList.filter((i) => i.level === 'block').length } : null,
    compare: f.compare?.summary ?? f.compare?.text ?? null,
    sent: f.sent?.at ?? f['run-history']?.sentAt ?? null,
    hash: hash ? String(hash).slice(0, 8) : null,
    rows: summary.map((r) => ({ partNumber: r.partNumber, plants: r.plants, n: r.n, n1: r.n1, n2: r.n2, n3: r.n3, total: sum4(r) })),
    fileName: state.exportReport?.fileName ?? null,
  };
};

export const buildShareTsv = (model, { lang = 'th' } = {}) => {
  const t = T[lang] || T.th;
  const head = [t.parts, 'Plants', ...model.months.map((x) => x.label), lang === 'en' ? 'Total' : 'รวม'];
  return toTsv([head, ...model.rows.map((r) => [r.partNumber, r.plants, r.n, r.n1, r.n2, r.n3, r.total])]);
};

const num = formatNumber;
const pctText = (v) => `${v.toFixed(1)}%`;

/** mode: 'short' (<= 1000 chars, LINE) | 'full' (email) | 'tsv'. */
export const buildShareText = (model, { mode = 'short', lang = 'th', now = new Date() } = {}) => {
  if (mode === 'tsv') return buildShareTsv(model, { lang });
  const t = T[lang] || T.th;
  if (!model.rows.length) return t.empty;
  const full = mode === 'full';
  const head = [`${t.title}${model.productionMonth ? ` — ${t.month} ${model.productionMonth}` : ''}`];
  const issue = [model.issueDate && `Issue ${model.issueDate}`, model.revision != null && `Rev ${model.revision}`, model.forecastType && `Type ${model.forecastType}`].filter(Boolean);
  if (issue.length) head.push(issue.join(' · '));
  const core = [
    ...model.months.map((x) => `${x.label}: ${num(x.value)}`),
    `${t.total}: ${num(model.total4)} (${model.parts} ${t.parts})`,
  ];
  const plantLines = model.plants.length ? [`${t.plants}:`, ...model.plants.map((p) => `• ${p.plant}: ${num(p.total)} (${pctText(p.share)})`)] : [];
  const extras = [];
  if (model.qa) extras.push(`${t.qa}: ${model.qa.count}${model.qa.blocking ? ` (block ${model.qa.blocking})` : ''}`);
  if (model.compare) extras.push(`${t.cmp}: ${model.compare}`);
  if (model.sent) extras.push(`${t.sent}: ${model.sent}`);
  const warns = model.failedFiles.length ? [`${t.warn}: ${model.failedFiles.join(', ')}`] : [];
  const moverLines = model.movers.length
    ? [`${t.movers}:`, ...model.movers.map((x) => `• ${x.partNumber}: ${x.diff > 0 ? '+' : ''}${num(x.diff)}${x.pct == null ? '' : ` (${x.pct > 0 ? '+' : ''}${x.pct.toFixed(1)}%)`}`)]
    : [];
  const fileLine = model.fileName ? [`${t.file}: ${model.fileName}`] : [];

  if (!full) {
    // drop sections in order (movers, then file name) until it fits the LINE limit
    const sections = { movers: moverLines, file: fileLine };
    const build = () => [head, core, plantLines, extras, warns, sections.movers, sections.file].filter((s) => s.length).map((s) => s.join('\n')).join('\n\n');
    let text = build();
    for (const key of ['movers', 'file']) {
      if (text.length <= SHORT_LIMIT) break;
      sections[key] = [];
      text = build();
    }
    return text.length > SHORT_LIMIT ? `${text.slice(0, SHORT_LIMIT - 1)}…` : text;
  }

  const dockLines = model.docks.length ? [`${t.docks}:`, ...model.docks.map((d) => `• ${d.dock}: ${num(d.total)}`)] : [];
  const noteLines = model.notes.length ? [`${t.notes}:`, ...model.notes.map((n) => `• ${n}`)] : [];
  const fileList = model.files.length ? [`${t.files}:`, ...model.files.map((f) => `• ${f.name}${f.ok ? '' : ' ✗'}`)] : [];
  const tail = [`${t.gen}: ${now.toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH')}`, ...(model.hash ? [`${t.hash}: ${model.hash}`] : [])];
  return [head, core, plantLines, moverLines, dockLines, extras, warns, noteLines, fileList, fileLine, tail]
    .filter((s) => s.length).map((s) => s.join('\n')).join('\n\n');
};
