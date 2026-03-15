# CLAUDE.md — EMS Project Guide for AI Assistants

## Project Overview
EMS (Expense Management System) v4 — a full-stack expense tracking and approval system.
- **Backend**: NestJS (port 5000), located in `server/`
- **Frontend**: Next.js 16 with Turbopack (port 3000), located in `client-next/`
- **Database**: PostgreSQL via Prisma ORM (migrated from Oracle)

---

## Running the Project

### Development (Windows)
```bat
start_all.bat       # kills existing node processes, then starts both server and client
start.bat           # starts both without killing first
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
- Node: `C:/Program Files/nodejs`
- npm global: `C:/Users/Prasad/AppData/Roaming/npm`
- DB: `postgresql://prasad:infodba@localhost:5432/fmhdb?schema=public`
- Config: `server/.env` — contains `DATABASE_URL` (legacy Oracle vars present but unused)

---

## API
- Base URL: `http://localhost:5000/api/v1/`
- Health check: `http://localhost:5000/health` (no `/api` prefix)
- Auth: `POST /api/v1/auth/login` → `{ username, password }`
- JWT via httpOnly cookies (access + refresh tokens)
- Default admin credentials: `admin` / `admin123`
- Frontend proxies `/api/*` → `localhost:5000/api/*` via Next.js rewrites

---

## Database

### Seed
```bash
cd server
node prisma/seed.js     # NOT npx prisma db seed (not configured in package.json)
```

### Migrations
- **Do not run `prisma migrate dev` while the server is running** — DLL lock on Windows.
- Use raw SQL migration scripts instead:
  ```bash
  DATABASE_URL="postgresql://prasad:infodba@localhost:5432/fmhdb?schema=public" node prisma/migrate-xyz.cjs
  ```
- Migration scripts live in `server/prisma/*.cjs`

### Prisma Raw Query Rules
- Use `$queryRawUnsafe` / `$executeRawUnsafe` when passing arrays or jsonb casts
- `$executeRaw` template literals **cannot** use `::jsonb` casts — use `$executeRawUnsafe` with `$1::jsonb` syntax

---

## Architecture Notes

### Backend (`server/src/`)
Modules: `auth`, `users`, `roles`, `categories`, `clients`, `projects`, `products`,
`transactions`, `budgets`, `approvals`, `recurring`, `audit`, `dashboard`, `receipts`, `health`

- NestJS global prefix: `api` (excludes `health`)
- Services use Prisma client; Oracle service layer has been removed
- `row-mapper.ts`: `addUppercaseAliases()` adds UPPERCASE copies of all fields — **intentional**, kept for legacy Oracle compatibility

### Frontend (`client-next/src/app/`)
Pages: `/`, `/login`, `/hub`, `/expense`, `/income`, `/transactions`,
`/analytics/resource-utilization`, `/approvals`,
`/manage/{budgets,clients,organization,products,projects,recurring}`,
`/notifications`, `/reporting`, `/settings`

---

## User / Auth Model

### Employee ID
- Format: `NT${10000 + user.id}` — computed, not stored in DB
- Login accepts either username OR Employee ID (e.g., `NT10001`)

### Roles
- Multi-role via `UserRole` junction table (`user_roles`)
- Active role = `User.roleId`; switch via `switchRole` endpoint
- Role colors: Admin=Red, Finance=Emerald, Manager=Orange, Employee=Blue

### Extended User Fields (added via raw SQL, not in Prisma schema yet)
Columns on `users`: `contact_no`, `house_apt`, `address`, `city`, `country`, `postal_code`, `user_status`
- `user_status` values: `ACTIVE`, `ON_HOLD`, `INACTIVE`
- Use `$queryRawUnsafe` to fetch these fields

### Permissions
- Stored in `user_permissions` table (JSON permissions, `single_limit`, `monthly_limit`, `data_scope`)
- Save via: `PUT /api/v1/users/:id/permissions`

### Password
- Pass `dto.password` to update; service hashes it automatically if provided

---

## Key Conventions
- Do not refactor working code unless explicitly asked
- Do not add comments, docstrings, or type annotations to code you didn't change
- Prefer editing existing files over creating new ones
- Do not mock the database in tests — use real DB connections
- Keep responses concise; no trailing summaries after completing tasks
