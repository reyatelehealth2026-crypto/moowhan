// Pure helpers that turn the patcher's additive report fields into data other features
// (template-inspector, export-gate, provenance) can show. No UI here.
export const summarizeSafety = (report = {}) => {
  const overflow = report.overflow || [];
  const skipped = report.skippedSheets || [];
  const writes = report.cellWrites || [];
  return {
    ok: !overflow.length && !skipped.length && !writes.some((w) => w.status !== 'written'),
    overflow,
    droppedRows: overflow.reduce((n, o) => n + o.dropped.length, 0),
    skippedSheets: skipped,
    spilled: (report.patched || []).filter((p) => p.spilled).map((p) => ({ sheet: p.sheet, rows: p.spilled })),
    cellWrites: { written: writes.filter((w) => w.status === 'written').length, skipped: writes.filter((w) => w.status !== 'written') },
    preserved: (report.patched || []).filter((p) => p.preservedCols).map((p) => ({ sheet: p.sheet, cols: p.preservedCols, values: p.preservedValues })),
  };
};
