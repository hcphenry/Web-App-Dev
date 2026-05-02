import { Router, type IRouter } from "express";
import { db, recordsTable, usersTable, patientProfilesTable } from "@workspace/db";
import { eq, desc, and, ilike } from "drizzle-orm";
import { CreateRecordBody, ListAllRecordsQueryParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (req.session.userRole !== "admin") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }
  next();
}

function requirePsicologo(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (req.session.userRole !== "psicologo" && req.session.userRole !== "admin") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }
  next();
}

async function loadUserRole(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return next();

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (user) {
    req.session.userRole = user.role;
  }
  next();
}

router.use(loadUserRole);

router.get("/admin/records", requireAdmin, async (req, res) => {
  const queryParsed = ListAllRecordsQueryParams.safeParse(req.query);
  const filterUserId = queryParsed.success ? queryParsed.data.userId : undefined;

  const rows = await db
    .select({
      id: recordsTable.id,
      userId: recordsTable.userId,
      userName: usersTable.name,
      situacion: recordsTable.situacion,
      pensamientos: recordsTable.pensamientos,
      emocion: recordsTable.emocion,
      intensidad: recordsTable.intensidad,
      conducta: recordsTable.conducta,
      reflexion: recordsTable.reflexion,
      createdAt: recordsTable.createdAt,
    })
    .from(recordsTable)
    .innerJoin(usersTable, eq(recordsTable.userId, usersTable.id))
    .orderBy(desc(recordsTable.createdAt));

  const filtered = filterUserId
    ? rows.filter((r) => r.userId === filterUserId)
    : rows;

  res.json(
    filtered.map((r) => ({
      ...r,
      reflexion: r.reflexion ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.get("/psicologo/patients/:id/records", requirePsicologo, async (req, res) => {
  const patientUserId = parseInt(req.params.id);
  if (isNaN(patientUserId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const actorId = req.session!.userId!;
  const ip = req.ip || req.socket?.remoteAddress || null;

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  if (!actor) {
    res.status(404).json({ error: "Psicólogo no encontrado" });
    return;
  }

  const [assigned] = await db
    .select({ id: patientProfilesTable.id })
    .from(patientProfilesTable)
    .where(
      and(
        eq(patientProfilesTable.userId, patientUserId),
        ilike(patientProfilesTable.psicologaAsignada, actor.name)
      )
    )
    .limit(1);

  if (!assigned) {
    res.status(404).json({ error: "Paciente no encontrado o no asignado a este psicólogo" });
    return;
  }

  const rows = await db
    .select({
      id: recordsTable.id,
      userId: recordsTable.userId,
      userName: usersTable.name,
      situacion: recordsTable.situacion,
      pensamientos: recordsTable.pensamientos,
      emocion: recordsTable.emocion,
      intensidad: recordsTable.intensidad,
      conducta: recordsTable.conducta,
      reflexion: recordsTable.reflexion,
      createdAt: recordsTable.createdAt,
    })
    .from(recordsTable)
    .innerJoin(usersTable, eq(recordsTable.userId, usersTable.id))
    .where(eq(recordsTable.userId, patientUserId))
    .orderBy(desc(recordsTable.createdAt));

  await logAudit({
    actorId,
    actorName: actor.name,
    action: "VIEW_PATIENT_RECORDS",
    targetTable: "records",
    targetId: patientUserId,
    ipAddress: ip,
    details: { patientUserId, recordCount: rows.length },
  });

  res.json(
    rows.map((r) => ({
      ...r,
      reflexion: r.reflexion ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.get("/records", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const rows = await db
    .select({
      id: recordsTable.id,
      userId: recordsTable.userId,
      userName: usersTable.name,
      situacion: recordsTable.situacion,
      pensamientos: recordsTable.pensamientos,
      emocion: recordsTable.emocion,
      intensidad: recordsTable.intensidad,
      conducta: recordsTable.conducta,
      reflexion: recordsTable.reflexion,
      createdAt: recordsTable.createdAt,
    })
    .from(recordsTable)
    .innerJoin(usersTable, eq(recordsTable.userId, usersTable.id))
    .where(eq(recordsTable.userId, userId))
    .orderBy(recordsTable.createdAt);

  res.json(
    rows.map((r) => ({
      ...r,
      reflexion: r.reflexion ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.post("/records", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const parsed = CreateRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { situacion, pensamientos, emocion, intensidad, conducta, reflexion } = parsed.data;

  const [record] = await db
    .insert(recordsTable)
    .values({
      userId,
      situacion,
      pensamientos,
      emocion,
      intensidad,
      conducta,
      reflexion: reflexion ?? null,
    })
    .returning();

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];

  res.status(201).json({
    id: record.id,
    userId: record.userId,
    userName: user?.name ?? "",
    situacion: record.situacion,
    pensamientos: record.pensamientos,
    emocion: record.emocion,
    intensidad: record.intensidad,
    conducta: record.conducta,
    reflexion: record.reflexion ?? null,
    createdAt: record.createdAt.toISOString(),
  });
});

export default router;
