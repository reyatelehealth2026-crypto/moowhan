// Label dictionaries shared by every surface. th and en must keep identical keys (tested).
export const th = {
  n: 'N (Firm)',
  n1: 'N+1 (FC)',
  n2: 'N+2 (FC)',
  n3: 'N+3 (FC)',
  total4: 'รวม 4 เดือน (Firm+FC)',
  parts: 'Part Number',
  rows: 'แถวข้อมูล',
  plants: 'โรงงาน',
  issue: 'Issue / Rev / Type',
  dataAge: 'อายุข้อมูล',
  monthly: 'ยอดรวมรายเดือน',
  movers: 'รายการที่ขยับมากสุด',
  pareto: 'Pareto',
  attention: 'ควรตรวจสอบ',
  isNew: 'ใหม่',
};
export const en = {
  n: 'N (Firm)',
  n1: 'N+1 (FC)',
  n2: 'N+2 (FC)',
  n3: 'N+3 (FC)',
  total4: 'Total 4 months (Firm+FC)',
  parts: 'Part Number',
  rows: 'Rows',
  plants: 'Plants',
  issue: 'Issue / Rev / Type',
  dataAge: 'Data age',
  monthly: 'Monthly totals',
  movers: 'Top movers',
  pareto: 'Pareto',
  attention: 'Needs attention',
  isNew: 'New',
};

/** Nickname for a part when the profile has one; otherwise the part number itself. */
export const partLabel = (partNumber, aliases) => {
  const a = aliases && typeof aliases === 'object' ? aliases[partNumber] : null;
  return a ? `${a} (${partNumber})` : partNumber;
};
