import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  therapeuticTasksTable,
  taskAssignmentsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// ─── Auth helpers ─────────────────────────────────────────────────────────
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

function requireAdminOrPsi(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  const role = req.session.userRole;
  if (role !== "admin" && role !== "psicologo") {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  if (req.session.userRole !== "admin") { res.status(403).json({ error: "Acceso denegado" }); return; }
  next();
}

function requirePaciente(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  if (req.session.userRole !== "user") { res.status(403).json({ error: "Solo pacientes" }); return; }
  next();
}

function requirePsicologo(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "No autenticado" }); return; }
  if (req.session.userRole !== "psicologo") { res.status(403).json({ error: "Solo psicólogos" }); return; }
  next();
}

function getIp(req: any): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}

async function getActorName(actorId: number | null | undefined): Promise<string | null> {
  if (!actorId) return null;
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, actorId)).limit(1);
  return u?.name ?? null;
}

const VALID_STATUSES = new Set(["pendiente", "en_progreso", "completada", "cancelada"]);

router.use(loadUserRole);

// ─── CATALOG ───────────────────────────────────────────────────────────────

// GET /api/tareas/catalog — list all task definitions (admin & psicólogo)
router.get("/catalog", requireAdminOrPsi, async (_req, res) => {
  const rows = await db.select().from(therapeuticTasksTable).orderBy(therapeuticTasksTable.name);
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// POST /api/tareas/catalog — admin: create a task definition
router.post("/catalog", requireAdmin, async (req: any, res) => {
  const { key, name, description, icon, color, badgeColor, routePath, isActive, isAvailable, targetRole } = req.body ?? {};
  const k = typeof key === "string" ? key.trim().toLowerCase() : "";
  const n = typeof name === "string" ? name.trim() : "";
  if (!k || !/^[a-z0-9-]+$/.test(k)) { res.status(400).json({ error: "key inválida (a-z, 0-9, '-')" }); return; }
  if (!n) { res.status(400).json({ error: "name requerido" }); return; }
  try {
    const [row] = await db.insert(therapeuticTasksTable).values({
      key: k,
      name: n,
      description: typeof description === "string" ? description : "",
      icon: typeof icon === "string" && icon ? icon : "ClipboardList",
      color: typeof color === "string" && color ? color : "from-teal-500 to-teal-600",
      badgeColor: typeof badgeColor === "string" && badgeColor ? badgeColor : "bg-teal-100 text-teal-700",
      routePath: typeof routePath === "string" ? routePath : null,
      targetRole: targetRole === "psicologo" ? "psicologo" : "paciente",
      isActive: isActive !== false,
      isAvailable: isAvailable !== false,
    }).returning();
    await logAudit({
      actorId: req.session.userId, actorName: await getActorName(req.session.userId),
      action: "CREATE_THERAPEUTIC_TASK", targetTable: "therapeutic_tasks", targetId: row.id,
      ipAddress: getIp(req), details: { key: row.key, name: row.name },
    });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("unique") || err?.code === "23505") {
      res.status(409).json({ error: "Ya existe una tarea con ese key" }); return;
    }
    res.status(400).json({ error: err?.message ?? "Error al crear tarea" });
  }
});

// PATCH /api/tareas/catalog/:id — admin: update task definition
router.patch("/catalog/:id", requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (typeof b.description === "string") patch.description = b.description;
  if (typeof b.icon === "string" && b.icon) patch.icon = b.icon;
  if (typeof b.color === "string" && b.color) patch.color = b.color;
  if (typeof b.badgeColor === "string" && b.badgeColor) patch.badgeColor = b.badgeColor;
  if (b.routePath === null || typeof b.routePath === "string") patch.routePath = b.routePath;
  if (b.targetRole === "paciente" || b.targetRole === "psicologo") patch.targetRole = b.targetRole;
  if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
  if (typeof b.isAvailable === "boolean") patch.isAvailable = b.isAvailable;
  const [row] = await db.update(therapeuticTasksTable).set(patch as any)
    .where(eq(therapeuticTasksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "UPDATE_THERAPEUTIC_TASK", targetTable: "therapeutic_tasks", targetId: id,
    ipAddress: getIp(req), details: { changes: Object.keys(patch).filter(k => k !== "updatedAt") },
  });
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

// ─── LOOKUPS (pacientes / psicólogos para selects) ────────────────────────

router.get("/lookup/pacientes", requireAdminOrPsi, async (_req, res) => {
  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
  }).from(usersTable).where(eq(usersTable.role, "user")).orderBy(usersTable.name);
  res.json(rows);
});

router.get("/lookup/psicologos", requireAdminOrPsi, async (_req, res) => {
  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
  }).from(usersTable).where(eq(usersTable.role, "psicologo")).orderBy(usersTable.name);
  res.json(rows);
});

// ─── ASSIGNMENTS (admin & psicólogo) ──────────────────────────────────────

// GET /api/tareas/assignments — list with optional filters
router.get("/assignments", requireAdminOrPsi, async (req: any, res) => {
  const { pacienteId, psicologoId, taskId, status, from, to } = req.query;
  const where: any[] = [];
  if (pacienteId) {
    const v = parseInt(pacienteId as string); if (Number.isInteger(v)) where.push(eq(taskAssignmentsTable.pacienteId, v));
  }
  if (psicologoId) {
    const v = parseInt(psicologoId as string); if (Number.isInteger(v)) where.push(eq(taskAssignmentsTable.psicologoId, v));
  }
  if (taskId) {
    const v = parseInt(taskId as string); if (Number.isInteger(v)) where.push(eq(taskAssignmentsTable.taskId, v));
  }
  if (status && VALID_STATUSES.has(status as string)) {
    where.push(eq(taskAssignmentsTable.status, status as string));
  }
  if (from) {
    const d = new Date(from as string); if (!isNaN(d.getTime())) where.push(gte(taskAssignmentsTable.assignedAt, d));
  }
  if (to) {
    const d = new Date(to as string); if (!isNaN(d.getTime())) where.push(lte(taskAssignmentsTable.assignedAt, d));
  }

  // If the caller is a psicólogo, restrict to assignments where they are the supervising psicólogo
  // OR that they themselves created. Admin sees everything.
  if (req.session.userRole === "psicologo") {
    where.push(
      sql`(${taskAssignmentsTable.psicologoId} = ${req.session.userId}
           OR ${taskAssignmentsTable.assignedById} = ${req.session.userId})`,
    );
  }

  const rows = await db.select({
    id: taskAssignmentsTable.id,
    taskId: taskAssignmentsTable.taskId,
    taskKey: therapeuticTasksTable.key,
    taskName: therapeuticTasksTable.name,
    taskIcon: therapeuticTasksTable.icon,
    taskColor: therapeuticTasksTable.color,
    targetRole: therapeuticTasksTable.targetRole,
    pacienteId: taskAssignmentsTable.pacienteId,
    pacienteName: usersTable.name,
    pacienteEmail: usersTable.email,
    psicologoId: taskAssignmentsTable.psicologoId,
    assignedById: taskAssignmentsTable.assignedById,
    status: taskAssignmentsTable.status,
    dueDate: taskAssignmentsTable.dueDate,
    assignedAt: taskAssignmentsTable.assignedAt,
    startedAt: taskAssignmentsTable.startedAt,
    completedAt: taskAssignmentsTable.completedAt,
    notes: taskAssignmentsTable.notes,
  })
    .from(taskAssignmentsTable)
    .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
    .innerJoin(usersTable, eq(usersTable.id, taskAssignmentsTable.pacienteId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(taskAssignmentsTable.assignedAt));

  // Side-resolve psicólogo + assignedBy names (avoids alias join)
  const ids = new Set<number>();
  for (const r of rows) { if (r.psicologoId) ids.add(r.psicologoId); if (r.assignedById) ids.add(r.assignedById); }
  const nameMap = new Map<number, string>();
  if (ids.size) {
    const us = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(inArray(usersTable.id, Array.from(ids)));
    for (const u of us) nameMap.set(u.id, u.name);
  }

  res.json(rows.map(r => ({
    ...r,
    psicologoName: r.psicologoId ? nameMap.get(r.psicologoId) ?? null : null,
    assignedByName: r.assignedById ? nameMap.get(r.assignedById) ?? null : null,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    assignedAt: r.assignedAt.toISOString(),
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  })));
});

// POST /api/tareas/assignments — admin or psicólogo creates assignment
router.post("/assignments", requireAdminOrPsi, async (req: any, res) => {
  const { taskId, pacienteId, psicologoId, dueDate, notes, status } = req.body ?? {};
  const tid = Number(taskId);
  const pid = Number(pacienteId);
  if (!Number.isInteger(tid)) { res.status(400).json({ error: "taskId requerido" }); return; }
  if (!Number.isInteger(pid)) { res.status(400).json({ error: "pacienteId requerido" }); return; }

  const [task] = await db.select().from(therapeuticTasksTable).where(eq(therapeuticTasksTable.id, tid)).limit(1);
  if (!task) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
  if (!task.isActive) { res.status(400).json({ error: "La tarea no está activa" }); return; }

  // The assignee must match the task's target_role.
  // (We reuse the paciente_id column as the generic assignee_id for backwards-compat.)
  const expectedRole = task.targetRole === "psicologo" ? "psicologo" : "user";
  const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, pid)).limit(1);
  if (!assignee || assignee.role !== expectedRole) {
    res.status(400).json({
      error: task.targetRole === "psicologo"
        ? "Esta tarea es para psicólogos: el asignado debe ser un psicólogo."
        : "Esta tarea es para pacientes: el asignado debe ser un paciente.",
    });
    return;
  }

  let psiId: number | null = null;
  if (psicologoId !== undefined && psicologoId !== null && psicologoId !== "") {
    const v = Number(psicologoId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "psicologoId inválido" }); return; }
    const [p] = await db.select().from(usersTable).where(eq(usersTable.id, v)).limit(1);
    if (!p || p.role !== "psicologo") { res.status(400).json({ error: "Psicólogo inválido" }); return; }
    psiId = v;
  }
  // If creator is a psicólogo and didn't specify, default to themselves
  if (psiId === null && req.session.userRole === "psicologo") {
    psiId = req.session.userId;
  }

  let due: Date | null = null;
  if (dueDate) {
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "dueDate inválida" }); return; }
    due = d;
  }

  const statusFinal = (typeof status === "string" && VALID_STATUSES.has(status)) ? status : "pendiente";

  try {
    const [row] = await db.insert(taskAssignmentsTable).values({
      taskId: tid,
      pacienteId: pid,
      assignedById: req.session.userId,
      psicologoId: psiId,
      dueDate: due,
      notes: typeof notes === "string" ? notes : null,
      status: statusFinal,
    }).returning();

    await logAudit({
      actorId: req.session.userId, actorName: await getActorName(req.session.userId),
      action: "CREATE_TASK_ASSIGNMENT", targetTable: "task_assignments", targetId: row.id,
      ipAddress: getIp(req),
      details: { taskId: tid, taskKey: task.key, pacienteId: pid, psicologoId: psiId },
    });

    res.status(201).json({
      ...row,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      assignedAt: row.assignedAt.toISOString(),
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Error al crear asignación" });
  }
});

// PATCH /api/tareas/assignments/:id — admin or psicólogo updates
router.patch("/assignments/:id", requireAdminOrPsi, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }

  const [existing] = await db.select().from(taskAssignmentsTable).where(eq(taskAssignmentsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Asignación no encontrada" }); return; }

  // Psicólogo can only edit assignments where they are involved
  if (req.session.userRole === "psicologo"
      && existing.psicologoId !== req.session.userId
      && existing.assignedById !== req.session.userId) {
    res.status(403).json({ error: "No autorizado" }); return;
  }

  const b = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.status === "string") {
    if (!VALID_STATUSES.has(b.status)) { res.status(400).json({ error: "status inválido" }); return; }
    patch.status = b.status;
    if (b.status === "completada" && !existing.completedAt) patch.completedAt = new Date();
    if (b.status === "en_progreso" && !existing.startedAt) patch.startedAt = new Date();
  }
  if (b.dueDate === null) patch.dueDate = null;
  else if (typeof b.dueDate === "string") {
    const d = new Date(b.dueDate);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "dueDate inválida" }); return; }
    patch.dueDate = d;
  }
  if (b.notes === null || typeof b.notes === "string") patch.notes = b.notes;
  if (b.psicologoId === null) patch.psicologoId = null;
  else if (b.psicologoId !== undefined) {
    const v = Number(b.psicologoId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "psicologoId inválido" }); return; }
    const [p] = await db.select().from(usersTable).where(eq(usersTable.id, v)).limit(1);
    if (!p || p.role !== "psicologo") { res.status(400).json({ error: "Psicólogo inválido" }); return; }
    patch.psicologoId = v;
  }

  const [row] = await db.update(taskAssignmentsTable).set(patch as any)
    .where(eq(taskAssignmentsTable.id, id)).returning();

  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "UPDATE_TASK_ASSIGNMENT", targetTable: "task_assignments", targetId: id,
    ipAddress: getIp(req),
    details: { changes: Object.keys(patch).filter(k => k !== "updatedAt") },
  });

  res.json({
    ...row,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    assignedAt: row.assignedAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// DELETE /api/tareas/assignments/:id — admin only
router.delete("/assignments/:id", requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const result = await db.delete(taskAssignmentsTable).where(eq(taskAssignmentsTable.id, id)).returning();
  if (!result.length) { res.status(404).json({ error: "No encontrado" }); return; }
  await logAudit({
    actorId: req.session.userId, actorName: await getActorName(req.session.userId),
    action: "DELETE_TASK_ASSIGNMENT", targetTable: "task_assignments", targetId: id,
    ipAddress: getIp(req), details: { pacienteId: result[0].pacienteId, taskId: result[0].taskId },
  });
  res.json({ ok: true });
});

// ─── PSICÓLOGO-FACING (own assignments) ───────────────────────────────────

// GET /api/tareas/mine-psi — psicólogo sees assignments where they are the assignee
router.get("/mine-psi", requirePsicologo, async (req: any, res) => {
  const rows = await db.select({
    id: taskAssignmentsTable.id,
    taskId: taskAssignmentsTable.taskId,
    taskKey: therapeuticTasksTable.key,
    taskName: therapeuticTasksTable.name,
    taskDescription: therapeuticTasksTable.description,
    taskIcon: therapeuticTasksTable.icon,
    taskColor: therapeuticTasksTable.color,
    taskBadgeColor: therapeuticTasksTable.badgeColor,
    taskRoutePath: therapeuticTasksTable.routePath,
    taskIsAvailable: therapeuticTasksTable.isAvailable,
    status: taskAssignmentsTable.status,
    dueDate: taskAssignmentsTable.dueDate,
    assignedAt: taskAssignmentsTable.assignedAt,
    startedAt: taskAssignmentsTable.startedAt,
    completedAt: taskAssignmentsTable.completedAt,
    notes: taskAssignmentsTable.notes,
  })
    .from(taskAssignmentsTable)
    .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
    .where(and(
      eq(taskAssignmentsTable.pacienteId, req.session.userId),
      eq(therapeuticTasksTable.targetRole, "psicologo"),
      eq(therapeuticTasksTable.isActive, true),
    ))
    .orderBy(desc(taskAssignmentsTable.assignedAt));

  res.json(rows.map(r => ({
    ...r,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    assignedAt: r.assignedAt.toISOString(),
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  })));
});

// POST /api/tareas/mine-psi/:id/start — psicólogo marks own assignment as started
router.post("/mine-psi/:id/start", requirePsicologo, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [row] = await db.update(taskAssignmentsTable).set({
    status: "en_progreso",
    startedAt: sql`COALESCE(${taskAssignmentsTable.startedAt}, NOW())`,
    updatedAt: new Date(),
  }).where(and(
    eq(taskAssignmentsTable.id, id),
    eq(taskAssignmentsTable.pacienteId, req.session.userId),
    eq(taskAssignmentsTable.status, "pendiente"),
  )).returning();
  if (!row) {
    const [exists] = await db.select({ id: taskAssignmentsTable.id })
      .from(taskAssignmentsTable)
      .where(and(
        eq(taskAssignmentsTable.id, id),
        eq(taskAssignmentsTable.pacienteId, req.session.userId),
      )).limit(1);
    if (!exists) { res.status(404).json({ error: "No encontrado" }); return; }
    res.json({ ok: true, noop: true });
    return;
  }
  res.json({ ok: true });
});

// POST /api/tareas/mine-psi/:id/complete — psicólogo marks own assignment as completed
router.post("/mine-psi/:id/complete", requirePsicologo, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [row] = await db.update(taskAssignmentsTable).set({
    status: "completada",
    completedAt: new Date(),
    startedAt: sql`COALESCE(${taskAssignmentsTable.startedAt}, NOW())`,
    updatedAt: new Date(),
  }).where(and(
    eq(taskAssignmentsTable.id, id),
    eq(taskAssignmentsTable.pacienteId, req.session.userId),
    sql`${taskAssignmentsTable.status} IN ('pendiente','en_progreso')`,
  )).returning();
  if (!row) {
    const [exists] = await db.select({ id: taskAssignmentsTable.id, status: taskAssignmentsTable.status })
      .from(taskAssignmentsTable)
      .where(and(
        eq(taskAssignmentsTable.id, id),
        eq(taskAssignmentsTable.pacienteId, req.session.userId),
      )).limit(1);
    if (!exists) { res.status(404).json({ error: "No encontrado" }); return; }
    if (exists.status === "completada") { res.json({ ok: true, noop: true }); return; }
    res.status(409).json({ error: "La tarea está cancelada" });
    return;
  }
  res.json({ ok: true });
});

// ─── PATIENT-FACING ───────────────────────────────────────────────────────

// GET /api/tareas/mine — paciente sees their assignments (joined w/ catalog)
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select({
    id: taskAssignmentsTable.id,
    taskId: taskAssignmentsTable.taskId,
    taskKey: therapeuticTasksTable.key,
    taskName: therapeuticTasksTable.name,
    taskDescription: therapeuticTasksTable.description,
    taskIcon: therapeuticTasksTable.icon,
    taskColor: therapeuticTasksTable.color,
    taskBadgeColor: therapeuticTasksTable.badgeColor,
    taskRoutePath: therapeuticTasksTable.routePath,
    taskIsAvailable: therapeuticTasksTable.isAvailable,
    status: taskAssignmentsTable.status,
    dueDate: taskAssignmentsTable.dueDate,
    assignedAt: taskAssignmentsTable.assignedAt,
    startedAt: taskAssignmentsTable.startedAt,
    completedAt: taskAssignmentsTable.completedAt,
    notes: taskAssignmentsTable.notes,
  })
    .from(taskAssignmentsTable)
    .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
    .where(and(
      eq(taskAssignmentsTable.pacienteId, req.session.userId),
      eq(therapeuticTasksTable.isActive, true),
      eq(therapeuticTasksTable.targetRole, "paciente"),
    ))
    .orderBy(desc(taskAssignmentsTable.assignedAt));

  res.json(rows.map(r => ({
    ...r,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    assignedAt: r.assignedAt.toISOString(),
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  })));
});

// POST /api/tareas/mine/:id/start — paciente marks the assignment as started
// Only transitions from 'pendiente' to 'en_progreso'; other states are no-ops
// (idempotent — safe under repeated/concurrent calls).
router.post("/mine/:id/start", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [row] = await db.update(taskAssignmentsTable).set({
    status: "en_progreso",
    startedAt: sql`COALESCE(${taskAssignmentsTable.startedAt}, NOW())`,
    updatedAt: new Date(),
  }).where(and(
    eq(taskAssignmentsTable.id, id),
    eq(taskAssignmentsTable.pacienteId, req.session.userId),
    eq(taskAssignmentsTable.status, "pendiente"),
  )).returning();
  if (!row) {
    // Either not owned by this paciente, doesn't exist, or already past 'pendiente'.
    // Verify ownership to return a precise status code.
    const [exists] = await db.select({ id: taskAssignmentsTable.id })
      .from(taskAssignmentsTable)
      .where(and(
        eq(taskAssignmentsTable.id, id),
        eq(taskAssignmentsTable.pacienteId, req.session.userId),
      )).limit(1);
    if (!exists) { res.status(404).json({ error: "No encontrado" }); return; }
    // Already started/completed/cancelled — treat as success (idempotent).
    res.json({ ok: true, noop: true });
    return;
  }
  res.json({ ok: true });
});

// POST /api/tareas/mine/:id/complete — paciente marks as completed
// Guards against re-completing or completing cancelled assignments.
router.post("/mine/:id/complete", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const [row] = await db.update(taskAssignmentsTable).set({
    status: "completada",
    completedAt: new Date(),
    startedAt: sql`COALESCE(${taskAssignmentsTable.startedAt}, NOW())`,
    updatedAt: new Date(),
  }).where(and(
    eq(taskAssignmentsTable.id, id),
    eq(taskAssignmentsTable.pacienteId, req.session.userId),
    sql`${taskAssignmentsTable.status} IN ('pendiente','en_progreso')`,
  )).returning();
  if (!row) {
    const [exists] = await db.select({ id: taskAssignmentsTable.id, status: taskAssignmentsTable.status })
      .from(taskAssignmentsTable)
      .where(and(
        eq(taskAssignmentsTable.id, id),
        eq(taskAssignmentsTable.pacienteId, req.session.userId),
      )).limit(1);
    if (!exists) { res.status(404).json({ error: "No encontrado" }); return; }
    if (exists.status === "completada") { res.json({ ok: true, noop: true }); return; }
    res.status(409).json({ error: "La tarea está cancelada" });
    return;
  }
  res.json({ ok: true });
});

// ─── REPORTS ──────────────────────────────────────────────────────────────

// Helper: parse from/to range or fall back to "all time"
function parseRange(req: any) {
  const where: any[] = [];
  const { from, to } = req.query;
  if (from) {
    const d = new Date(from as string);
    if (!isNaN(d.getTime())) where.push(gte(taskAssignmentsTable.assignedAt, d));
  }
  if (to) {
    const d = new Date(to as string);
    if (!isNaN(d.getTime())) where.push(lte(taskAssignmentsTable.assignedAt, d));
  }
  return where;
}

// GET /api/tareas/reports/by-paciente — aggregated per patient (admin)
router.get("/reports/by-paciente", requireAdmin, async (req: any, res) => {
  const where = parseRange(req);
  const rows = await db.select({
    pacienteId: taskAssignmentsTable.pacienteId,
    pacienteName: usersTable.name,
    pacienteEmail: usersTable.email,
    total: sql<number>`COUNT(*)::int`,
    pendientes: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'pendiente' THEN 1 ELSE 0 END)::int`,
    enProgreso: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'en_progreso' THEN 1 ELSE 0 END)::int`,
    completadas: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'completada' THEN 1 ELSE 0 END)::int`,
    canceladas: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'cancelada' THEN 1 ELSE 0 END)::int`,
  })
    .from(taskAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, taskAssignmentsTable.pacienteId))
    .where(where.length ? and(...where) : undefined)
    .groupBy(taskAssignmentsTable.pacienteId, usersTable.name, usersTable.email)
    .orderBy(desc(sql`COUNT(*)`));
  res.json(rows.map(r => ({
    ...r,
    completitudPct: r.total ? Math.round((r.completadas / r.total) * 100) : 0,
  })));
});

// GET /api/tareas/reports/by-psicologo — aggregated per psicólogo (admin)
router.get("/reports/by-psicologo", requireAdmin, async (req: any, res) => {
  const where = [...parseRange(req), sql`${taskAssignmentsTable.psicologoId} IS NOT NULL`];
  const rows = await db.select({
    psicologoId: taskAssignmentsTable.psicologoId,
    psicologoName: usersTable.name,
    total: sql<number>`COUNT(*)::int`,
    pendientes: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'pendiente' THEN 1 ELSE 0 END)::int`,
    enProgreso: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'en_progreso' THEN 1 ELSE 0 END)::int`,
    completadas: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'completada' THEN 1 ELSE 0 END)::int`,
    canceladas: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'cancelada' THEN 1 ELSE 0 END)::int`,
  })
    .from(taskAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, taskAssignmentsTable.psicologoId))
    .where(and(...where))
    .groupBy(taskAssignmentsTable.psicologoId, usersTable.name)
    .orderBy(desc(sql`COUNT(*)`));
  res.json(rows.map(r => ({
    ...r,
    completitudPct: r.total ? Math.round((r.completadas / r.total) * 100) : 0,
  })));
});

// GET /api/tareas/reports/centro — center-wide totals (admin)
router.get("/reports/centro", requireAdmin, async (req: any, res) => {
  const where = parseRange(req);
  const [totals] = await db.select({
    total: sql<number>`COUNT(*)::int`,
    pendientes: sql<number>`COALESCE(SUM(CASE WHEN ${taskAssignmentsTable.status} = 'pendiente' THEN 1 ELSE 0 END), 0)::int`,
    enProgreso: sql<number>`COALESCE(SUM(CASE WHEN ${taskAssignmentsTable.status} = 'en_progreso' THEN 1 ELSE 0 END), 0)::int`,
    completadas: sql<number>`COALESCE(SUM(CASE WHEN ${taskAssignmentsTable.status} = 'completada' THEN 1 ELSE 0 END), 0)::int`,
    canceladas: sql<number>`COALESCE(SUM(CASE WHEN ${taskAssignmentsTable.status} = 'cancelada' THEN 1 ELSE 0 END), 0)::int`,
    pacientesActivos: sql<number>`COUNT(DISTINCT ${taskAssignmentsTable.pacienteId})::int`,
    psicologosActivos: sql<number>`COUNT(DISTINCT ${taskAssignmentsTable.psicologoId})::int`,
  }).from(taskAssignmentsTable).where(where.length ? and(...where) : undefined);

  // Breakdown by task
  const byTask = await db.select({
    taskId: taskAssignmentsTable.taskId,
    taskKey: therapeuticTasksTable.key,
    taskName: therapeuticTasksTable.name,
    total: sql<number>`COUNT(*)::int`,
    completadas: sql<number>`SUM(CASE WHEN ${taskAssignmentsTable.status} = 'completada' THEN 1 ELSE 0 END)::int`,
  })
    .from(taskAssignmentsTable)
    .innerJoin(therapeuticTasksTable, eq(therapeuticTasksTable.id, taskAssignmentsTable.taskId))
    .where(where.length ? and(...where) : undefined)
    .groupBy(taskAssignmentsTable.taskId, therapeuticTasksTable.key, therapeuticTasksTable.name)
    .orderBy(desc(sql`COUNT(*)`));

  res.json({
    totals: {
      ...totals,
      completitudPct: totals.total ? Math.round((totals.completadas / totals.total) * 100) : 0,
    },
    byTask: byTask.map(t => ({
      ...t,
      completitudPct: t.total ? Math.round((t.completadas / t.total) * 100) : 0,
    })),
  });
});

export default router;
// requireAuth is exported in case future endpoints need it
export { requireAuth };
