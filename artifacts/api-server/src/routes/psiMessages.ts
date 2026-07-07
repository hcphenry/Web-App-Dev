import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  patientProfilesTable,
  taskAssignmentsTable,
  therapeuticTasksTable,
  psiMessagesTable,
} from "@workspace/db";
import { eq, and, desc, ilike, isNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";

// ─────────────────────────────────────────────────────────────────────────
// Tablón de Anuncios — mensajes psicólogo → paciente.
//
//   Psicólogo (solo SUS pacientes; admin pasa siempre):
//     GET    /psi?pacienteId=ID   → historial de mensajes enviados a ese paciente
//     POST   /                    → { pacienteId, body, assignmentId? }
//     PATCH  /:id                 → { body } re-entrega como nuevo (read_at=NULL)
//     DELETE /:id                 → borrado LÓGICO (deleted_by_psi_at); nadie lo ve
//   Paciente:
//     GET    /mine                → mensajes visibles (no borrados por psi ni por él)
//     POST   /mine/:id/read       → marcar leído
//     DELETE /mine/:id            → ocultar de SU panel (deleted_by_paciente_at)
//
// Nunca se hace DELETE físico: el registro clínico queda para auditoría.
// ─────────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

const MAX_BODY = 4000;

const escapeLike = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

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

function requirePaciente(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  if (req.session.userRole !== "user") { res.status(403).json({ error: "Acceso denegado" }); return; }
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

function pickBody(b: any): string | null {
  const raw = typeof b?.body === "string" ? b.body.trim() : "";
  if (!raw) return null;
  return raw.slice(0, MAX_BODY);
}

const withTaskSelection = {
  id: psiMessagesTable.id,
  psicologoId: psiMessagesTable.psicologoId,
  pacienteId: psiMessagesTable.pacienteId,
  assignmentId: psiMessagesTable.assignmentId,
  body: psiMessagesTable.body,
  readAt: psiMessagesTable.readAt,
  editedAt: psiMessagesTable.editedAt,
  createdAt: psiMessagesTable.createdAt,
  updatedAt: psiMessagesTable.updatedAt,
  taskName: therapeuticTasksTable.name,
  taskIcon: therapeuticTasksTable.icon,
};

const serialize = (r: any) => ({
  ...r,
  readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt,
  editedAt: r.editedAt instanceof Date ? r.editedAt.toISOString() : r.editedAt,
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
});

// ── Psi: historial de mensajes a un paciente (los suyos; admin ve todos)
router.get("/psi", requireAdminOrPsi, async (req: any, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  if (pacienteId === null || !Number.isInteger(pacienteId)) {
    res.status(400).json({ error: "Falta pacienteId" }); return;
  }
  if (!(await psiOwnsPatient(req, pacienteId))) {
    res.status(403).json({ error: "Este paciente no está asignado a tu consulta" }); return;
  }
  const conds = [
    eq(psiMessagesTable.pacienteId, pacienteId),
    isNull(psiMessagesTable.deletedByPsiAt),
  ];
  if (req.session.userRole === "psicologo") {
    conds.push(eq(psiMessagesTable.psicologoId, req.session.userId));
  }
  const rows = await db.select(withTaskSelection).from(psiMessagesTable)
    .leftJoin(taskAssignmentsTable, eq(taskAssignmentsTable.id, psiMessagesTable.assignmentId))
    .leftJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
    .where(and(...conds))
    .orderBy(desc(psiMessagesTable.createdAt));
  res.json(rows.map(serialize));
});

// ── Psi: enviar mensaje a un paciente propio (tarea opcional)
router.post("/", requireAdminOrPsi, async (req: any, res) => {
  const b = req.body ?? {};
  const pacienteId = Number(b.pacienteId);
  if (!Number.isInteger(pacienteId)) { res.status(400).json({ error: "pacienteId inválido" }); return; }
  const body = pickBody(b);
  if (!body) { res.status(400).json({ error: "El mensaje no puede estar vacío" }); return; }

  const [paciente] = await db.select().from(usersTable).where(eq(usersTable.id, pacienteId)).limit(1);
  if (!paciente || paciente.role !== "user") { res.status(404).json({ error: "Paciente no encontrado" }); return; }
  if (!(await psiOwnsPatient(req, pacienteId))) {
    res.status(403).json({ error: "Este paciente no está asignado a tu consulta" }); return;
  }

  let assignmentId: number | null = null;
  if (b.assignmentId !== undefined && b.assignmentId !== null && b.assignmentId !== "") {
    const v = Number(b.assignmentId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "assignmentId inválido" }); return; }
    const [a] = await db.select().from(taskAssignmentsTable)
      .where(and(eq(taskAssignmentsTable.id, v), eq(taskAssignmentsTable.pacienteId, pacienteId)))
      .limit(1);
    if (!a) { res.status(403).json({ error: "La tarea no corresponde a este paciente" }); return; }
    // La tarea además debe ser visible para el psicólogo actuante (misma regla
    // que GET /tareas/assignments): él la supervisa o él la asignó. Admin pasa.
    if (req.session.userRole === "psicologo" &&
        a.psicologoId !== req.session.userId && a.assignedById !== req.session.userId) {
      res.status(403).json({ error: "La tarea no corresponde a tu consulta" }); return;
    }
    assignmentId = v;
  }

  const [row] = await db.insert(psiMessagesTable).values({
    psicologoId: req.session.userId,
    pacienteId,
    assignmentId,
    body,
  }).returning();

  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "CREATE_MENSAJE_PSI", targetTable: "psi_messages", targetId: row.id,
    ipAddress: getIp(req), details: { pacienteId, assignmentId },
  });
  res.status(201).json(serialize(row));
});

// ── Psi: modificar mensaje propio → re-entrega como nuevo al paciente
router.patch("/:id", requireAdminOrPsi, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const body = pickBody(req.body ?? {});
  if (!body) { res.status(400).json({ error: "El mensaje no puede estar vacío" }); return; }

  const [existing] = await db.select().from(psiMessagesTable).where(eq(psiMessagesTable.id, id)).limit(1);
  if (!existing || existing.deletedByPsiAt !== null) { res.status(404).json({ error: "No encontrado" }); return; }
  if (req.session.userRole === "psicologo" && existing.psicologoId !== req.session.userId) {
    res.status(403).json({ error: "No autorizado" }); return;
  }

  // Re-entrega: el mensaje editado vuelve a llegar como nuevo (pop-up) y
  // reaparece aunque el paciente lo hubiera ocultado. El texto anterior
  // queda en la auditoría (registro clínico).
  const [row] = await db.update(psiMessagesTable).set({
    body,
    editedAt: new Date(),
    readAt: null,
    deletedByPacienteAt: null,
    updatedAt: new Date(),
  }).where(eq(psiMessagesTable.id, id)).returning();

  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "UPDATE_MENSAJE_PSI", targetTable: "psi_messages", targetId: id,
    ipAddress: getIp(req), details: { pacienteId: existing.pacienteId, oldBody: existing.body },
  });
  res.json(serialize(row));
});

// ── Psi: eliminar mensaje propio (LÓGICO — el paciente tampoco lo verá)
router.delete("/:id", requireAdminOrPsi, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [existing] = await db.select().from(psiMessagesTable).where(eq(psiMessagesTable.id, id)).limit(1);
  if (!existing || existing.deletedByPsiAt !== null) { res.status(404).json({ error: "No encontrado" }); return; }
  if (req.session.userRole === "psicologo" && existing.psicologoId !== req.session.userId) {
    res.status(403).json({ error: "No autorizado" }); return;
  }
  await db.update(psiMessagesTable).set({
    deletedByPsiAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(psiMessagesTable.id, id));
  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "DELETE_MENSAJE_PSI", targetTable: "psi_messages", targetId: id,
    ipAddress: getIp(req), details: { pacienteId: existing.pacienteId, body: existing.body },
  });
  res.json({ ok: true });
});

// ── Paciente: sus mensajes visibles (con nombre de tarea y del psicólogo)
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select({
    ...withTaskSelection,
    psicologoName: usersTable.name,
  }).from(psiMessagesTable)
    .leftJoin(taskAssignmentsTable, eq(taskAssignmentsTable.id, psiMessagesTable.assignmentId))
    .leftJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
    .leftJoin(usersTable, eq(usersTable.id, psiMessagesTable.psicologoId))
    .where(and(
      eq(psiMessagesTable.pacienteId, req.session.userId),
      isNull(psiMessagesTable.deletedByPsiAt),
      isNull(psiMessagesTable.deletedByPacienteAt),
    ))
    .orderBy(desc(psiMessagesTable.createdAt));
  res.json(rows.map(serialize));
});

// ── Paciente: marcar mensaje como leído (al cerrar el pop-up)
router.post("/mine/:id/read", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [existing] = await db.select().from(psiMessagesTable).where(eq(psiMessagesTable.id, id)).limit(1);
  if (!existing || existing.pacienteId !== req.session.userId ||
      existing.deletedByPsiAt !== null || existing.deletedByPacienteAt !== null) {
    res.status(404).json({ error: "No encontrado" }); return;
  }
  if (existing.readAt === null) {
    await db.update(psiMessagesTable).set({ readAt: new Date(), updatedAt: new Date() })
      .where(eq(psiMessagesTable.id, id));
  }
  res.json({ ok: true });
});

// ── Paciente: ocultar mensaje de SU panel (LÓGICO; el psicólogo lo sigue viendo)
router.delete("/mine/:id", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [existing] = await db.select().from(psiMessagesTable).where(eq(psiMessagesTable.id, id)).limit(1);
  if (!existing || existing.pacienteId !== req.session.userId ||
      existing.deletedByPsiAt !== null || existing.deletedByPacienteAt !== null) {
    res.status(404).json({ error: "No encontrado" }); return;
  }
  await db.update(psiMessagesTable).set({
    deletedByPacienteAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(psiMessagesTable.id, id));
  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "HIDE_MENSAJE_PACIENTE", targetTable: "psi_messages", targetId: id,
    ipAddress: getIp(req), details: { psicologoId: existing.psicologoId },
  });
  res.json({ ok: true });
});

export default router;
