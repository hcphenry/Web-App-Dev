---
name: Psi record isolation (ABC CBT app)
description: How "para Psicólogos" task records are isolated from patients via a psicologo_id discriminator across the 9 record routes.
---

# Psi record isolation

The ABC CBT app has clinical-form tasks that can target patients OR psychologists.
A record FILLED BY A PSYCHOLOGIST for one of their patients carries
`psicologo_id = <psi user id>`; a patient's own record has `psicologo_id IS NULL`.

## The rule
Patients must NEVER see psi-filled records. **Every patient-readable endpoint must
exclude rows where `psicologo_id IS NOT NULL`.** This is not automatic — it lives in
hand-written code in each of the 9 record routes, so it is easy to regress.

Two patient-readable surfaces per route, both must filter:
- `GET /mine` → `where(and(eq(pacienteId, userId), isNull(table.psicologoId)))`
- `GET /:id` → in the patient branch, deny when `row.psicologoId !== null`
  (simple routes: `(row.pacienteId !== userId || row.psicologoId !== null)`;
   join/supervisor-gated routes: append `|| row.psicologoId !== null` to the final
   `else if (row.pacienteId !== userId)`).

**Why:** a code review found desarrolloSesion `/mine` was missing the isNull filter
(leaked in the list view) and ALL `/:id` routes let a patient fetch any of their own
rows by id regardless of psicologo_id (enumerable leak). Both violate the hard
requirement "patients NEVER see psi-filled records."

## Admin enable/disable gate (defense in depth)
`psychologist_task_access (psicologoId, taskId)` — a row's presence = enabled.
Enforced server-side in `lib/psiRecords.ts` `psiHasTaskAccess(req, taskKeys)` on
`POST /psi/for-patient` only (create-time), matching the assignment-flow model.
Each record route passes `taskKeys` in PsiRecordConfig, but those keys come from
the central `PSI_RECORD_TASK_KEYS` map (single source of truth) via
`psiRecordTaskKeys("<route-id>")` — NOT inline arrays. A startup guard
`assertPsiRecordTaskKeyCoverage()` (called in `src/index.ts` after migrations)
throws if a mapped key no longer exists in `therapeutic_tasks` (rename drift) or
if a `target_role='psicologo'` task maps to no route and isn't in
`ROUTELESS_PSI_TASK_KEYS` (currently just `notas-sesion-psi`, which has no record
route by design). Admin always bypasses. GET/PATCH/DELETE stay owner-scoped.

**Note:** most route taskKeys are actually `target_role='paciente'` tasks (the
"psicólogo" comment is loose) — a record route serves the keys whose records it
stores, regardless of target_role.

**How to apply:** when adding a new record route or a new "para Psicólogos" task,
(1) add `isNull(psicologoId)` to its `/mine`, (2) add the `psicologoId !== null`
patient-branch guard to its `/:id`, (3) add the route + its keys to
`PSI_RECORD_TASK_KEYS` and set `taskKeys: psiRecordTaskKeys("<route-id>")` in its
registerPsiRecordRoutes config (do NOT inline the array — the startup guard
relies on the central map). The shared psi endpoints (GET/POST/PATCH/DELETE
`/psi*`) come from `registerPsiRecordRoutes` in
`artifacts/api-server/src/lib/psiRecords.ts`.
