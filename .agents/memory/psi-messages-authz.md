---
name: Psi ownership is name-based app-wide
description: Why psi→patient authorization matches psicologa_asignada by name and what to watch for
---

# Psi→patient ownership is NAME-based across the whole app

The rule: a psychologist "owns" a patient when `patient_profiles.psicologa_asignada`
matches `users.name` via `ilike` (escape `%`/`_` before matching). This same check is
used in `/psicologo/patients`, psi task-record routes, and the mensajes (Tablón) routes.

**Why:** the admin UI assigns patients by typing/choosing the psychologist's NAME, not
an FK. New features must reuse the same check for consistency — introducing an FK for
one feature only would desynchronize ownership between features.

**How to apply:** copy the `psiOwnsPatient` pattern (select actor name → ilike match)
when adding psi-scoped endpoints. Architect review flags this as an IDOR risk (renamed
or duplicate psychologist names); if the user ever wants it hardened, migrate
`patient_profiles` to a `psicologo_user_id` FK **app-wide in one task**, not per-feature.

Related: task assignments visible to a psi = `psicologo_id = me OR assigned_by_id = me`
(same rule as GET /tareas/assignments) — enforce it when linking assignments elsewhere.
