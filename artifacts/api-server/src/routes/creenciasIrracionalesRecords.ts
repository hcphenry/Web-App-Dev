import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  creenciasIrracionalesRecordsTable,
  taskAssignmentsTable,
  therapeuticTasksTable,
} from "@workspace/db";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { registerPsiRecordRoutes, pStr, pData, pArr } from "../lib/psiRecords";

const router: IRouter = Router();

// ── Catálogo de 11 creencias irracionales (Ellis · adaptado del PDF) ─────────
const CREENCIA_KEYS = [
  "ser-amado-aceptado",
  "valioso-competente",
  "castigo-inmorales",
  "catastrofico-no-querer",
  "desgracia-externa",
  "preocupacion-constante",
  "rehuir-dificultades",
  "depender-fuerte",
  "pasado-determina",
  "preocuparme-problemas-otros",
  "solucion-perfecta",
] as const;
type CreenciaKey = typeof CREENCIA_KEYS[number];
const CREENCIA_KEY_SET = new Set<string>(CREENCIA_KEYS);

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 horas

interface ItemValue { key: CreenciaKey; value: number }

function sanitizeItems(input: unknown): ItemValue[] | { error: string } {
  if (!Array.isArray(input)) return { error: "items debe ser un arreglo" };
  const seen = new Set<string>();
  const out: ItemValue[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const k = (raw as any).key;
    const v = (raw as any).value;
    if (typeof k !== "string" || !CREENCIA_KEY_SET.has(k)) {
      return { error: `Clave de ítem desconocida: ${String(k)}` };
    }
    if (seen.has(k)) continue;
    seen.add(k);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: `Valor inválido para ${k}; debe estar entre 0 y 100` };
    }
    out.push({ key: k as CreenciaKey, value: Math.round(n) });
  }
  if (out.length === 0) return { error: "Debes responder al menos un ítem" };
  return out;
}

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

registerPsiRecordRoutes(router, {
  table: creenciasIrracionalesRecordsTable,
  auditName: "CREENCIAS_IRRACIONALES",
  targetTable: "creencias_irracionales_records",
  taskKeys: ["creencias-irracionales"],
  mapBody: (b) => ({ items: pArr(b.items) as any, notas: typeof b.notas === "string" ? b.notas.slice(0, 4000) : null }),
});

// GET /api/creencias-irracionales/mine — paciente lista sus propios registros
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select().from(creenciasIrracionalesRecordsTable)
    .where(and(eq(creenciasIrracionalesRecordsTable.pacienteId, req.session.userId), isNull(creenciasIrracionalesRecordsTable.psicologoId)))
    .orderBy(desc(creenciasIrracionalesRecordsTable.createdAt));
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    canEdit: Date.now() - r.createdAt.getTime() < EDIT_WINDOW_MS,
  })));
});

// POST /api/creencias-irracionales/mine — paciente crea un nuevo registro (repetible)
router.post("/mine", requirePaciente, async (req: any, res) => {
  const b = req.body ?? {};
  const items = sanitizeItems(b.items);
  if (!Array.isArray(items)) { res.status(400).json({ error: items.error }); return; }

  let assignmentId: number | null = null;
  if (b.assignmentId !== undefined && b.assignmentId !== null) {
    const v = Number(b.assignmentId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "assignmentId inválido" }); return; }
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
    if (row.key !== "creencias-irracionales") {
      res.status(400).json({ error: "La asignación no corresponde a esta tarea" });
      return;
    }
    assignmentId = v;
  }

  const notas = typeof b.notas === "string" ? b.notas.slice(0, 4000) : null;

  const [row] = await db.insert(creenciasIrracionalesRecordsTable).values({
    pacienteId: req.session.userId,
    assignmentId,
    items: items as any,
    notas,
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
    action: "CREATE_CREENCIAS_IRRACIONALES",
    targetTable: "creencias_irracionales_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { assignmentId, items: items.length },
  });

  res.status(201).json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: true,
  });
});

// PATCH /api/creencias-irracionales/:id — paciente dueño edita (sólo dentro de 48h)
router.patch("/:id", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(creenciasIrracionalesRecordsTable)
    .where(eq(creenciasIrracionalesRecordsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "No encontrado" }); return; }
  if (existing.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Solo puedes modificar tus propios registros" }); return;
  }
  if (Date.now() - existing.createdAt.getTime() >= EDIT_WINDOW_MS) {
    res.status(403).json({ error: "Han pasado más de 48 horas; el registro ya no puede modificarse." });
    return;
  }

  const b = req.body ?? {};
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (b.items !== undefined) {
    const items = sanitizeItems(b.items);
    if (!Array.isArray(items)) { res.status(400).json({ error: items.error }); return; }
    update.items = items as any;
  }
  if (b.notas !== undefined) {
    update.notas = typeof b.notas === "string" ? b.notas.slice(0, 4000) : null;
  }

  const [row] = await db.update(creenciasIrracionalesRecordsTable)
    .set(update as any)
    .where(eq(creenciasIrracionalesRecordsTable.id, id))
    .returning();

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "UPDATE_CREENCIAS_IRRACIONALES",
    targetTable: "creencias_irracionales_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { items: Array.isArray(update.items) ? (update.items as unknown[]).length : undefined },
  });

  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: Date.now() - row.createdAt.getTime() < EDIT_WINDOW_MS,
  });
});

// DELETE /api/creencias-irracionales/:id — paciente dueño borra (sólo dentro de 48h)
router.delete("/:id", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(creenciasIrracionalesRecordsTable)
    .where(eq(creenciasIrracionalesRecordsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "No encontrado" }); return; }
  if (existing.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Solo puedes eliminar tus propios registros" }); return;
  }
  if (Date.now() - existing.createdAt.getTime() >= EDIT_WINDOW_MS) {
    res.status(403).json({ error: "Han pasado más de 48 horas; el registro ya no puede eliminarse." });
    return;
  }

  await db.delete(creenciasIrracionalesRecordsTable).where(eq(creenciasIrracionalesRecordsTable.id, id));

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "DELETE_CREENCIAS_IRRACIONALES",
    targetTable: "creencias_irracionales_records",
    targetId: id,
    ipAddress: getIp(req),
    details: null,
  });

  res.json({ ok: true });
});

// GET /api/creencias-irracionales — admin/psicólogo (psi sólo ve a sus pacientes asignados)
router.get("/", requireAdminOrPsi, async (req: any, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  const filters: any[] = [];
  if (pacienteId !== null && Number.isInteger(pacienteId)) {
    filters.push(eq(creenciasIrracionalesRecordsTable.pacienteId, pacienteId));
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
      .where(eq(therapeuticTasksTable.key, "creencias-irracionales"));
    const allowedIds = Array.from(new Set(
      rows.filter(r => r.psi === psiId || r.ab === psiId).map(r => r.pid)
    ));
    if (allowedIds.length === 0) { res.json([]); return; }
    filters.push(inArray(creenciasIrracionalesRecordsTable.pacienteId, allowedIds));
  }

  const rows = await db.select().from(creenciasIrracionalesRecordsTable)
    .where(filters.length ? and(...filters) : undefined as any)
    .orderBy(desc(creenciasIrracionalesRecordsTable.createdAt));

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

// GET /api/creencias-irracionales/:id — admin/psi/owner pueden leer
router.get("/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(creenciasIrracionalesRecordsTable)
    .where(eq(creenciasIrracionalesRecordsTable.id, id)).limit(1);
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
        eq(therapeuticTasksTable.key, "creencias-irracionales"),
        eq(taskAssignmentsTable.pacienteId, row.pacienteId),
      ));
    const isSupervisor = rels.some(r => r.psi === req.session.userId || r.ab === req.session.userId);
    if (!isSupervisor) { res.status(403).json({ error: "Acceso denegado" }); return; }
  } else if (row.pacienteId !== req.session.userId || row.psicologoId !== null) {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

export default router;
