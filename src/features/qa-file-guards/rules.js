// QA-engine rules of qa-file-guards. Registered on import (index.jsx imports this file).
// Pure: exported rule objects can also be called directly (import-cli reuses `guardRules` / the logic functions).
import { registerRule } from '../qa-engine/registry.js';
import { getPreviousFiles } from './deps.js';
import { compareRevisions, expectedFilesChecklist, findDuplicateFiles, findDuplicateKeys } from './logic.js';

const withMeta = (ctx) => ctx.sourceFiles.filter((f) => f.status !== 'error');

export const D01 = {
  id: 'D01', group: 'file', level: 'error', title: 'ไฟล์ซ้ำ (เนื้อหาเหมือนกัน)',
  run: (ctx) => findDuplicateFiles(withMeta(ctx)).map((d) => {
    const f = ctx.sourceFiles.find((x) => x.id === d.id);
    return {
      scope: 'file', plant: f?.category || '', fileName: d.name, expected: 'ไฟล์ละหนึ่งชุด', actual: `เหมือนกับ ${d.duplicateOf}`,
      message: `ไฟล์ ${d.name} มีเนื้อหาเหมือนกับ ${d.duplicateOf} (ชื่อต่างกัน) ยอดจะถูกนับซ้ำ`,
      fix: 'ลบไฟล์ที่ซ้ำออกแล้วประมวลผลใหม่', action: { kind: 'removeFile', payload: { id: d.id, name: d.name } },
    };
  }),
};

const keyIssue = (rule, level) => (ctx) => findDuplicateKeys(ctx.entries).filter((d) => d.rule === rule).map(({ entry: e, firstEntry: first }) => ({
  ...ctx.rowRef(e), scope: 'row', level,
  expected: 'Part Number + Dock Code ไม่ซ้ำ', actual: `ซ้ำกับแถว ${first.rowNumber}${first.row.fileName !== e.row.fileName ? ` (${first.row.fileName})` : ''}`,
  message: rule === 'D02'
    ? `${e.row.partNumber} / Dock ${e.row.dockCode || '-'} ซ้ำกับไฟล์ ${first.row.fileName} ยอดจะถูกนับซ้ำ`
    : `${e.row.partNumber} / Dock ${e.row.dockCode || '-'} ซ้ำอยู่ในไฟล์เดียวกัน (แถว ${first.rowNumber})`,
  fix: rule === 'D02' ? 'ลบไฟล์ที่ซ้ำหรือไฟล์ revision เก่าออก' : 'ตรวจไฟล์ต้นทางว่าแถวนี้ควรซ้ำหรือไม่',
}));

export const D02 = { id: 'D02', group: 'consistency', level: 'error', title: 'Part+Dock ซ้ำข้ามไฟล์', run: keyIssue('D02', 'error') };
export const D03 = { id: 'D03', group: 'consistency', level: 'warning', title: 'Part+Dock ซ้ำในไฟล์เดียว', run: keyIssue('D03', 'warning') };

export const D04 = {
  id: 'D04', group: 'file', level: 'warning', title: 'Revision / วันที่ออกต่างกัน',
  run: (ctx) => compareRevisions(withMeta(ctx)).map((o) => ({
    scope: 'file', plant: o.plant, fileName: o.name, expected: `Rev ${o.newerRevision}${o.newerIssueDate ? ` (${o.newerIssueDate})` : ''}`, actual: `Rev ${o.revision}${o.issueDate ? ` (${o.issueDate})` : ''}`,
    message: `${o.name} เป็น revision เก่ากว่า ${o.newerName} (โรงงานและชนิดเดียวกัน)`,
    fix: `ใช้ไฟล์ใหม่กว่า (${o.newerName}) แล้วลบ ${o.name}`, action: { kind: 'useNewer', payload: { keepId: o.newerId, dropId: o.id, name: o.name } },
  })),
};

export const F01 = {
  id: 'F01', group: 'file', level: 'warning', title: 'ไฟล์ที่เคยมีรอบก่อนแต่ไม่มีรอบนี้',
  run: (ctx) => expectedFilesChecklist(ctx.settings?.previousFiles || getPreviousFiles(), ctx.sourceFiles)
    .filter((c) => !c.present)
    .map((c) => ({
      scope: 'plant', plant: c.plant, message: `รอบก่อนมีไฟล์ ${c.label} แต่รอบนี้ยังไม่ได้อัปโหลด`,
      fix: 'อัปโหลดไฟล์ที่ขาด หรือข้ามได้ถ้ารอบนี้ไม่มีไฟล์ดังกล่าว', expected: c.label, actual: 'ไม่พบ',
    })),
};

export const guardRules = [D01, D02, D03, D04, F01];
guardRules.forEach(registerRule);
