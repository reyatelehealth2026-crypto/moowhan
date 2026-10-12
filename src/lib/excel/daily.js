// ==================== DAILY NUMBERS (pure, no DOM) ====================
// Daily quantities already live in row.rawRow: each month is 31 day columns right before its total column.
import { DEFAULT_N_COLS, MONTH_KEYS, PLANTS, dailySheetName } from '../../constants.js';
import { weekBuckets } from '../../utils/calendar.js';

const num = (v) => Number(v) || 0;
export const sumArray = (a) => a.reduce((s, v) => s + v, 0);

/** 0-based column of the month total (N..N+3) of a row, taken from colPositions with a default fallback. */
export const monthTotalCol = (row, monthIdx) => {
  const c = row?.colPositions?.[`${MONTH_KEYS[monthIdx]}Col`];
  return Number.isInteger(c) ? c : DEFAULT_N_COLS[monthIdx];
};

/** 31 numbers: rawRow[nCol-31 .. nCol-1] of month `monthIdx` (0..3). */
export const dayValues = (row, monthIdx) => {
  const end = monthTotalCol(row, monthIdx);
  const raw = row?.rawRow || [];
  return Array.from({ length: 31 }, (_, i) => num(raw[end - 31 + i]));
};

const addInto = (target, src) => src.forEach((v, i) => { target[i] += v; });
const plantRowsOf = (processedData, plant) => processedData?.[dailySheetName(plant)] || [];

const toItem = (row, monthIdx, plant) => {
  const days = dayValues(row, monthIdx);
  return { partNumber: row.partNumber, partCode: row.partCode, partDesc: row.partDesc, plant, dock: String(row.dockCode ?? '').trim(), rowId: row.id, days, total: sumArray(days) };
};

/** One entry per row of one plant (no merging). */
export const plantItems = (processedData, plant, monthIdx) =>
  plantRowsOf(processedData, plant).map((r) => toItem(r, monthIdx, plant));

/** Every plant merged: one entry per Part Number with days summed, sorted by part number. */
export const sumByPartDay = (processedData, monthIdx) => {
  const map = new Map();
  PLANTS.forEach((plant) => {
    plantRowsOf(processedData, plant).forEach((row) => {
      const it = toItem(row, monthIdx, plant);
      let acc = map.get(it.partNumber);
      if (!acc) {
        acc = { partNumber: it.partNumber, partCode: it.partCode, partDesc: it.partDesc, plants: [], docks: [], days: new Array(31).fill(0), total: 0 };
        map.set(it.partNumber, acc);
      }
      addInto(acc.days, it.days);
      if (!acc.plants.includes(plant)) acc.plants.push(plant);
      if (it.dock && !acc.docks.includes(it.dock)) acc.docks.push(it.dock);
    });
  });
  const list = [...map.values()];
  list.forEach((p) => { p.total = sumArray(p.days); });
  return list.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
};

/** plant -> dock -> part, in PLANTS order. Each level carries summed days + total. */
export const totalsByDock = (processedData, monthIdx) =>
  PLANTS.map((plant) => {
    const docks = new Map();
    plantItems(processedData, plant, monthIdx).forEach((it) => {
      const key = it.dock || '-';
      if (!docks.has(key)) docks.set(key, { dock: key, parts: [], days: new Array(31).fill(0), total: 0 });
      const d = docks.get(key);
      d.parts.push(it);
      addInto(d.days, it.days);
    });
    const list = [...docks.values()].sort((a, b) => a.dock.localeCompare(b.dock));
    list.forEach((d) => { d.total = sumArray(d.days); d.parts.sort((a, b) => a.partNumber.localeCompare(b.partNumber)); });
    const days = new Array(31).fill(0);
    list.forEach((d) => addInto(days, d.days));
    return { plant, docks: list, days, total: sumArray(days) };
  });

/** Weekly totals of a 31-value day array. Monday-Sunday weeks unless weekStart says otherwise. */
export const weeklyBuckets = (days, pm, weekStart = 1, monthIdx = 0) =>
  weekBuckets(pm, monthIdx, weekStart).map((list) => ({ days: list, total: sumArray(list.map((d) => num(days[d - 1]))) }));

/** Values for the optional "Daily Total" export sheet. */
export const buildDailyTotalAoa = (processedData, { merged = true, labels = ['N', 'N+1', 'N+2', 'N+3'] } = {}) => {
  const header = ['Part Number', 'Plant', 'Dock'];
  labels.forEach((l) => { for (let d = 1; d <= 31; d++) header.push(`${l} ${d}`); });
  const months = [0, 1, 2, 3];
  const rows = [];
  if (merged) {
    const per = months.map((m) => sumByPartDay(processedData, m));
    per[0].forEach((p, i) => {
      const line = [p.partNumber, p.plants.join(','), p.docks.join(',')];
      months.forEach((m) => line.push(...per[m][i].days));
      rows.push(line);
    });
  } else {
    PLANTS.forEach((plant) => {
      const per = months.map((m) => plantItems(processedData, plant, m));
      per[0].forEach((it, i) => {
        const line = [it.partNumber, plant, it.dock];
        months.forEach((m) => line.push(...per[m][i].days));
        rows.push(line);
      });
    });
  }
  return [header, ...rows];
};
