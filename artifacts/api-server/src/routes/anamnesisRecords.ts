import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  anamnesisRecordsTable,
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

// GET /api/anamnesis/mine — paciente lists own records
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select().from(anamnesisRecordsTable)
    .where(eq(anamnesisRecordsTable.pacienteId, req.session.userId))
    .orderBy(desc(anamnesisRecordsTable.createdAt));
  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// POST /api/anamnesis/mine — paciente saves a new anamnesis (and optionally
// completes the linked assignment).
router.post("/mine", requirePaciente, async (req: any, res) => {
  const b = req.body ?? {};
  const data = (b.data && typeof b.data === "object") ? b.data : {};
  const pickStr = (v: unknown) => (typeof v === "string" ? v : null);

  let assignmentId: number | null = null;
  if (b.assignmentId !== undefined && b.assignmentId !== null) {
    const v = Number(b.assignmentId);
    if (!Number.isInteger(v)) { res.status(400).json({ error: "assignmentId inválido" }); return; }
    // Validate ownership.
    const [a] = await db.select().from(taskAssignmentsTable)
      .where(and(eq(taskAssignmentsTable.id, v), eq(taskAssignmentsTable.pacienteId, req.session.userId)))
      .limit(1);
    if (!a) { res.status(403).json({ error: "Asignación no es del paciente" }); return; }
    assignmentId = v;
  }

  const [row] = await db.insert(anamnesisRecordsTable).values({
    pacienteId: req.session.userId,
    assignmentId,
    nombreNino: pickStr(b.nombreNino) ?? "",
    edad: pickStr(b.edad),
    sexo: pickStr(b.sexo),
    motivoConsulta: pickStr(b.motivoConsulta),
    entrevistador: pickStr(b.entrevistador),
    data,
  }).returning();

  // If linked to an assignment, mark it as completed (idempotent).
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
    action: "CREATE_ANAMNESIS",
    targetTable: "anamnesis_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { assignmentId, nombreNino: row.nombreNino },
  });

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

// GET /api/anamnesis — admin/psicologo list (optional ?pacienteId)
router.get("/", requireAdminOrPsi, async (req, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  const filters: any[] = [];
  if (pacienteId !== null && Number.isInteger(pacienteId)) {
    filters.push(eq(anamnesisRecordsTable.pacienteId, pacienteId));
  }
  const rows = await db.select().from(anamnesisRecordsTable)
    .where(filters.length ? and(...filters) : undefined as any)
    .orderBy(desc(anamnesisRecordsTable.createdAt));

  // Hydrate paciente names
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

// GET /api/anamnesis/:id — admin/psi/owner can read
router.get("/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(anamnesisRecordsTable)
    .where(eq(anamnesisRecordsTable.id, id)).limit(1);
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

// suppress unused-import warning for therapeuticTasksTable (kept for future joins)
void therapeuticTasksTable;

export default router;
