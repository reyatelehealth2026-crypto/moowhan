// Printable / PNG report. Pure model + SVG string builders; only svgToPngBlob / savePng touch the browser.
import { PLANT_META } from '../../constants.js';
import { formatNumber } from '../../utils/format.js';
import { th } from '../../lib/analytics/labels.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => `${(v || 0).toFixed(1)}%`;

/** Plain data for the report card; pure (same input -> same output). */
export const buildReportModel = (analytics, { monthLabels = [], productionMonth = null } = {}) => {
  const { kpis, matrix, pareto } = analytics;
  const months = ['n', 'n1', 'n2', 'n3'].map((k, i) => ({ key: k, label: monthLabels[i] || th[k], value: kpis.totals[k] }));
  return {
    title: 'แผนการผลิตรายเดือน TMT',
    productionMonth,
    months,
    total4: kpis.total4,
    parts: kpis.parts,
    rows: kpis.rows,
    plantsText: `${kpis.plantsWithFiles.length}/4`,
    issue: `Issue ${kpis.issueDate ?? '-'} · Rev ${kpis.revision ?? '-'} · Type ${kpis.forecastType ?? '-'}`,
    plants: matrix.rows.map((r) => ({ plant: r.plant, total: r.total, share: r.share })),
    top5Share: pareto.top5Share * 100,
    reach80: pareto.countToReach(0.8),
  };
};

/** Standalone SVG string (no external fonts/images) for the 'บันทึกเป็นรูป' button. */
export const buildSummaryCardSvg = (model, { width = 1080 } = {}) => {
  const pad = 48;
  const height = 720;
  const max = Math.max(...model.months.map((m) => m.value), 1);
  const barW = width - pad * 2 - 260;
  const font = 'font-family="Leelawadee UI, Thonburi, Sarabun, Noto Sans Thai, system-ui, sans-serif"';
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${font}>`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${pad}" y="70" font-size="34" font-weight="700" fill="#0f172a">${esc(model.title)}</text>`);
  parts.push(`<text x="${pad}" y="104" font-size="20" fill="#64748b">${esc(model.issue)}</text>`);
  parts.push(`<text x="${pad}" y="170" font-size="48" font-weight="700" fill="#1d4ed8">${formatNumber(model.months[0]?.value)}</text>`);
  parts.push(`<text x="${pad}" y="198" font-size="18" fill="#64748b">${esc(model.months[0]?.label || '')}</text>`);
  parts.push(`<text x="${pad + 330}" y="170" font-size="48" font-weight="700" fill="#0f172a">${formatNumber(model.total4)}</text>`);
  parts.push(`<text x="${pad + 330}" y="198" font-size="18" fill="#64748b">${esc(th.total4)}</text>`);
  parts.push(`<text x="${pad + 760}" y="170" font-size="48" font-weight="700" fill="#0f172a">${formatNumber(model.parts)}</text>`);
  parts.push(`<text x="${pad + 760}" y="198" font-size="18" fill="#64748b">Part Number · โรงงาน ${esc(model.plantsText)}</text>`);
  model.months.forEach((m, i) => {
    const y = 250 + i * 50;
    const w = Math.round((m.value / max) * barW);
    parts.push(`<text x="${pad}" y="${y + 24}" font-size="18" fill="#334155">${esc(m.label)}</text>`);
    parts.push(`<rect x="${pad + 190}" y="${y}" width="${Math.max(w, 2)}" height="32" rx="6" fill="#3b82f6"/>`);
    parts.push(`<text x="${pad + 200 + w}" y="${y + 24}" font-size="18" font-weight="600" fill="#0f172a">${formatNumber(m.value)}</text>`);
  });
  parts.push(`<text x="${pad}" y="500" font-size="22" font-weight="700" fill="#0f172a">สัดส่วนรายโรงงาน (รวม 4 เดือน)</text>`);
  model.plants.forEach((p, i) => {
    const x = pad + i * 250;
    parts.push(`<rect x="${x}" y="520" width="14" height="14" rx="3" fill="${PLANT_META[p.plant]?.color || '#94a3b8'}"/>`);
    parts.push(`<text x="${x + 22}" y="533" font-size="20" font-weight="700" fill="#0f172a">${esc(p.plant)}</text>`);
    parts.push(`<text x="${x}" y="570" font-size="26" fill="#0f172a">${formatNumber(p.total)}</text>`);
    parts.push(`<text x="${x}" y="598" font-size="18" fill="#64748b">${pct(p.share)}</text>`);
  });
  parts.push(`<text x="${pad}" y="670" font-size="18" fill="#475569">Top 5 Part = ${pct(model.top5Share)} ของยอดรวม · ถึง 80% ที่ Part ลำดับ ${model.reach80}</text>`);
  parts.push('</svg>');
  return parts.join('');
};

/** Browser only: rasterise the SVG string at 2x. */
export const svgToPngBlob = (svg, { scale = 2 } = {}) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = (img.naturalWidth || 1080) * scale;
    canvas.height = (img.naturalHeight || 720) * scale;
    const c = canvas.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('สร้างรูปไม่สำเร็จ'))), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('สร้างรูปไม่สำเร็จ')); };
  img.src = url;
});

export const reportFileName = (productionMonth, now = new Date()) => {
  const ym = productionMonth ? `${productionMonth.year}-${String(productionMonth.month).padStart(2, '0')}` : 'NA';
  return `Report_${ym}_${now.toISOString().slice(0, 10)}.png`;
};

export const saveReportPng = async (model, productionMonth) => {
  const blob = await svgToPngBlob(buildSummaryCardSvg(model));
  const excel = await import('../../lib/excel/index.js');
  excel.downloadBlob(blob, reportFileName(productionMonth));
  return blob;
};

/** Print via the dashboard itself: data-print hides chrome through CSS, cleared on afterprint. */
export const printReport = () => {
  const root = document.documentElement;
  root.dataset.print = 'report';
  const clear = () => { delete root.dataset.print; window.removeEventListener('afterprint', clear); };
  window.addEventListener('afterprint', clear);
  requestAnimationFrame(() => window.print());
};
