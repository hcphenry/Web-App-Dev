import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  ruedaVidaRecordsTable,
  taskAssignmentsTable,
  therapeuticTasksTable,
} from "@workspace/db";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { registerPsiRecordRoutes, pStr, pData, pArr } from "../lib/psiRecords";

const router: IRouter = Router();

// ── Catálogo de las 10 áreas de "La Rueda de la Vida" ───────────────────────
// Se valida en el servidor para que el cliente no pueda inyectar claves
// arbitrarias. Cada área puede traer un detalle (sub-ítems) opcional, pero la
// nota principal (0-10) por área es obligatoria.
const AREA_KEYS = [
  "salud-mental-bienestar",
  "salud-energia-fisica",
  "carrera-profesion",
  "finanzas",
  "relaciones-amigos",
  "familia",
  "amor-pareja",
  "ocio-diversion",
  "desarrollo-personal",
  "entorno-fisico",
] as const;
type AreaKey = typeof AREA_KEYS[number];
const AREA_KEY_SET = new Set<string>(AREA_KEYS);

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 horas

interface SubItem { label: string; score: number }
interface ItemValue { key: AreaKey; score: number; subitems?: SubItem[] }

function sanitizeItems(input: unknown): ItemValue[] | { error: string } {
  if (!Array.isArray(input)) return { error: "items debe ser un arreglo" };
  const seen = new Set<string>();
  const out: ItemValue[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const k = (raw as any).key;
    const s = Number((raw as any).score);
    if (typeof k !== "string" || !AREA_KEY_SET.has(k)) {
      return { error: `Clave de área desconocida: ${String(k)}` };
    }
    if (seen.has(k)) continue;
    seen.add(k);
    if (!Number.isFinite(s) || s < 0 || s > 10) {
      return { error: `Valor inválido para ${k}; debe estar entre 0 y 10` };
    }
    const item: ItemValue = { key: k as AreaKey, score: Math.round(s * 10) / 10 };
    const subRaw = (raw as any).subitems;
    if (Array.isArray(subRaw)) {
      const subs: SubItem[] = [];
      for (const sr of subRaw) {
        if (!sr || typeof sr !== "object") continue;
        const label = typeof (sr as any).label === "string" ? (sr as any).label.slice(0, 200) : "";
        const score = Number((sr as any).score);
        if (!label) continue;
        if (!Number.isFinite(score) || score < 0 || score > 10) {
          return { error: `Sub-ítem inválido en ${k}` };
        }
        subs.push({ label, score: Math.round(score * 10) / 10 });
        if (subs.length >= 20) break;
      }
      if (subs.length > 0) item.subitems = subs;
    }
    out.push(item);
  }
  if (out.length === 0) return { error: "Debes calificar al menos un área" };
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
  table: ruedaVidaRecordsTable,
  auditName: "RUEDA_VIDA",
  targetTable: "rueda_vida_records",
  taskKeys: ["rueda-vida"],
  mapBody: (b) => ({ items: pArr(b.items) as any, accionSemillaArea: pStr(b.accionSemillaArea), accionSemilla: pStr(b.accionSemilla), accionSemillaFecha: pStr(b.accionSemillaFecha), notas: typeof b.notas === "string" ? b.notas.slice(0, 4000) : null }),
});

function pickAccionSemilla(b: any): { area: string | null; texto: string | null; fecha: string | null } {
  const area = typeof b.accionSemillaArea === "string" && AREA_KEY_SET.has(b.accionSemillaArea)
    ? b.accionSemillaArea : null;
  const texto = typeof b.accionSemilla === "string" ? b.accionSemilla.slice(0, 2000) : null;
  let fecha: string | null = null;
  if (typeof b.accionSemillaFecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.accionSemillaFecha)) {
    fecha = b.accionSemillaFecha;
  }
  return { area, texto, fecha };
}

// GET /api/rueda-vida/mine — paciente lista sus propios registros
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select().from(ruedaVidaRecordsTable)
    .where(and(eq(ruedaVidaRecordsTable.pacienteId, req.session.userId), isNull(ruedaVidaRecordsTable.psicologoId)))
    .orderBy(desc(ruedaVidaRecordsTable.createdAt));
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    canEdit: Date.now() - r.createdAt.getTime() < EDIT_WINDOW_MS,
  })));
});

// POST /api/rueda-vida/mine — paciente crea un nuevo registro (repetible)
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
    if (row.key !== "rueda-vida") {
      res.status(400).json({ error: "La asignación no corresponde a esta tarea" });
      return;
    }
    assignmentId = v;
  }

  const { area, texto, fecha } = pickAccionSemilla(b);
  const notas = typeof b.notas === "string" ? b.notas.slice(0, 4000) : null;

  const [row] = await db.insert(ruedaVidaRecordsTable).values({
    pacienteId: req.session.userId,
    assignmentId,
    items: items as any,
    accionSemillaArea: area,
    accionSemilla: texto,
    accionSemillaFecha: fecha,
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
    action: "CREATE_RUEDA_VIDA",
    targetTable: "rueda_vida_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { assignmentId, areas: items.length },
  });

  res.status(201).json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: true,
  });
});

// PATCH /api/rueda-vida/:id — paciente dueño edita (sólo dentro de 48h)
router.patch("/:id", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(ruedaVidaRecordsTable)
    .where(eq(ruedaVidaRecordsTable.id, id)).limit(1);
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
  if (b.accionSemilla !== undefined || b.accionSemillaArea !== undefined || b.accionSemillaFecha !== undefined) {
    const { area, texto, fecha } = pickAccionSemilla(b);
    update.accionSemillaArea = area;
    update.accionSemilla = texto;
    update.accionSemillaFecha = fecha;
  }
  if (b.notas !== undefined) {
    update.notas = typeof b.notas === "string" ? b.notas.slice(0, 4000) : null;
  }

  const [row] = await db.update(ruedaVidaRecordsTable)
    .set(update as any)
    .where(eq(ruedaVidaRecordsTable.id, id))
    .returning();

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "UPDATE_RUEDA_VIDA",
    targetTable: "rueda_vida_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { areas: Array.isArray(update.items) ? (update.items as unknown[]).length : undefined },
  });

  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: Date.now() - row.createdAt.getTime() < EDIT_WINDOW_MS,
  });
});

// DELETE /api/rueda-vida/:id — paciente dueño borra (sólo dentro de 48h)
router.delete("/:id", requirePaciente, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(ruedaVidaRecordsTable)
    .where(eq(ruedaVidaRecordsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "No encontrado" }); return; }
  if (existing.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Solo puedes eliminar tus propios registros" }); return;
  }
  if (Date.now() - existing.createdAt.getTime() >= EDIT_WINDOW_MS) {
    res.status(403).json({ error: "Han pasado más de 48 horas; el registro ya no puede eliminarse." });
    return;
  }

  await db.delete(ruedaVidaRecordsTable).where(eq(ruedaVidaRecordsTable.id, id));

  await logAudit({
    actorId: req.session.userId,
    actorName: null,
    action: "DELETE_RUEDA_VIDA",
    targetTable: "rueda_vida_records",
    targetId: id,
    ipAddress: getIp(req),
    details: null,
  });

  res.json({ ok: true });
});

// GET /api/rueda-vida — admin/psicólogo (psi sólo ve a sus pacientes asignados)
router.get("/", requireAdminOrPsi, async (req: any, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  const filters: any[] = [];
  if (pacienteId !== null && Number.isInteger(pacienteId)) {
    filters.push(eq(ruedaVidaRecordsTable.pacienteId, pacienteId));
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
      .where(eq(therapeuticTasksTable.key, "rueda-vida"));
    const allowedIds = Array.from(new Set(
      rows.filter(r => r.psi === psiId || r.ab === psiId).map(r => r.pid)
    ));
    if (allowedIds.length === 0) { res.json([]); return; }
    filters.push(inArray(ruedaVidaRecordsTable.pacienteId, allowedIds));
  }

  const rows = await db.select().from(ruedaVidaRecordsTable)
    .where(filters.length ? and(...filters) : undefined as any)
    .orderBy(desc(ruedaVidaRecordsTable.createdAt));

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

// GET /api/rueda-vida/:id — admin/psi/owner pueden leer
router.get("/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(ruedaVidaRecordsTable)
    .where(eq(ruedaVidaRecordsTable.id, id)).limit(1);
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
        eq(therapeuticTasksTable.key, "rueda-vida"),
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
