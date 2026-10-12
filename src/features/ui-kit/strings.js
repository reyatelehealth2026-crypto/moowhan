// Shared Thai copy. Only strings reused across screens live here.
export const STRINGS = {
  status: {
    ready: 'พร้อม',
    missing: 'ไม่มี',
    complete: 'ครบ',
    processing: 'กำลังประมวลผล...',
    exporting: 'กำลังสร้างไฟล์...',
    noneFound: 'ไม่พบข้อมูล',
  },
  actions: {
    error: 'ข้อผิดพลาด',
    extracted: 'ดึงข้อมูล',
    warning: 'คำเตือน',
    edit: 'แก้ไข',
    export: 'ส่งออก',
    file: 'ไฟล์',
  },
  buttons: {
    process: 'รวมข้อมูลและคำนวณ',
    download: 'ดาวน์โหลด',
    previewExcel: 'ดูตัวอย่างไฟล์ Excel',
    reset: 'รีเซ็ต',
    close: 'ปิด',
    cancel: 'ยกเลิก',
    confirm: 'ยืนยัน',
    undo: 'เลิกทำ',
    options: 'เครื่องมือ',
  },
  empty: {
    noData: 'ไม่พบข้อมูล',
    notProcessed: 'ยังไม่มีข้อมูล กรุณาอัปโหลดไฟล์แล้วกด “รวมข้อมูลและคำนวณ”',
    noRows: 'ไม่มีข้อมูลในรายการนี้',
  },
  search: {
    placeholder: 'ค้นหา Part Number / Part Code / Dock…',
    clear: 'ล้างคำค้นหา',
  },
  plants: {
    all: 'ทุกโรงงาน',
    BP: 'BP – Ban Pho',
    BPK: 'BPK – Ban Pho Kaeng Khoi',
    GW: 'GW – Gateway',
    SR: 'SR – Samrong',
  },
};

// Column labels shown in tables; each maps to a header of the source file (see SOURCE_HEADERS).
export const GLOSSARY = {
  partNumber: 'Part Number',
  partCode: 'Part Code',
  dockCode: 'Dock Code',
  packingSize: 'Packing Size',
  n: 'N',
  n1: 'N+1',
  n2: 'N+2',
  n3: 'N+3',
};

export const foundOf = (shown, total) => `พบ ${shown.toLocaleString('en-US')} จาก ${total.toLocaleString('en-US')}`;
