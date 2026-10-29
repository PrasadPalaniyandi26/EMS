# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
EMS (Expense Management System) v4 — a full-stack expense tracking and approval system.
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
node prisma/seed.js                   # roles, categories, Internal client, admin
node prisma/seed-test-data.js         # optional: sample users, clients, 117 transactions, budgets, recurring
```
Test users (password `Test@1234`): `fin1`, `fin2`, `mgr1`, `mgr2`, `emp1`–`emp4`, `emp5` (ON_HOLD). `admin` / `admin123` is unchanged. `seed-test-data.js` is idempotent; to reseed from scratch run `docker compose down -v` first.

### Seed
```bash
cd server
node prisma/seed.js     # NOT npx prisma db seed (not configured in package.json)
```

### Migrations
- **If the server is running, stop it first** (`npx kill-port 5000`) before running any Prisma commands — DLL lock on Windows prevents engine file replacement.
- **Always prefer Prisma schema + `prisma migrate dev`** over raw SQL migration scripts. When a new column or model is needed:
  1. Stop the server
  2. Add the field to `schema.prisma`
  3. Run `npx prisma migrate dev --name describe-change`
  4. Restart the server
- `prisma generate` can be run with `--no-engine` if the server must stay up (types only; full engine still needs server stopped):
  ```bash
  npx prisma generate --no-engine
  ```
- All legacy raw SQL `.cjs` migration scripts have been deleted. Everything is now in `schema.prisma` and tracked under `prisma/migrations/0_init/`.

### Prisma Raw Query Rules
- Use `$queryRawUnsafe` / `$executeRawUnsafe` when passing arrays or jsonb casts
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

### Transaction Workflow Audit Fields (added via raw SQL, not in Prisma schema)
Columns on `transactions` added by migration scripts:
- `approved_by_id`, `approved_by_name`, `approved_by_role`, `approved_at` — final approver (set on APPROVED)
- `rejected_by_id`, `rejected_by_name`, `rejected_by_role`, `rejected_at` — rejector info (set on REJECTED)
- `submitted_by_id`, `submitted_by_name` — who submitted/recorded the transaction (set on submit for expense; set on create for income)
- `sent_back_by_id`, `sent_back_by_name`, `sent_back_by_role`, `sent_back_at` — who sent it back (set on SENT_BACK)
- These are fetched via `$queryRawUnsafe`; Prisma client types don't include them
- Shown in "Approval Trail" section of the right panel in expense/income pages

### Extended User Fields (added via raw SQL, not in Prisma schema)
Columns on `users`: `contact_no`, `house_apt`, `address`, `city`, `country`, `postal_code`, `user_status`, `date_of_birth`
- `user_status` values: `ACTIVE`, `ON_HOLD`, `INACTIVE`
- These are fetched via `$queryRawUnsafe`; Prisma client types don't include them

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
- Income transactions are auto-approved (no workflow)
- Manager-level steps (approve, reject, send back) belong to the requester's direct manager. If the requester has no manager (or theirs lacks the Manager role), any Manager may act.
- Finance cannot approve their own expense unless they are the only active Finance user (`FINANCE_SELF_APPROVAL`, default `block`; set `allow` to restore the old behavior).
- Role-based page access lives in `client-next/src/lib/route-access.ts`; the API's `@Roles()` remains the source of truth for data.

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
- Do not refactor working code unless explicitly asked
- Do not add comments, docstrings, or type annotations to code you didn't change
- Prefer editing existing files over creating new ones
- Do not mock the database in tests — use real DB connections
- Keep responses concise; no trailing summaries after completing tasks
