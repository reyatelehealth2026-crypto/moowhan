# ui-kit

Shared UI primitives for every tab and feature. Import from `src/features/ui-kit/index.js`.

**Rule: errors = `Banner`, success/info = `Toast`** (`pushToast({ message, tone, action })`).
Screen-reader announcements go through `announce(text)` (visually hidden live region).

- `Button` (primary/secondary/ghost/danger, sm/md/lg, `loading`) — always at least 44px tall.
- `Chip`, `KpiCard` (`.num` for tabular digits), `InfoTip`, `EmptyState` (icon, one Thai sentence, one action).
- `ConfirmDialog` — built on `Modal`; Escape cancels.
- `DataGrid` — sticky header and first column, sortable headers (`aria-sort`), shared search
  (`/` focuses, `Esc` clears, "พบ X จาก Y"), windowed rows (no "show more" paging).
  Pure helpers: `searchRows`, `sortRows` in `gridUtils.js`.
- `hotkeys.js` — pure `dispatchHotkey`; `registerHotkey({ id, key, ctrl })` lets other features
  (e.g. help-center `?`) add shortcuts, dispatched as `custom:<id>` to `useHotkeys` handlers.
- `strings.js` — shared Thai copy and the column-label glossary. Dates: `formatDate` in `utils/format.js`.
