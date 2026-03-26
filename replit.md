# Workspace

## Overview

pnpm workspace monorepo using TypeScript. ABC TCC - Registro Emocional Terapéutico web application using the Cognitive Behavioral Therapy ABC method.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: express-session (cookie-based sessions), bcryptjs for password hashing
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, react-hook-form, framer-motion

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── abc-web/            # React + Vite frontend (ABC TCC app)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed-admin.ts   # Seeds the initial admin user
```

## Application Features

### User Flow
- Login page at `/login` with email/password
- ABC guided wizard at `/register-abc`:
  - Step 1: A - Situación/Estímulo (objective description of what happened)
  - Step 2: B - Pensamientos Automáticos (automatic thoughts)
  - Step 3: C - Emoción y Conducta (emotion name, intensity 1-10, behavior)
  - Step 4: Reflexión cognitiva (optional alternative thought)
- View past records

### Admin View
- Dashboard at `/admin`
- User management (create, edit, delete, change password)
- Password suggestion tool
- View all ABC records filtered by user

## Database Schema

- **users**: id, name, email, password_hash, role (admin|user), created_at
- **records**: id, user_id, situacion, pensamientos, emocion, intensidad, conducta, reflexion, created_at

## Default Admin Credentials

- Email: `admin@abc.com`
- Password: `Admin2024!`

## API Routes

All routes under `/api`:
- `POST /auth/login` — Login
- `POST /auth/logout` — Logout
- `GET /auth/me` — Current user info
- `GET /admin/users` — List users (admin only)
- `POST /admin/users` — Create user (admin only)
- `PUT /admin/users/:id` — Update user (admin only)
- `DELETE /admin/users/:id` — Delete user (admin only)
- `GET /admin/suggest-password` — Suggest strong password (admin only)
- `GET /admin/records` — All ABC records (admin only, filterable by userId)
- `GET /records` — Current user's records
- `POST /records` — Create ABC record

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/scripts run seed-admin` — seeds the initial admin user
