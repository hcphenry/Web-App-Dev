import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  desarrolloSesionRecordsTable,
  taskAssignmentsTable,
  patientProfilesTable,
} from "@workspace/db";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

async function loadUserRole(req: any, _res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return next();
  if (!req.session.userRole) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (u) req.session.userRole = u.role;
  }
  next();
}

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  next();
}
function requirePaciente(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  if (req.session.userRole !== "user") { res.status(403).json({ error: "Solo pacientes" }); return; }
  next();
}
function requireAdminOrPsi(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  const role = req.session.userRole;
  if (role !== "admin" && role !== "psicologo") { res.status(403).json({ error: "Acceso denegado" }); return; }
  next();
}
function getIp(req: any): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0].trim();
  return req.socket?.remoteAddress ?? null;
}

router.use(loadUserRole);

/** Para psicólogo: verifica que `pacienteId` esté asignado a su nombre. Admin pasa siempre. */
async function psiOwnsPatient(req: any, pacienteId: number): Promise<boolean> {
  if (req.session.userRole === "admin") return true;
  const [actor] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, req.session.userId)).limit(1);
  if (!actor?.name) return false;
  const [row] = await db.select({ id: patientProfilesTable.id }).from(patientProfilesTable)
    .where(and(
      eq(patientProfilesTable.userId, pacienteId),
      ilike(patientProfilesTable.psicologaAsignada, actor.name),
    )).limit(1);
  return !!row;
}

// ── Paciente: lista sus propios registros (todas las sesiones que ha guardado)
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select().from(desarrolloSesionRecordsTable)
    .where(eq(desarrolloSesionRecordsTable.pacienteId, req.session.userId))
    .orderBy(desc(desarrolloSesionRecordsTable.createdAt));
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// ── Paciente: crea una nueva sesión.
// Es repetible (como Registro ABC): la asignación se marca 'en_progreso' pero
// NUNCA 'completada' al guardar — el paciente puede agregar tantas como quiera.
router.post("/mine", requirePaciente, async (req: any, res) => {
  const b = req.body ?? {};
  const data = (b.data && typeof b.data === "object") ? b.data : {};
  const pickStr = (v: unknown) => (typeof v === "string" ? v : null);

  let assignmentId: number | null = null;
  if (b.assignmentId !== undefined && b.assignmentId !== null) {
    const v = Number(b.assignmentId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "assignmentId inválido" }); return; }
    const [a] = await db.select().from(taskAssignmentsTable)
      .where(and(eq(taskAssignmentsTable.id, v), eq(taskAssignmentsTable.pacienteId, req.session.userId)))
      .limit(1);
    if (!a) { res.status(403).json({ error: "Asignación no es del paciente" }); return; }
    assignmentId = v;
  }

  const [row] = await db.insert(desarrolloSesionRecordsTable).values({
    pacienteId: req.session.userId,
    assignmentId,
    fechaSesion: pickStr(b.fechaSesion),
    horaSesion: pickStr(b.horaSesion),
    numeroSesion: pickStr(b.numeroSesion),
    data,
  }).returning();

  if (assignmentId !== null) {
    // Repetible: marcamos 'en_progreso' (si seguía pendiente) y registramos
    // started_at la primera vez. Nunca pasa a 'completada' automáticamente.
    await db.update(taskAssignmentsTable).set({
      status: "en_progreso",
      startedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(taskAssignmentsTable.id, assignmentId),
      eq(taskAssignmentsTable.pacienteId, req.session.userId),
      eq(taskAssignmentsTable.status, "pendiente"),
    ));
  }

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "CREATE_DESARROLLO_SESION",
    targetTable: "desarrollo_sesion_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { assignmentId, numeroSesion: row.numeroSesion },
  });

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

// ── Admin / psicólogo: crea una sesión PARA un paciente específico.
// Repetible — no toca asignaciones (la asignación de "Desarrollo Sesión"
// es del psicólogo y no se completa automáticamente).
router.post("/for-patient/:pacienteId", requireAdminOrPsi, async (req: any, res) => {
  const pacienteId = parseInt(req.params.pacienteId);
  if (!Number.isInteger(pacienteId)) { res.status(400).json({ error: "pacienteId inválido" }); return; }
  const [paciente] = await db.select().from(usersTable).where(eq(usersTable.id, pacienteId)).limit(1);
  if (!paciente || paciente.role !== "user") { res.status(404).json({ error: "Paciente no encontrado" }); return; }
  if (!(await psiOwnsPatient(req, pacienteId))) {
    res.status(403).json({ error: "Este paciente no está asignado a tu consulta" }); return;
  }

  const b = req.body ?? {};
  const data = (b.data && typeof b.data === "object") ? b.data : {};
  const pickStr = (v: unknown) => (typeof v === "string" ? v : null);

  const [row] = await db.insert(desarrolloSesionRecordsTable).values({
    pacienteId,
    assignmentId: null,
    fechaSesion: pickStr(b.fechaSesion),
    horaSesion: pickStr(b.horaSesion),
    numeroSesion: pickStr(b.numeroSesion),
    data,
  }).returning();

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "CREATE_DESARROLLO_SESION_FOR_PATIENT",
    targetTable: "desarrollo_sesion_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { pacienteId, numeroSesion: row.numeroSesion },
  });

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

// ── Admin / psicólogo: lista de sesiones (filtrable por paciente)
router.get("/", requireAdminOrPsi, async (req: any, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  const filters: any[] = [];
  if (pacienteId !== null && Number.isInteger(pacienteId)) {
    if (!(await psiOwnsPatient(req, pacienteId))) {
      res.status(403).json({ error: "Este paciente no está asignado a tu consulta" }); return;
    }
    filters.push(eq(desarrolloSesionRecordsTable.pacienteId, pacienteId));
  } else if (req.session.userRole !== "admin") {
    // Psicólogo no puede listar TODO sin filtro de paciente
    res.status(400).json({ error: "Falta pacienteId" }); return;
  }
  const rows = await db.select().from(desarrolloSesionRecordsTable)
    .where(filters.length ? and(...filters) : undefined as any)
    .orderBy(desc(desarrolloSesionRecordsTable.createdAt));
  const ids = Array.from(new Set(rows.map(r => r.pacienteId)));
  const users = ids.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(inArray(usersTable.id, ids))
    : [];
  const uMap = new Map(users.map(u => [u.id, u]));
  res.json(rows.map(r => ({
    ...r,
    pacienteName: uMap.get(r.pacienteId)?.name ?? null,
    pacienteEmail: uMap.get(r.pacienteId)?.email ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.get("/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(desarrolloSesionRecordsTable)
    .where(eq(desarrolloSesionRecordsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "No encontrado" }); return; }
  const role = req.session.userRole;
  if (role !== "admin" && role !== "psicologo" && row.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

export default router;
