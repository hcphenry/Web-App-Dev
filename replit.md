# Workspace

## Overview

This project is a pnpm workspace monorepo implementing a web application called "ABC TCC - Registro Emocional Terapéutico". Its core purpose is to provide a digital tool for therapeutic emotional registration based on the Cognitive Behavioral Therapy (CBT) ABC method.

The application serves multiple user roles: patients, psychologists, and administrators, offering tailored functionalities for each. It aims to streamline therapeutic processes, facilitate emotional tracking, and provide comprehensive administrative and financial management for a clinical setting.

## User Preferences

I prefer iterative development, with a focus on delivering working features incrementally. Please ask before making any major architectural changes or introducing new dependencies. I appreciate clear and concise explanations for any complex logic or decisions made.

## System Architecture

The project is structured as a pnpm monorepo using TypeScript.

**Technical Stack:**
*   **Monorepo Tool:** pnpm workspaces
*   **Node.js:** v24
*   **Package Manager:** pnpm
*   **TypeScript:** v5.9
*   **API Framework:** Express v5
*   **Database:** PostgreSQL with Drizzle ORM
*   **Validation:** Zod (`zod/v4`), `drizzle-zod`
*   **API Codegen:** Orval (from OpenAPI spec)
*   **Build Tool:** esbuild (CJS bundle)
*   **Authentication:** `express-session` (cookie-based), bcryptjs for password hashing
*   **Frontend:** React + Vite, Tailwind CSS, shadcn/ui, react-hook-form, framer-motion

**Monorepo Structure:**
*   `artifacts/`: Contains `api-server` (Express backend) and `abc-web` (React frontend).
*   `lib/`: Houses shared libraries including `api-spec`, `api-client-react` (generated React Query hooks), `api-zod` (generated Zod schemas), and `db` (Drizzle ORM schema).
*   `scripts/`: Utility scripts, e.g., `seed-admin.ts`.

**Frontend UI/UX:**
*   **Patient Dashboard (`/register-abc`):** Features a welcome banner, scalable task cards (e.g., "Registro ABC" with an indigo/purple gradient, "La Rueda de la Vida" as a disabled placeholder), and quick access to history.
*   **ABC Guided Wizard:** A multi-step form (A - Situación, B - Pensamientos, C - Emoción/Conducta, Reflexión, Summary) with navigation controls.
*   **Admin Dashboards (`/admin`):** Comprises 9 tabs for user management, record viewing, psychologist management, scheduling (`Portal Agenda`), billing (`Portal Contable`), financial management (`Portal Financiero`), audit logs, and account settings. The UI uses a card-based layout for records and interactive calendar components for scheduling.
*   **Psychologist Portal (`/psicologo`):** 5 tabs for profile, availability management, assigned tasks, and account settings.
*   **Mobile App (`abc-mobile`):** Patient-centric with bottom tabs for "Tareas" (ABC form) and "Agenda" (session list).

**Key Features and Design Decisions:**
*   **Role-Based Access Control (RBAC):** Distinct portals and functionalities for `admin`, `user` (patient), and `psicologo` roles.
*   **API Design:** All API routes are prefixed with `/api`. Authentication middleware (`requireAdmin`, `requirePsicologo`) enforces access.
*   **Data Validation:** Zod is used for robust schema validation.
*   **API Code Generation:** Orval generates client-side hooks and schemas from an OpenAPI specification, ensuring type safety and reducing manual effort.
*   **Financial Module (`Portal Financiero`):** Includes `.xlsx` bank statement ingestion with auto-detection of banks (BCP, BBVA, SCOTIABANK, INTERBANK), deduplication based on SHA-256 hashing, and strict date parsing (Lima TZ).
*   **Auditing:** Comprehensive audit logging for sensitive actions, viewable by administrators.
*   **Therapeutic Task Management:** A catalog of tasks with `target_role` to assign specific tasks to patients or psychologists.
*   **Mobile App Authentication:** Uses JWT stored in AsyncStorage, with backend middleware adapting session-guarded routes for mobile.
*   **TypeScript Monorepo:** Utilizes TypeScript's composite projects and project references for efficient type-checking and build processes across packages.

## External Dependencies

*   **PostgreSQL:** Relational database for persistent data storage.
*   **Drizzle ORM:** Object-Relational Mapper for interacting with PostgreSQL.
*   **Express.js:** Web application framework for the API server.
*   **React:** JavaScript library for building user interfaces.
*   **Vite:** Frontend build tool.
*   **Tailwind CSS:** Utility-first CSS framework.
*   **shadcn/ui:** UI component library.
*   **react-hook-form:** Library for form management in React.
*   **framer-motion:** Library for animations in React.
*   **Zod:** Schema declaration and validation library.
*   **Orval:** OpenAPI client code generator.
*   **esbuild:** Bundler for JavaScript and TypeScript.
*   **express-session:** Middleware for managing sessions in Express.
*   **bcryptjs:** Library for hashing passwords.
*   **Expo:** Framework for building universal native apps with React.
## Therapeutic Tasks (Patient Portal)

Tasks live in `therapeutic_tasks` (catalog) + `task_assignments` (per-paciente). Each task has a record table and a backend route under `/api/<task>/mine`. Available tasks for patients include: `registro-abc`, `anamnesis-menor`, `primera-consulta-ninos`, `desarrollo-sesion`, `consulta-psicologica-adultos`, `desarrollo-sesion-paciente`, `plan-intervencion-adultos`, `plan-intervencion-ninos`, and **`linea-de-vida`** (Línea de Vida — multi-step guided wizard with timeline of life events, type tagging positivo/difícil/neutro, reflexion + fortalezas; backend at `/api/linea-vida/mine`, table `linea_vida_records`, component `artifacts/abc-web/src/components/LineaVidaForm.tsx`). The POST handler validates that the supplied `assignmentId` belongs to the paciente AND maps to the matching task `key` before marking the assignment complete.
