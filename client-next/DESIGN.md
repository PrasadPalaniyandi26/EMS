# NTEMS design language

One set of rules for every page and dialog. Tokens live in `src/app/globals.css`, the typeface in `src/app/layout.tsx`. `npm run check:design` fails the build of a change that steps outside them.

## Principles
- Quiet ledger: two solid surfaces (canvas and surface), hairline borders, one accent. No gradients, glow, blur or shadows except menus and dialogs.
- Content is the design: plain-text table cells, right-aligned tabular amounts.
- Sentence-case text everywhere. No uppercase or letter-spaced labels.
- Same job, same component, same place.

## Tokens (IBM Carbon Gray 90 dark / Carbon White light)
- Surfaces: `--shell-bg` (canvas: sidebar, top bar), `--shell-surface` (content, panels), `--popover` (menus, dialogs), `--table-header`, `--shell-hover`.
- Text: `--shell-text`, `--shell-text-muted`. Borders: `--shell-border` (hairline), `--input` (control boundary, 3:1).
- Accent: `--shell-accent` (+ `--shell-accent-fg`). Status: `--success --warning --info --danger`, workflow `--status-*`, `--role-*`, `--nav-*`.
- Never write a hex colour, `rgb()` or a raw palette class (`text-blue-500`) in a component.

## Type, weight, shape
- Typeface: IBM Plex Sans only. Components never set a font family.
- Sizes (px): 12 secondary and labels, 13 body and table cells, 14 inputs and subtitles, 15 panel and dialog titles, 16/18 figures, 22/26/28 page and brand.
- Weights: 400, 500 (names, emphasis), 600 (headings, figures). No bold, extrabold or black.
- Radius: `rounded-md` (4px) small elements and controls, `rounded-lg` (6px) containers, panels and dialogs, `rounded-full` for dots and switches only. Buttons are rectangular, never pills.

## Page anatomy
- `ModuleShell`: toolbar row (48px) then the table fills the area; the detail panel docks on the right with a left border. No gaps, no floating cards.
- Dashboard-style pages: `StatStrip` of `StatCard` cells, then bordered panels.
- Tables: `DataTable` + the cells in `components/data-table/cells.tsx` (`TextCell`, `IdCell`, `DateCell`, `MoneyCell`, `StatusText`, `ToneText`). Status is coloured plain text, never a pill, dot or avatar. Page size fits the screen (`useFitPageSize`); first load shows skeleton rows.
- Toolbar: search and filters, `Add`, and the actions for the selected item (`ToolbarActions`).

## Standard page template (approved)
Every list or workspace page is built in this order, top to bottom. The reference is `budget/products/[id]/page.tsx`.
1. **Title** in the top bar (`useHeaderStore.setHeader`).
2. **Tabs** (`TabBar`) when a page has several views. They are the first row under the title.
3. **Action row** (`DataTableToolbar` in the `ModuleShell` `searchRow`). Left: the actions that are always available (`Add …`, `Propose …`), then the actions for the selected row (`Edit`, `Delete`, `Approve` …) from the same `DetailActionDef[]` the panel uses. Right, always in this order: **Import, Export, Filters, Search**. Import and Export are the `onImport` / `onExport` props of `DataTableToolbar`, never entries in the left action list; filters are the `filterDefs` prop (rule 8).
4. **Work area**: the `DataTable` fills the space. The right panel is fixed beside it.
5. **Right panel** (`ModuleIntelligencePanel`): nothing selected shows a summary of the whole record (`idle`), a selected row shows its key facts (`DetailSummary`, `DetailSection`, `DetailGrid`), and the row's actions are pinned at the bottom (`DetailActions`, at most three).
6. **Every action button has an icon, and no two actions on a page share an icon colour.** Icons are lucide, coloured with a status token: Add green (`--success`), Edit blue (`--info`), Delete red (`--danger`), and amber (`--warning`), purple (`--shell-accent`) for the rest. Because Delete is red, no other action on that page is red. `ToolbarActions` looks the icon up by label in `TOOLBAR_ICONS`; any other action passes `icon` itself. A missing icon logs a warning in development.
7. **No actions inside rows** (no pencil or bin icons) and **no in-place editing** in a table or grid. A cell is read-only text. Every change goes through Edit (or Add) into a `ModuleModal` dialog, so several values can be changed in one save.
8. **Filters: up to two sit in the row, more go into one dialog.** A screen declares its filters as `FilterDef[]` (`components/data-table/filters.tsx`) and passes them as `filterDefs`. With one or two, they show as dropdowns before Search. With **three or more**, the row shows a single `Filters…` button (with the number of active filters) that opens a dialog: every filter is a labelled field, the list changes as you choose, `Clear all` resets them and `Done` closes it. Never put three dropdowns in the row, and never hand-build filter controls on a page. A filter that needs more input, such as a custom date range, adds it with `extra`. A yes/no filter uses the plain values `All`, `Yes` and `No` with `placeholder` set to the filter's name: the same native dropdown as the others reads `Product` until a value is chosen, and its list holds only the plain values; do not write "Product: yes" into the options. `Filters…` is a control like the dropdowns, so its icon is neutral and is not counted among the action colours.

## Detail panel (`components/shared/detail/detail-kit.tsx`)
`DetailSummary` (title, reference, status, headline figure), `DetailSection` (sentence-case heading, optional text action), `DetailGrid` + `DetailField` tiles two per row, `DetailAttachment`, `DetailTimeline`, `DetailAllocation`. The item's actions (`DetailActionDef[]`, built once per page, empty when nothing is selected) render both in the toolbar and pinned at the bottom of the panel with `DetailActions` (max three: filled main, outlined secondary, red-outline destructive).

## Dialogs and forms
- Every dialog is `ModuleModal` (or `ConfirmDialog` for confirmations): one surface for header, body and footer, 15px sentence-case title, footer Cancel then the main action. Never a raw `Dialog`.
- Fields use `Field` (label linked to the control, hint and error) with `inp` / `NativeSelect` / `CurrencyInput` / `PhoneInput` / `EmailInput`: transparent fill, 3:1 border, visible focus ring. Same on pages and in dialogs.
- Required fields are marked with the red asterisk (`Field required`). A dialog never lets you save while one is empty or invalid: pass `canSave` to `ModuleModal` (the save button stays disabled), and for custom footers disable the main button the same way. No "choose X first" hints; a dependent dropdown is simply disabled until its parent is chosen. `check:design` fails a dialog that has required fields but no `canSave`.
- Toggles that pick one option are `SegmentedControl` (a labelled radio group). Approve/reject/void/send-back dialogs are `DecisionModal`; receipt upload is `FileDropzone`; GST rate and inclusion are `GstRateSelect` / `GstIncludedSwitch`. Reuse these; don't copy their markup.

## Accessibility floor
Text 4.5:1, control boundaries 3:1, focus ring on every control, every control labelled, no horizontal scroll at 375px, `prefers-reduced-motion` respected, theme stored as `{"state":{"theme":"light|dark"}}` in `localStorage['ems-theme']`.
