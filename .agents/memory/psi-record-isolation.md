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
Each record route passes `taskKeys` (the task `key`s it serves) in PsiRecordConfig.
Admin always bypasses. GET/PATCH/DELETE of existing psi records stay owner-scoped.

**How to apply:** when adding a new record route or a new "para Psicólogos" task,
(1) add `isNull(psicologoId)` to its `/mine`, (2) add the `psicologoId !== null`
patient-branch guard to its `/:id`, (3) set `taskKeys` in its registerPsiRecordRoutes
config. The shared psi endpoints (GET/POST/PATCH/DELETE `/psi*`) come from
`registerPsiRecordRoutes` in `artifacts/api-server/src/lib/psiRecords.ts`.
