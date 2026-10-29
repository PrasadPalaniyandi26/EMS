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

## Detail panel (`components/shared/detail/detail-kit.tsx`)
`DetailSummary` (title, reference, status, headline figure), `DetailSection` (sentence-case heading, optional text action), `DetailGrid` + `DetailField` tiles two per row, `DetailAttachment`, `DetailTimeline`, `DetailAllocation`. The item's actions (`DetailActionDef[]`, built once per page, empty when nothing is selected) render both in the toolbar and pinned at the bottom of the panel with `DetailActions` (max three: filled main, outlined secondary, red-outline destructive).

## Dialogs and forms
- Every dialog is `ModuleModal` (or `ConfirmDialog` for confirmations): one surface for header, body and footer, 15px sentence-case title, footer Cancel then the main action. Never a raw `Dialog`.
- Fields use `Field` (label linked to the control, hint and error) with `inp` / `NativeSelect` / `CurrencyInput` / `PhoneInput` / `EmailInput`: transparent fill, 3:1 border, visible focus ring. Same on pages and in dialogs.
- Required fields are marked with the red asterisk (`Field required`). A dialog never lets you save while one is empty or invalid: pass `canSave` to `ModuleModal` (the save button stays disabled), and for custom footers disable the main button the same way. No "choose X first" hints; a dependent dropdown is simply disabled until its parent is chosen. `check:design` fails a dialog that has required fields but no `canSave`.
- Toggles that pick one option are `SegmentedControl` (a labelled radio group). Approve/reject/void/send-back dialogs are `DecisionModal`; receipt upload is `FileDropzone`; GST rate and inclusion are `GstRateSelect` / `GstIncludedSwitch`. Reuse these; don't copy their markup.

## Accessibility floor
Text 4.5:1, control boundaries 3:1, focus ring on every control, every control labelled, no horizontal scroll at 375px, `prefers-reduced-motion` respected, theme stored as `{"state":{"theme":"light|dark"}}` in `localStorage['ems-theme']`.
