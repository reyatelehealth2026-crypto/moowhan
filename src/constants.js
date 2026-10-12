// ==================== DOMAIN CONSTANTS ====================
// Plant codes in the order they appear in the template workbook.
export const PLANTS = ['BP', 'BPK', 'GW', 'SR'];

// Sheet name inside the template that holds each plant's daily forecast.
export const dailySheetName = (plant) => `${plant} Daily`;
export const DAILY_SHEETS = PLANTS.map(dailySheetName);
export const ANALYZE_SHEET = 'Analyze';
export const SUMMARY_SHEET = 'Summary';

// Column headers of a TMT forecast file (row "PART NUMBER ...").
export const SOURCE_HEADERS = [
  'PART NUMBER', 'PART CODE', 'PART DESC', 'SUPP CODE',
  'SHIPPING DOCK', 'DOCK CODE', 'CAR FAMILY', 'PACKING SIZE',
];
export const MONTH_KEYS = ['n', 'n1', 'n2', 'n3'];
export const MONTH_HEADERS = ['N', 'N+1', 'N+2', 'N+3'];

// Fallback 0-based column indexes of N / N+1 / N+2 / N+3 in a source file:
// 8 fixed columns + 31 day columns = 39, then every 32 columns.
export const DEFAULT_N_COLS = [39, 71, 103, 135];

// Layout of the template workbook (1-based rows/cols).
export const TEMPLATE = {
  dailyHeaderRow: 13,      // row containing "PART NUMBER" in "<Plant> Daily"
  dailyDataStartRow: 14,
  analyzeHeaderRow: 2,     // row containing "PART NUMBER" in "Analyze"
  analyzeDataStartRow: 3,
  analyzeSourceOffset: 2,  // Analyze column B (2) = source column A (index 0)
  analyzePlantCol: 138,    // column EH — fallback when header detection fails
  maxSourceCols: 136,      // A..EF of a source file
};

export const PLANT_META = {
  BP: {
    label: 'Ban Pho',
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-300',
    gradient: 'from-blue-500 to-blue-600',
    lightBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    color: '#3B82F6',
  },
  BPK: {
    label: 'Ban Pho Kaeng Khoi',
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-300',
    gradient: 'from-emerald-500 to-emerald-600',
    lightBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    color: '#10B981',
  },
  GW: {
    label: 'Gateway',
    badge: 'bg-purple-100 text-purple-700',
    border: 'border-purple-300',
    gradient: 'from-purple-500 to-purple-600',
    lightBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    color: '#8B5CF6',
  },
  SR: {
    label: 'Samrong',
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-orange-300',
    gradient: 'from-orange-500 to-orange-600',
    lightBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    color: '#F59E0B',
  },
};

// Colors for the 4 forecast months (bar chart, KPI cards).
export const MONTH_META = [
  { key: 'n',  bar: 'bg-blue-500',    text: 'text-blue-600',    gradient: 'from-blue-500 to-blue-600' },
  { key: 'n1', bar: 'bg-emerald-500', text: 'text-emerald-600', gradient: 'from-emerald-500 to-emerald-600' },
  { key: 'n2', bar: 'bg-amber-500',   text: 'text-amber-600',   gradient: 'from-amber-500 to-amber-600' },
  { key: 'n3', bar: 'bg-purple-500',  text: 'text-purple-600',  gradient: 'from-purple-500 to-purple-600' },
];

// Value of "PLANT CODE" in a source file header -> plant (inferred from the fixtures in input/*.xls).
export const PLANT_CODE_MAP = { P: 'BP', B: 'BPK', G: 'GW', S: 'SR' };
// ---------- QA engine (src/features/qa-engine) ----------
// Alias of PLANT_CODE_MAP (single letter in a TMT forecast file -> our plant id) for the qa-engine rules.
export const PLANT_CODE = PLANT_CODE_MAP;
// Part Number such as 86790-0K051-00 (5 + 5 characters, optional 2-3 character suffix).
export const PART_NUMBER_PATTERN = /^[0-9A-Z]{5}-[0-9A-Z]{5}(-[0-9A-Z]{2,3})?$/;
// SUPP CODE every row is expected to carry.
export const DEFAULT_SUPP_CODE = 'TTETA';

// ---------- qa-file-guards: Firm / Forecast horizon (N is firm when the file's FORECAST TYPE is F) ----------
export const HORIZON_META = [
  { key: 'n', kind: 'firm', badge: 'Firm' },
  { key: 'n1', kind: 'forecast', badge: 'FC' },
  { key: 'n2', kind: 'forecast', badge: 'FC' },
  { key: 'n3', kind: 'forecast', badge: 'FC' },
];
