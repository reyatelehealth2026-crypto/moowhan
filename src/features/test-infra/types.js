// Shared JSDoc typedefs for `npm run typecheck` (checkJs, non-strict). Types only — nothing runs here.

/**
 * One part row read from a TMT forecast file.
 * @typedef {object} SourceRow
 * @property {string} partNumber
 * @property {string|number} partCode
 * @property {string} partDesc
 * @property {string} suppCode
 * @property {string} shippingDock
 * @property {string} dockCode
 * @property {string} carFamily
 * @property {string|number} packingSize
 * @property {number} n
 * @property {number} n1
 * @property {number} n2
 * @property {number} n3
 * @property {any[]} rawRow
 * @property {{ nCol: number, n1Col: number, n2Col: number, n3Col: number }} colPositions
 * @property {string} [id]
 * @property {string} [plant]
 * @property {string} [fileName]
 * @property {string} [partType]
 */

/**
 * @typedef {object} SourceMeta
 * @property {string} [productionMonthRaw]
 * @property {{ year: number, month: number }|null} [productionMonth]
 * @property {string} [issueDate]
 * @property {string} [plantCode]
 * @property {string} [revision]
 * @property {string} [forecastType]
 * @property {string} [partType]
 */

/** @typedef {Record<string, SourceRow[]>} ProcessedData  keyed by sheet name, e.g. "BP Daily" */

/**
 * @typedef {object} SummaryRow
 * @property {string} partNumber
 * @property {string} plants
 * @property {number} n
 * @property {number} n1
 * @property {number} n2
 * @property {number} n3
 * @property {{ plant: string, partCode: any, dockCode: any, packingSize: any, n: number, n1: number, n2: number, n3: number }[]} sources
 */

/**
 * @typedef {object} ChangeLogEntry
 * @property {string} timestamp  ISO
 * @property {string} [fileName]
 * @property {string} [plant]
 * @property {string} [partNumber]
 * @property {string} action
 * @property {string} [details]
 */

/**
 * @typedef {object} ExportReport
 * @property {'template'|'fallback'} mode
 * @property {{ sheet: string, rows: number, startRow: number, cells?: number }[]} patched
 * @property {string[]} skipped
 * @property {string[]} warnings
 * @property {{ sheet: string, rows: number, capacity: number, dropped: string[] }[]} overflow
 * @property {{ name: string, reason: string }[]} skippedSheets
 * @property {object[]} cellWrites
 */

/**
 * @typedef {object} TemplateInfo
 * @property {string} name
 * @property {number} size
 * @property {string[]} sheets
 * @property {ArrayBuffer} [buffer]
 * @property {Record<string, any[][]>} [rawSheets]
 */

/**
 * Shape of `state` returned by useConsolidator (keep in sync when state gains keys).
 * @typedef {object} ConsolidatorState
 * @property {TemplateInfo|null} template
 * @property {any[]} sourceFiles
 * @property {{ active: boolean, current: number, total: number, status: string }} processing
 * @property {boolean} exporting
 * @property {ProcessedData|null} processedData
 * @property {SummaryRow[]|null} summaryData
 * @property {Record<string, any>|null} matchingDetails
 * @property {ChangeLogEntry[]} changeLog
 * @property {{ year: number, month: number }|null} productionMonth
 * @property {string[]} monthLabels
 * @property {{ n: number, n1: number, n2: number, n3: number }} totals
 * @property {Record<string, number>} fileCounts
 * @property {string|null} error
 * @property {{ tone: string, message: string }|null} notice
 * @property {ExportReport|null} exportReport
 * @property {boolean} isStale
 * @property {Record<string, any>} features
 * @property {Record<string, any>} profile
 */

/**
 * @typedef {object} FeatureCtx
 * @property {ConsolidatorState} state
 * @property {Record<string, (...args: any[]) => any>} actions
 * @property {string[]} monthLabels
 */

/**
 * @typedef {object} Feature
 * @property {string} id
 * @property {number} order
 * @property {string} [group]
 * @property {string} [description]
 * @property {{ label: string, Icon?: any, enabled?: (ctx: FeatureCtx) => boolean, tooltip?: string, badge?: any, Component: any }} [tab]
 * @property {(ctx: FeatureCtx) => any} [headerActions]
 * @property {(ctx: FeatureCtx) => any} [exportSheets]
 * @property {(ctx: FeatureCtx, result: any) => any} [onProcessed]
 */

export {};
