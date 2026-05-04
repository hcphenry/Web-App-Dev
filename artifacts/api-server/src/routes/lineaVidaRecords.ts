import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  lineaVidaRecordsTable,
  taskAssignmentsTable,
  therapeuticTasksTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
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

// GET /api/linea-vida/mine — paciente lists own records
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select().from(lineaVidaRecordsTable)
    .where(eq(lineaVidaRecordsTable.pacienteId, req.session.userId))
    .orderBy(desc(lineaVidaRecordsTable.createdAt));
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// POST /api/linea-vida/mine — paciente saves a new linea de vida
router.post("/mine", requirePaciente, async (req: any, res) => {
  const b = req.body ?? {};
  const pickStr = (v: unknown) => (typeof v === "string" ? v : null);

  // Validate eventos shape (array of objects)
  let eventos: unknown[] = [];
  if (Array.isArray(b.eventos)) {
    eventos = b.eventos.filter((e: any) => e && typeof e === "object");
  }
  if (eventos.length === 0) {
    res.status(400).json({ error: "Agrega al menos un evento a tu línea de vida" });
    return;
  }

  const data = (b.data && typeof b.data === "object") ? b.data : {};

  let assignmentId: number | null = null;
  if (b.assignmentId !== undefined && b.assignmentId !== null) {
    const v = Number(b.assignmentId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "assignmentId inválido" }); return; }
    // Validate ownership AND that the assignment corresponds to the
    // linea-de-vida task (so a paciente cannot mark unrelated tasks complete).
    const [row] = await db.select({
      a: taskAssignmentsTable,
      key: therapeuticTasksTable.key,
    }).from(taskAssignmentsTable)
      .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
      .where(and(
        eq(taskAssignmentsTable.id, v),
        eq(taskAssignmentsTable.pacienteId, req.session.userId),
      ))
      .limit(1);
    if (!row) { res.status(403).json({ error: "Asignación no es del paciente" }); return; }
    if (row.key !== "linea-de-vida") {
      res.status(400).json({ error: "La asignación no corresponde a la tarea Línea de Vida" });
      return;
    }
    assignmentId = v;
  }

  const [row] = await db.insert(lineaVidaRecordsTable).values({
    pacienteId: req.session.userId,
    assignmentId,
    presenteCircunstancias: pickStr(b.presenteCircunstancias),
    reflexionPatrones: pickStr(b.reflexionPatrones),
    fortalezasVitales: pickStr(b.fortalezasVitales),
    aprendizajesGenerales: pickStr(b.aprendizajesGenerales),
    eventos: eventos as any,
    data,
  }).returning();

  if (assignmentId !== null) {
    await db.update(taskAssignmentsTable).set({
      status: "completada",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(taskAssignmentsTable.id, assignmentId),
      eq(taskAssignmentsTable.pacienteId, req.session.userId),
    ));
  }

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "CREATE_LINEA_VIDA",
    targetTable: "linea_vida_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { assignmentId, eventos: eventos.length },
  });

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

// PATCH /api/linea-vida/:id — paciente owner edits an existing record
// Permite modificar eventos (agregar/eliminar/editar), reflexiones y
// el bloque del presente sin tener que crear una versión nueva.
router.patch("/:id", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(lineaVidaRecordsTable)
    .where(eq(lineaVidaRecordsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "No encontrado" }); return; }
  if (existing.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Solo puedes modificar tu propia línea de vida" }); return;
  }

  const b = req.body ?? {};
  const pickStr = (v: unknown) => (typeof v === "string" ? v : null);

  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (Array.isArray(b.eventos)) {
    const eventos = b.eventos.filter((e: any) => e && typeof e === "object");
    if (eventos.length === 0) {
      res.status(400).json({ error: "Tu línea de vida debe tener al menos un evento" });
      return;
    }
    update.eventos = eventos as any;
  }
  if (b.presenteCircunstancias !== undefined) update.presenteCircunstancias = pickStr(b.presenteCircunstancias);
  if (b.reflexionPatrones !== undefined)      update.reflexionPatrones = pickStr(b.reflexionPatrones);
  if (b.fortalezasVitales !== undefined)      update.fortalezasVitales = pickStr(b.fortalezasVitales);
  if (b.aprendizajesGenerales !== undefined)  update.aprendizajesGenerales = pickStr(b.aprendizajesGenerales);
  if (b.data && typeof b.data === "object")   update.data = b.data;

  const [row] = await db.update(lineaVidaRecordsTable)
    .set(update as any)
    .where(eq(lineaVidaRecordsTable.id, id))
    .returning();

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "UPDATE_LINEA_VIDA",
    targetTable: "linea_vida_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { eventos: Array.isArray(update.eventos) ? (update.eventos as unknown[]).length : undefined },
  });

  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// GET /api/linea-vida — admin/psicologo list (optional ?pacienteId)
// El psicólogo solo ve registros de pacientes que tiene asignados (es el
// psicólogo supervisor o quien creó la asignación de Línea de Vida).
router.get("/", requireAdminOrPsi, async (req: any, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  const filters: any[] = [];
  if (pacienteId !== null && Number.isInteger(pacienteId)) {
    filters.push(eq(lineaVidaRecordsTable.pacienteId, pacienteId));
  }

  if (req.session.userRole === "psicologo") {
    const psiId = req.session.userId as number;
    const rows = await db.select({
      pid: taskAssignmentsTable.pacienteId,
      psi: taskAssignmentsTable.psicologoId,
      ab: taskAssignmentsTable.assignedById,
    })
      .from(taskAssignmentsTable)
      .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
      .where(eq(therapeuticTasksTable.key, "linea-de-vida"));
    const allowedIds = Array.from(new Set(
      rows.filter(r => r.psi === psiId || r.ab === psiId).map(r => r.pid)
    ));
    if (allowedIds.length === 0) { res.json([]); return; }
    filters.push(inArray(lineaVidaRecordsTable.pacienteId, allowedIds));
  }

  const rows = await db.select().from(lineaVidaRecordsTable)
    .where(filters.length ? and(...filters) : undefined as any)
    .orderBy(desc(lineaVidaRecordsTable.createdAt));

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

// GET /api/linea-vida/:id — admin/psi/owner can read.
// Para psicólogo, valida que el paciente esté entre los que supervisa.
router.get("/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(lineaVidaRecordsTable)
    .where(eq(lineaVidaRecordsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "No encontrado" }); return; }
  const role = req.session.userRole;
  if (role === "admin") {
    // ok
  } else if (role === "psicologo") {
    const rels = await db.select({
      psi: taskAssignmentsTable.psicologoId,
      ab: taskAssignmentsTable.assignedById,
    }).from(taskAssignmentsTable)
      .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
      .where(and(
        eq(therapeuticTasksTable.key, "linea-de-vida"),
        eq(taskAssignmentsTable.pacienteId, row.pacienteId),
      ));
    const isSupervisor = rels.some(r => r.psi === req.session.userId || r.ab === req.session.userId);
    if (!isSupervisor) { res.status(403).json({ error: "Acceso denegado" }); return; }
  } else if (row.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

export default router;
