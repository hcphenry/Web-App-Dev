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
- Patient lands on **Task Dashboard** at `/register-abc` (default view: `'dashboard'`):
  - Welcome banner with user greeting
  - Task cards rendered via `.map()` over `therapeuticTasks` array (scalable)
  - "Registro ABC" card: available, indigo/purple gradient, click opens ABC form
  - "La Rueda de la Vida" card: placeholder/disabled, shows lock icon
  - Quick access link to history
- ABC guided wizard (activated from dashboard card):
  - Step 1: A - Situación/Estímulo (objective description of what happened)
  - Step 2: B - Pensamientos Automáticos (automatic thoughts)
  - Step 3: C - Emoción y Conducta (emotion name, intensity 1-10, behavior)
  - Step 4: Reflexión cognitiva (optional alternative thought)
  - Step 5: Summary review before submit
  - Step 1 "Inicio" button returns to dashboard; steps 2-5 have "Atrás"
- View past records (History view)
- Navigation bar: Inicio | Historial | Mi Cuenta

### Admin View
- Dashboard at `/admin` (8 tabs)
- **Usuarios**: User management (create, edit, delete, change password). Patients have a teal eye-icon button to open their clinical profile.
- **Registros**: View all ABC records filtered by user (card-based layout)
- **Psicólogos**: Manage psychologists (CRUD with professional profile data)
- **Contable** (Portal Contable): Billing/accounting module with sub-tabs Dashboard (KPIs + monthly chart), Tarifas (per-patient session rates with currency PEN/USD/EUR), Sesiones (session log with estado pagado/pendiente/deuda, filters, mark as paid, edit, delete), Reportes (per-patient and per-psychologist reports with comisión calc + CSV export). Backend `/api/contabilidad/*` enforces admin RBAC, atomic transactions for session creation with tarifa fallback, strict currency allowlist, and DB CHECK constraints (`monto >= 0`).
- **Financiero** (Portal Financiero): Bank statement ingestion module. Sub-tabs Dashboard (4 KPIs Ingresos/Egresos/Balance Neto/Total + breakdown por banco) and Transacciones (paginated table with filters by banco/usuario/search/date-range/monto-range, inline edit of paciente assignment and banco label, CSV/Excel export). Upload modal accepts `.xlsx` (10MB max) and auto-detects bank by column signature for BCP/BBVA/SCOTIABANK/INTERBANK (Interbank also reads "Cargo" column as negative). Excel dates parsed as Lima TZ (00:00 = 05:00Z), strict — no host-TZ fallback. Deduplication via SHA-256 hash over `banco|cuentaBancaria|fechaIso|monto|numeroOperacion|descripcion` so same op in different accounts is not collapsed. All routes admin-only with `requireAdmin`; `loadUserRole` clears stale session when DB user is missing.
- **Auditoría**: Audit log viewer with action filter and pagination (VIEW_PATIENT_PROFILE, ADMIN_UPDATE_PATIENT_PROFILE, UPDATE_OWN_PROFILE, FINANCIERO_*)
- **Mi Cuenta**: Admin can change their own email/password
- Password suggestion tool

### Psychologist View
- Dedicated portal at `/psicologo`
- **Mi Perfil**: View professional profile info
- **Disponibilidad**: Manage availability slots (create, edit, delete time slots)
- **Mi Cuenta**: Change email/password

### Patient View
- ABC registration form at `/register-abc`
- 3 views: form, history, account
- **Mi Cuenta** now includes full clinical profile form (apellidos, fecha nacimiento, sexo, documento, celular, estado, dirección, perioricidad, fecha alta) plus email/password change

## Database Schema

- **users**: id, name, email, password_hash, role (admin|user|psicologo), created_at
- **records**: id, user_id, situacion, pensamientos, emocion, intensidad, conducta, reflexion, created_at
- **psychologist_profiles**: id, user_id, date_of_birth, profession, registration_date, deregistration_date, commission_percentage, license_number
- **availability_slots**: id, psychologist_id, start_time, end_time, is_available, notes, created_at
- **patient_profiles**: id, user_id (FK→users, unique), apellido_paterno, apellido_materno, perioricidad, fecha_alta, estado (activo/inactivo/suspendido), nro_celular, tipo_documento, numero_documento, fecha_nacimiento, sexo, direccion, distrito, ciudad, departamento, pais, costo_terapia, psicologa_asignada, created_at, updated_at
- **audit_logs**: id, actor_id, actor_name, action, target_table, target_id, ip_address, details (JSON text), created_at
- **reclamaciones**: id, correlativo, fecha, tipo_reclamo, tipo_item, nombres, dni, domicilio, telefono, email, es_menor, rep_nombres, rep_dni, rep_vinculo, monto, descripcion_bien, detalle, pedido, email_enviado, creado_en
- **transactions**: id, fecha (timestamptz, Lima 00:00 stored as 05:00Z), descripcion, monto numeric(14,2), moneda (PEN default), numero_operacion, banco, cuenta_bancaria, usuario_id (FK→users, nullable), usuario_texto (free-text fallback), hash_unico (UNIQUE), uploaded_by (FK→users), created_at, updated_at + indexes on banco, fecha, usuario_id, hash_unico

## Default Admin Credentials

- Email: `admin@abc.com`
- Password: (set during initial setup via seed script)

## Roles

- `admin` → redirected to `/admin`
- `user` → redirected to `/register-abc`
- `psicologo` → redirected to `/psicologo`

## API Routes

All routes under `/api`:
- `POST /auth/login` — Login
- `POST /auth/logout` — Logout
- `GET /auth/me` — Current user info
- `PUT /auth/me/email` — Update own email
- `PUT /auth/me/password` — Update own password
- `GET /admin/users` — List users (admin only)
- `POST /admin/users` — Create user (admin only)
- `PUT /admin/users/:id` — Update user (admin only)
- `DELETE /admin/users/:id` — Delete user (admin only)
- `GET /admin/suggest-password` — Suggest strong password (admin only)
- `GET /admin/records` — All ABC records (admin only, filterable by userId)
- `GET /admin/psychologists` — List psychologists (admin only)
- `POST /admin/psychologists` — Create psychologist (admin only)
- `PUT /admin/psychologists/:id` — Update psychologist (admin only)
- `DELETE /admin/psychologists/:id` — Delete psychologist (admin only)
- `GET /admin/psychologists/:id/availability` — View psychologist slots (admin only)
- `GET/POST /api/contabilidad/tarifas` — List/upsert per-patient session rates (admin only)
- `DELETE /api/contabilidad/tarifas/:id` — Remove tariff (admin only)
- `GET /api/contabilidad/sesiones` — List billed sessions, filters: estado, search, psicologoId, from, to (admin only)
- `POST /api/contabilidad/sesiones` — Create billed session (transactional, auto-resolves monto from tarifa) (admin only)
- `PATCH/DELETE /api/contabilidad/sesiones/:id` — Edit / delete billed session (admin only)
- `GET /api/contabilidad/reportes/clinica|paciente|psicologo` — Aggregated billing reports (admin only)
- `GET /api/contabilidad/pacientes` & `/psicologos` — Helper lists for the UI (admin only)
- `GET /records` — Current user's records
- `POST /records` — Create ABC record
- `GET /psicologo/profile` — Psychologist's own profile
- `GET /psicologo/availability` — Psychologist's availability slots
- `POST /psicologo/availability` — Create availability slot
- `PUT /psicologo/availability/:id` — Update slot
- `DELETE /psicologo/availability/:id` — Delete slot
- `GET /patient/profile` — Patient's own clinical profile (auth required)
- `PUT /patient/profile` — Save/update own clinical profile (auth required, logs audit)
- `GET /admin/patients/:id/profile` — View any patient's clinical profile (admin only, logs audit)
- `PUT /admin/patients/:id/profile` — Update any patient's clinical profile (admin only, logs audit)
- `GET /admin/audit-logs` — Paginated audit log list with action/actor/date filters (admin only)
- `POST /api/financiero/upload` — Upload bank statement .xlsx; auto-detects bank, dedups by hash (admin only)
- `GET /api/financiero/transactions` — List with filters banco/usuarioId/search/from/to/montoMin/montoMax + pagination (admin only)
- `PATCH/DELETE /api/financiero/transactions/:id` — Inline edit (usuarioId/usuarioTexto/banco/cuentaBancaria) / delete (admin only)
- `GET /api/financiero/kpis` — Aggregates totalIngresos/totalEgresos/balanceNeto/totalTransacciones + porBanco breakdown (admin only)
- `GET /api/financiero/export.csv` & `/export.xlsx` — Export filtered transactions (admin only)
- `GET /api/financiero/usuarios` & `/bancos` — Helper lists for UI dropdowns (admin only)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/scripts run seed-admin` — seeds the initial admin user
