# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Kanakku: NilaTech Finance and Operations Management (code name EMS) v4 — a full-stack system for expenses, income, approvals, budgets, costing, orders, stock and invoicing.
- **Backend**: NestJS (port 5000), located in `server/`
- **Frontend**: Next.js 16 with Turbopack (port 3000), located in `client-next/`
- **Database**: PostgreSQL via Prisma ORM

---

## Running the Project

### Development (Windows)
```bat
start_all.bat       # kills all node processes, clears cache, then starts both servers
start.bat           # starts both without killing first
```

### Development (macOS / Linux)
```bash
bash start_all.sh   # kills processes on ports 3000/5000, then starts both servers
```

### Manually
```bash
# Backend
cd server && npm run start:dev

# Frontend
cd client-next && npm run dev
```

### Production Build
```bash
# Backend
cd server && npm run build && node dist/src/main.js   # NOT dist/main.js

# Frontend
cd client-next && npm run build && npm run start
```

---

## Environment
- Node (Windows): `C:/Program Files/nodejs` | Node (macOS/Linux): `/usr/local/bin/node` or `/opt/homebrew/bin/node`
- npm global (Windows): `C:/Users/<user>/AppData/Roaming/npm` | npm global (macOS): `/usr/local/lib/node_modules`
- DB: PostgreSQL 18 in Docker (`ems-db`, localhost-only port **5437**), defined in the root `docker-compose.yml`. `DATABASE_URL=postgresql://ems:<pass>@localhost:5437/fmhdb?schema=public`
- Compose password: `EMS_DB_PASSWORD` in the root `.env` (gitignored; copy `.env.example`). Use the same value in `server/.env`.
- Config: `server/.env` — contains `DATABASE_URL`, JWT secrets, UPLOAD_DIR, CLIENT_URL
- `UPLOAD_DIR`: Windows example `D:/Apps/Web/EMS-Storage`; macOS example `/var/ems-storage`; leave blank for default `server/uploads/`

---

## API
- Base URL: `http://localhost:5000/api/v1/`
- Health check: `http://localhost:5000/health` (no `/api` prefix)
- Swagger docs: `http://localhost:5000/api/docs` (dev only)
- Auth: `POST /api/v1/auth/login` → `{ username, password }`
- JWT via httpOnly cookies (access + refresh tokens); access token also stored in-memory on frontend
- Default admin credentials: `admin` / `admin123`
- Frontend proxies `/api/*` → `localhost:5000/api/*` via Next.js rewrites

---

## Database

### Docker database (first-time setup)
```bash
docker compose up -d                  # starts ems-db on 127.0.0.1:5437
cd server
npx prisma migrate deploy             # applies prisma/migrations
npx tsx prisma/seed.js                # roles, categories, Internal client, admin
npx tsx prisma/seed-budget-codes.js    # NTEMS cost codes: expense, product and project types and categories
npx tsx prisma/seed-costing-setup.js  # rate cards, overhead pools, item categories and the current-year budget plan (the e2e tests need these)
npx tsx prisma/seed-test-data.js      # optional: sample users, clients, ~130 transactions, recurring schedules (budget plans are created in the app)
node prisma/seed-test-orders.js       # optional, API running: 10 customer orders (delivered, late, in build, at risk, cancelled), created through the API
```
Test users (password `Test@1234`): `fin1`, `fin2`, `mgr1`, `mgr2`, `emp1`–`emp4`, `emp5` (ON_HOLD). `admin` / `admin123` is unchanged. `seed-test-data.js` is idempotent; to reseed from scratch run `docker compose down -v` first.

### Seed
```bash
cd server
npx tsx prisma/seed.js  # NOT npx prisma db seed (not configured in package.json); tsx loads the generated client
```

### Prisma 7
- The client is **generated into `server/src/generated/prisma`** (git-ignored). `npm run build`, `start`, `start:dev` and `test:e2e` run `prisma generate` first; run `npm run prisma:generate` yourself after pulling a schema change or after `prisma migrate dev` (Prisma 7 no longer generates automatically).
- Import the client and `Prisma` namespace from `../generated/prisma/client`, never from `@prisma/client`.
- `PrismaService` builds the client with the `@prisma/adapter-pg` adapter and `DATABASE_URL`. Prisma 7 does **not** read `.env` by itself: the app loads it through `ConfigModule`, `prisma.config.ts` and the seeds through `dotenv/config`, and Jest through `setupFiles`.
- The datasource URL lives in `server/prisma.config.ts`, not in `schema.prisma`.
- The pool has a 10 s connection timeout and a 30 s statement timeout (`DB_CONNECT_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS` in `.env`). `HttpExceptionFilter` turns a timeout into `503 DB_BUSY`; other unexpected errors return a generic message and the detail goes to the server log only.
- Schema changes that need only SQL review can be made with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `npx prisma migrate deploy`. This avoids `migrate dev` offering a reset on drift.
- Jest needs `--experimental-vm-modules` (the query compiler is loaded with a dynamic `import()`); the `test` and `test:e2e` scripts already pass it. Use them instead of calling `npx jest` directly, or set `NODE_OPTIONS=--experimental-vm-modules`.
- Seeds are plain Node scripts that use `prisma/seed-client.js`; run them with `npx tsx`.

### Migrations
- **If the server is running, stop it first** (`npx kill-port 5000`) before running any Prisma commands, and always before `npm install`: the watch process restarts on every file change.
- **Always prefer Prisma schema + `prisma migrate dev`** over raw SQL migration scripts. When a new column or model is needed:
  1. Stop the server
  2. Add the field to `schema.prisma`
  3. Run `npx prisma migrate dev --name describe-change`
  4. Run `npm run prisma:generate`
  5. Restart the server
- All legacy raw SQL `.cjs` migration scripts have been deleted. Everything is now in `schema.prisma` and tracked under `prisma/migrations/0_init/`.

### Prisma Raw Query Rules
- Use the normal Prisma API wherever it can express the query. Raw SQL is kept only for reporting and dashboard aggregates (group by year and month, `UNION` of split-transaction parts, multi-table totals, the recursive manager tree) and the health check. Use `$queryRawUnsafe` / `$executeRawUnsafe` when passing arrays or jsonb casts
- `$executeRaw` template literals **cannot** use `::jsonb` casts — use `$executeRawUnsafe` with `$1::jsonb` syntax

---

## Architecture Notes

### Backend (`server/src/`)
Modules: `auth`, `users`, `roles`, `categories`, `clients`, `projects`, `products`,
`transactions`, `budgets`, `approvals`, `recurring`, `audit`, `dashboard`, `receipts`, `health`

- NestJS global prefix: `api` (excludes `health`)
- Services use Prisma client directly; camelCase DB fields are mapped to snake_case for frontend in each service's `map*()` function
- `row-mapper.ts`: `addUppercaseAliases()` adds UPPERCASE copies of all fields — **intentional**, used for frontend field compatibility

**Global infrastructure:**
- `ResponseInterceptor`: wraps all responses in `{ success, data, error, meta }` — auto-extracts pagination when service returns `{ rows, total, page, limit }`
- `HttpExceptionFilter`: normalizes all errors; handles Prisma constraint codes (P2002, P2003, P2025)
- `RolesGuard`: checks `role_name` string against `@Roles()` decorator
- Rate limiting: 10 req/15min on auth endpoints, 200 req/60s on general API
- Validation pipe: whitelist + implicit type conversion enabled globally

### Frontend (`client-next/src/`)

**State Management (Zustand):**
- `stores/auth-store.ts` — user object, login/logout, role switch, session refresh on page reload
- `stores/theme-store.ts` — light/dark toggle, persisted to localStorage as `ems-theme`
- `stores/sidebar-store.ts` — mobile menu open/close
- `stores/header-store.ts` — drives the dynamic page title/actions in the top bar

**Data Fetching (TanStack Query v5):**
- All query definitions live in `hooks/use-queries.ts`
- Stale time: reference data (categories, clients, projects) = 60min; live data (transactions, approvals, budgets) = 0
- `useInvalidate()` hook invalidates caches by key name after mutations
- `api-client.ts`: thin `fetch` wrapper — auto-injects `Authorization: Bearer <token>` header, handles silent 401 → refresh → retry, supports FormData

**Shared UI Patterns (`components/shared/module/`):**
- `ModuleShell` — page-level container; renders toolbar row, search row, main content, and optional right panel slot
- `ModuleModal` — dialog wrapper (shadcn Dialog base); accepts `icon`, `isDestructive`, `footer`, `maxWidth` props; destructive variant auto-applies red header
- `ModuleIntelligencePanel` — right sliding detail panel; content area uses `background: var(--shell-bg)` — **always use `text-black dark:text-white`** for content text inside it (not `text-white` alone, which is invisible in light mode)

**Theming:**
- CSS custom properties defined in `globals.css` under `:root` (light) and `.dark` (dark)
- Variable groups: `--shell-bg`, `--shell-surface`, `--shell-text`, `--shell-text-muted`, `--shell-accent`, `--shell-border`
- Tailwind v4 `@theme` block maps variables to utility classes
- Layout CSS classes: `.fixed-top`, `.main-workspace`, `.footer-fixed` — the `@media (min-width: 1024px)` block that offsets these by the sidebar width (240px) **must come after** the base rules in `globals.css` or the cascade is broken

**Data Table Pattern:**
- Each page constructs its own `useReactTable()` instance with column definitions and passes it to `<DataTable>`
- `DataTableToolbar` handles faceted filters + search
- Row click → sets `selectedItem` state → `ModuleIntelligencePanel` shows detail view

**Standard page data flow:**
1. `useQueryHook()` fetches data → React Query cache
2. `useReactTable()` consumes cache data with local sort/filter state
3. Row click → right panel detail view
4. Add/Edit button → open `*Modal` component with optional `editing` prop
5. Modal save → `api.post/put()` → `invalidate('key')` → toast feedback

### Frontend Pages (`client-next/src/app/`)
- `/` — Dashboard
- `/login` — Login
- `/hub` — Hub / overview
- `/expense` — Expense entry
- `/income` — Income entry
- `/transactions` — All transactions
- `/approvals` — Approval workflow
- `/notifications` — Notifications
- `/reporting` — Reports
- `/settings` — User settings & preferences
- `/analytics/resource-utilization` — Resource utilization analytics
- `/manage/budgets` — Budget management
- `/manage/clients` — Client management
- `/manage/organization` — Team / user management
- `/manage/products` — Product management
- `/manage/projects` — Project management
- `/manage/recurring` — Recurring transactions

---

## User / Auth Model

### Employee ID
- Format: `NT${10000 + user.id}` — computed, not stored in DB
- Login accepts either username OR Employee ID (e.g., `NT10001`)

### Roles
- Multi-role via `UserRole` junction table (`user_roles`)
- Active role = `User.roleId`; switch via `PUT /api/v1/users/:id/switch-role`
- Role name check: use `user?.roles?.some(r => r.role_name === 'ADMIN')` — NOT `user?.role === 'admin'`
- Role colors: Admin=Red, Finance=Emerald, Manager=Orange, Employee=Blue

### Transaction Workflow Audit Fields
Columns on `transactions`, all in `schema.prisma` (camelCase fields, e.g. `approvedById`):
- `approved_by_id`, `approved_by_name`, `approved_by_role`, `approved_at` — final approver (set on APPROVED)
- `rejected_by_id`, `rejected_by_name`, `rejected_by_role`, `rejected_at` — rejector info (set on REJECTED)
- `submitted_by_id`, `submitted_by_name` — who submitted/recorded the transaction (set on submit for expense; set on create for income)
- `sent_back_by_id`, `sent_back_by_name`, `sent_back_by_role`, `sent_back_at` — who sent it back (set on SENT_BACK)
- Shown in "Approval Trail" section of the right panel in expense/income pages

### Extended User Fields
Columns on `users`, all in `schema.prisma`: `contact_no`, `house_apt`, `address`, `city`, `country`, `postal_code`, `user_status`, `date_of_birth`
- `user_status` values: `ACTIVE`, `ON_HOLD`, `INACTIVE`

### Permissions
- Stored in `user_permissions` table (JSON permissions, `single_limit`, `monthly_limit`, `data_scope`)
- Save via: `PUT /api/v1/users/:id/permissions`

### Password
- Pass `dto.password` to update; service hashes it automatically if provided
- New users with no password get a secure random password via `crypto.randomBytes(12).toString('base64url')`

---

## Approval Workflow
- Expenses: `DRAFT` → submit → `PENDING_MANAGER` → `PENDING_FINANCE` → `APPROVED` / `REJECTED`
- Submitting creates `ApprovalRequest` records in the manager chain
- Send Back resets to `DRAFT` and cancels all pending approval requests
- Income: created as DRAFT; Manager, Admin or Finance submits it (→ `PENDING_FINANCE`), Finance approves (→ `APPROVED`). Employees cannot submit income.
- Recurring schedules follow the same chain (Employee → Manager → Finance) and only `APPROVED` schedules post transactions when due; each run is created as `APPROVED`.
- Manager-level steps (approve, reject, send back) belong to the requester's direct manager. If the requester has no manager (or theirs lacks the Manager role), any Manager may act.
- Finance cannot approve their own expense unless they are the only active Finance user (`FINANCE_SELF_APPROVAL`, default `block`; set `allow` to restore the old behavior).
- Role-based page access lives in `client-next/src/lib/route-access.ts`; the API's `@Roles()` remains the source of truth for data.

## Tax Invoice Sheet
- The printed invoice (Open on the Invoices tab, then Print or save as PDF) follows the company's Word template, `E:\Apps\Artifacts\NTEMS\Nilatech_Invoice_2603-001.pdf`: ruled box, logo and company block on top, invoice and order details side by side, item grid, tax lines per GST rate, amount in words, payment instructions, notes, signature and a closing line.
- Layout lives in `client-next/src/app/(protected)/manage/clients/invoices/[id]/page.tsx` and `client-next/src/lib/invoice-sheet-css.ts` (A4, black on white, one page for a short invoice). `lib/amount-words.ts` writes the amount as "Rupees ... and Ninety Six only".
- Seller details come from Company (Organization, Company tab): legal name, GSTIN, address, phone, email, bank, branch, bank address, account name, account number, IFSC, notes, closing line. They are copied onto the invoice when it is issued, so later edits never change an issued invoice. The logo is the exception: it is the current company logo (PNG, JPEG or WebP under about 200 KB), not a copy.
- The invoice number rule (`invoiceNumber` in `server/src/invoicing/gst.ts`) is still the old one; the template's `NILAINV-2603-001` format is to be confirmed.

## Bulk Stock (`server/src/stock/`, page `/budget/stock`)
- A part is `DIRECT` or `STOCK` (supply mode). Two daily entries: stock in (an expense with `contextType: 'stock'`, posted on submit, reversed on reject, send back or void) and stock used on a project or order. Plus opening stock and the monthly count.
- Every ledger change goes through `StockService.post()` (it locks the balance row). Valuation is weighted average cost.
- Money totals count a purchase once: Monitor and budget report totals leave stock used out; job actual cost is expenses plus `BudgetsService.stockParts()`. A new job-cost figure must add both.
- Stock purchases are budgeted on the **Store** department; count differences go to **Workshop**. Both are found by name.

## File Uploads (Receipts)
- `POST /api/v1/receipts/upload` — multipart, returns `{ filename }`; stored in `UPLOAD_DIR/Receipts/`
- `GET /api/v1/receipts/:filename` — protected by JWT guard; **cannot use `window.open()` directly** (no auth header). Use `fetch(url, { credentials: 'include', headers: { Authorization: 'Bearer <token>' } })` → blob → `URL.createObjectURL()` → `window.open()`
- Access token for fetch: `import { getAccessToken } from '@/lib/api-client'`

---

## Modal Form Field Validation Rules

### Currency / Amount Fields
- Always use `type="number"` with `min="0"` and `step="0.01"`
- Prefix with a currency symbol span (e.g. `₹`) positioned absolutely left-3
- No dedicated Currency component exists — use the manual span + number input pattern
- Transaction modal validates: `!amount || isNaN(Number(amount)) || Number(amount) <= 0`

### Email Fields
- Always use `type="email"`
- Validate with: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Show inline error below field on blur; clear on change
- On form submit, block save if email is invalid
- User email is `readOnly` during edit (username/email immutable after creation)

### Phone / Contact Fields
- Always use `type="tel"`
- Validate with: `/^\+?[0-9\s\-().]{7,20}$/`
- Placeholder must show country code format e.g. `+91 98765 43210` or `+1 555 0123`
- Phone is optional — validation only fires if a value is present
- Block save if phone value is non-empty and fails the regex

---

## Key Conventions
- **Every code change must be OS-neutral (Windows + Linux).** This applies to all changes, no matter how small:
  - Always use `path.join()` / `path.resolve()` — never hardcode `/` or `\` separators
  - Never hardcode OS-specific paths (`D:\`, `C:\`, `/var/`, `/home/`, etc.) — use `process.env` or `process.cwd()`
  - Shell scripts: keep `.bat` for Windows and `.sh` for Linux in sync when logic changes
  - Do not use `os.platform()` or `process.platform` guards as a substitute for writing portable code
- **UI changes must follow `client-next/DESIGN.md`** (tokens, type scale, shared components for tables, panels, dialogs and forms). Run `npm run check:design` in `client-next/` before finishing a UI change; it must pass.
- **Schedule day counts are working days (Monday to Friday)**: milestones, build-order lead times, build days and delivery windows, days late or spare, approval waiting. Use `server/src/common/helpers/working-days.ts` and `client-next/src/lib/working-days.ts`; never subtract dates by `86400000`. Public holidays are not modelled. Money terms (invoice due dates, payment terms, ageing) stay calendar days.
- Do not refactor working code unless explicitly asked
- Do not add comments, docstrings, or type annotations to code you didn't change
- Prefer editing existing files over creating new ones
- Do not mock the database in tests — use real DB connections
- Keep responses concise; no trailing summaries after completing tasks
