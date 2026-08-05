import type { IRouter } from "express";
import {
  db,
  usersTable,
  patientProfilesTable,
  taskAssignmentsTable,
  therapeuticTasksTable,
  psychologistTaskAccessTable,
} from "@workspace/db";
import { eq, and, desc, ilike, isNotNull, inArray } from "drizzle-orm";
import { logAudit } from "./audit";

// ─────────────────────────────────────────────────────────────────────────
// Shared "para Psicólogos" record endpoints.
//
// A record FILLED BY A PSYCHOLOGIST for one of their patients carries
// `psicologo_id = <psi user id>`. The patient must NEVER see these records:
// each route's patient-facing `GET /mine` filters `psicologo_id IS NULL`.
//
// This helper registers, on the given record router:
//   GET    /psi?pacienteId=ID         → list psi-filled records for that patient
//   POST   /psi/for-patient/:pacienteId → create a psi-filled record
//   PATCH  /psi/:id                    → edit a psi-filled record (owner psi/admin)
//   DELETE /psi/:id                    → delete a psi-filled record (owner psi/admin)
//
// Security gate: the caller must be admin, or a psicólogo to whom the patient
// is assigned (matched by name in patient_profiles.psicologa_asignada).
// ─────────────────────────────────────────────────────────────────────────

const escapeLike = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

// Body pickers reused by each record route's mapBody.
export const pStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
export const pData = (b: any): Record<string, unknown> =>
  (b && b.data && typeof b.data === "object" ? b.data : {});
export const pArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function getIp(req: any): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0].trim();
  return req.socket?.remoteAddress ?? null;
}

function requireAdminOrPsi(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  const role = req.session.userRole;
  if (role !== "admin" && role !== "psicologo") { res.status(403).json({ error: "Acceso denegado" }); return; }
  next();
}

/** Para psicólogo: verifica que `pacienteId` esté asignado a su nombre. Admin pasa siempre. */
async function psiOwnsPatient(req: any, pacienteId: number): Promise<boolean> {
  if (req.session.userRole === "admin") return true;
  const [actor] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, req.session.userId)).limit(1);
  if (!actor?.name) return false;
  const [row] = await db.select({ id: patientProfilesTable.id }).from(patientProfilesTable)
    .where(and(
      eq(patientProfilesTable.userId, pacienteId),
      ilike(patientProfilesTable.psicologaAsignada, escapeLike(actor.name)),
    )).limit(1);
  return !!row;
}

async function getActorName(actorId: number | null | undefined): Promise<string | null> {
  if (!actorId) return null;
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, actorId)).limit(1);
  return u?.name ?? null;
}

/**
 * Verifica que el psicólogo tenga habilitada (en psychologist_task_access) al
 * menos una de las tareas cuyo `key` esté en `taskKeys` (las tareas que usan
 * esta ruta de registros). Admin pasa siempre. Defensa en profundidad para que
 * un psicólogo no pueda usar por API directa una tarea que el admin deshabilitó.
 */
async function psiHasTaskAccess(req: any, taskKeys: string[]): Promise<boolean> {
  if (req.session.userRole === "admin") return true;
  if (!taskKeys.length) return false;
  const [row] = await db.select({ id: psychologistTaskAccessTable.id })
    .from(psychologistTaskAccessTable)
    .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, psychologistTaskAccessTable.taskId))
    .where(and(
      eq(psychologistTaskAccessTable.psicologoId, req.session.userId),
      inArray(therapeuticTasksTable.key, taskKeys),
    )).limit(1);
  return !!row;
}

// ─────────────────────────────────────────────────────────────────────────
// Central source of truth: which task keys each "para Psicólogos" record route
// serves. Every record route reads its `taskKeys` from here (via
// `psiRecordTaskKeys`) instead of an inline array, so adding or renaming a task
// key only has to happen in one place. `assertPsiRecordTaskKeyCoverage()` runs
// at startup and fails loudly when this map drifts from the DB task catalog,
// which would otherwise make the admin enable/disable gate silently misbehave.
// ─────────────────────────────────────────────────────────────────────────
export const PSI_RECORD_TASK_KEYS = {
  "anamnesis": ["anamnesis-menor"],
  "primera-consulta": ["primera-consulta-ninos"],
  "desarrollo-sesion": ["desarrollo-sesion", "desarrollo-sesion-paciente"],
  "consulta-psicologica": ["consulta-psicologica-adultos"],
  "plan-intervencion": ["plan-intervencion-adultos", "plan-intervencion-ninos"],
  "linea-vida": ["linea-de-vida"],
  "distorsiones": ["distorsiones-realidad"],
  "rueda-vida": ["rueda-vida"],
  "creencias-irracionales": ["creencias-irracionales"],
} as const satisfies Record<string, readonly string[]>;

export type PsiRecordRouteId = keyof typeof PSI_RECORD_TASK_KEYS;

// Inverse map taskKey → routeId, built once at import time. Throws immediately
// if any task key is claimed by more than one route — a key must map to exactly
// one route, or the access gate becomes ambiguous.
export const PSI_TASK_KEY_TO_ROUTE: Readonly<Record<string, PsiRecordRouteId>> = (() => {
  const map: Record<string, PsiRecordRouteId> = {};
  for (const routeId of Object.keys(PSI_RECORD_TASK_KEYS) as PsiRecordRouteId[]) {
    for (const key of PSI_RECORD_TASK_KEYS[routeId]) {
      if (map[key]) {
        throw new Error(
          `[psiRecords] task key "${key}" is mapped to multiple record routes ` +
          `("${map[key]}" and "${routeId}"); each key must map to exactly one route.`,
        );
      }
      map[key] = routeId;
    }
  }
  return map;
})();

/**
 * Task keys served by a record route. Use this in each route's PsiRecordConfig
 * instead of an inline array so the taskKey → route mapping lives in one place.
 */
export function psiRecordTaskKeys(routeId: PsiRecordRouteId): string[] {
  const keys = PSI_RECORD_TASK_KEYS[routeId];
  if (!keys) {
    throw new Error(`[psiRecords] no task keys mapped for record route "${routeId}"`);
  }
  return [...keys];
}

// "para Psicólogos" tasks (target_role='psicologo') that intentionally have NO
// dedicated record route (e.g. clinical notes handled elsewhere). They are
// excluded from the startup coverage check. Add a key here ONLY when you have
// deliberately decided it does not need a registerPsiRecordRoutes route.
export const ROUTELESS_PSI_TASK_KEYS: ReadonlySet<string> = new Set(["notas-sesion-psi"]);

/**
 * Startup guard against task-type drift. Fails loudly (throws) when the central
 * PSI_RECORD_TASK_KEYS map no longer agrees with the DB task catalog:
 *
 *   1. A taskKey declared in the map no longer exists in therapeutic_tasks
 *      (someone renamed/deleted the key without updating the route → the admin
 *      enable/disable gate would silently stop matching).
 *   2. A "para Psicólogos" task (target_role='psicologo') maps to no route and
 *      is not in ROUTELESS_PSI_TASK_KEYS (someone added a new psi task without
 *      giving it a record route).
 */
export async function assertPsiRecordTaskKeyCoverage(): Promise<void> {
  const tasks = await db.select({
    key: therapeuticTasksTable.key,
    targetRole: therapeuticTasksTable.targetRole,
  }).from(therapeuticTasksTable);

  const existingKeys = new Set(tasks.map((t) => t.key));
  const errors: string[] = [];

  // (1) Every mapped key must still exist in the catalog.
  for (const key of Object.keys(PSI_TASK_KEY_TO_ROUTE)) {
    if (!existingKeys.has(key)) {
      errors.push(
        `mapped task key "${key}" (route "${PSI_TASK_KEY_TO_ROUTE[key]}") does not exist in ` +
        `therapeutic_tasks — was it renamed or deleted without updating PSI_RECORD_TASK_KEYS?`,
      );
    }
  }

  // (2) Every psi-target task must map to a route (unless intentionally route-less).
  for (const t of tasks) {
    if (t.targetRole !== "psicologo") continue;
    if (ROUTELESS_PSI_TASK_KEYS.has(t.key)) continue;
    if (!PSI_TASK_KEY_TO_ROUTE[t.key]) {
      errors.push(
        `"para Psicólogos" task "${t.key}" maps to no record route — add it to ` +
        `PSI_RECORD_TASK_KEYS, or to ROUTELESS_PSI_TASK_KEYS if it is intentionally route-less.`,
      );
    }
  }

  if (errors.length) {
    throw new Error(
      `[psiRecords] task key map drifted from the catalog:\n  - ${errors.join("\n  - ")}`,
    );
  }
}

export interface PsiRecordConfig {
  /** Drizzle record table (must have pacienteId, psicologoId, assignmentId, createdAt, updatedAt). */
  table: any;
  /** Audit action suffix, e.g. "PRIMERA_CONSULTA". */
  auditName: string;
  /** SQL table name for audit logs, e.g. "primera_consulta_records". */
  targetTable: string;
  /** Map request body → typed/non-standard columns (incl. `data`) for INSERT. */
  mapBody: (b: any) => Record<string, unknown>;
  /**
   * Task keys que usan esta ruta; gate de acceso del admin. Usa
   * `psiRecordTaskKeys("<route-id>")` (mapa central) en lugar de un array inline.
   */
  taskKeys: string[];
}

const serialize = (r: any) => ({
  ...r,
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
});

export function registerPsiRecordRoutes(router: IRouter, cfg: PsiRecordConfig): void {
  const { table, auditName, targetTable, mapBody, taskKeys } = cfg;

  // List psi-filled records for a patient
  router.get("/psi", requireAdminOrPsi, async (req: any, res) => {
    const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
    if (pacienteId === null || !Number.isInteger(pacienteId)) {
      res.status(400).json({ error: "Falta pacienteId" }); return;
    }
    if (!(await psiOwnsPatient(req, pacienteId))) {
      res.status(403).json({ error: "Este paciente no está asignado a tu consulta" }); return;
    }
    const rows = await db.select().from(table)
      .where(and(eq(table.pacienteId, pacienteId), isNotNull(table.psicologoId)))
      .orderBy(desc(table.createdAt));
    res.json(rows.map(serialize));
  });

  // Create a psi-filled record for a patient
  router.post("/psi/for-patient/:pacienteId", requireAdminOrPsi, async (req: any, res) => {
    const pacienteId = parseInt(req.params.pacienteId);
    if (!Number.isInteger(pacienteId)) { res.status(400).json({ error: "pacienteId inválido" }); return; }
    const [paciente] = await db.select().from(usersTable).where(eq(usersTable.id, pacienteId)).limit(1);
    if (!paciente || paciente.role !== "user") { res.status(404).json({ error: "Paciente no encontrado" }); return; }
    if (!(await psiOwnsPatient(req, pacienteId))) {
      res.status(403).json({ error: "Este paciente no está asignado a tu consulta" }); return;
    }
    if (!(await psiHasTaskAccess(req, taskKeys))) {
      res.status(403).json({ error: "No tienes esta tarea habilitada" }); return;
    }

    const b = req.body ?? {};
    let assignmentId: number | null = null;
    if (b.assignmentId !== undefined && b.assignmentId !== null) {
      const v = Number(b.assignmentId);
      if (!Number.isInteger(v)) { res.status(400).json({ error: "assignmentId inválido" }); return; }
      const [a] = await db.select().from(taskAssignmentsTable)
        .where(and(eq(taskAssignmentsTable.id, v), eq(taskAssignmentsTable.pacienteId, pacienteId)))
        .limit(1);
      if (!a) { res.status(403).json({ error: "Asignación no corresponde a este paciente" }); return; }
      assignmentId = v;
    }

    const [row] = (await db.insert(table).values({
      pacienteId,
      psicologoId: req.session.userId,
      assignmentId,
      ...mapBody(b),
    }).returning()) as any[];

    if (assignmentId !== null) {
      await db.update(taskAssignmentsTable).set({
        status: "en_progreso",
        startedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(taskAssignmentsTable.id, assignmentId),
        eq(taskAssignmentsTable.status, "pendiente"),
      ));
    }

    await logAudit({
      actorId: req.session.userId, actorName: await getActorName(req.session.userId),
      action: `CREATE_${auditName}_PSI`, targetTable, targetId: row.id,
      ipAddress: getIp(req), details: { pacienteId, assignmentId },
    });
    res.status(201).json(serialize(row));
  });

  // Edit a psi-filled record
  router.patch("/psi/:id", requireAdminOrPsi, async (req: any, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
    const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing || existing.psicologoId === null) { res.status(404).json({ error: "No encontrado" }); return; }
    if (req.session.userRole === "psicologo") {
      if (existing.psicologoId !== req.session.userId || !(await psiOwnsPatient(req, existing.pacienteId))) {
        res.status(403).json({ error: "No autorizado" }); return;
      }
    }
    const b = req.body ?? {};
    const [row] = await db.update(table).set({ ...mapBody(b), updatedAt: new Date() })
      .where(eq(table.id, id)).returning();
    await logAudit({
      actorId: req.session.userId, actorName: await getActorName(req.session.userId),
      action: `UPDATE_${auditName}_PSI`, targetTable, targetId: id,
      ipAddress: getIp(req), details: { pacienteId: existing.pacienteId },
    });
    res.json(serialize(row));
  });

  // Delete a psi-filled record
  router.delete("/psi/:id", requireAdminOrPsi, async (req: any, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
    const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing || existing.psicologoId === null) { res.status(404).json({ error: "No encontrado" }); return; }
    if (req.session.userRole === "psicologo") {
      if (existing.psicologoId !== req.session.userId || !(await psiOwnsPatient(req, existing.pacienteId))) {
        res.status(403).json({ error: "No autorizado" }); return;
      }
    }
    await db.delete(table).where(eq(table.id, id));
    await logAudit({
      actorId: req.session.userId, actorName: await getActorName(req.session.userId),
      action: `DELETE_${auditName}_PSI`, targetTable, targetId: id,
      ipAddress: getIp(req), details: { pacienteId: existing.pacienteId },
    });
    res.json({ ok: true });
  });
}
