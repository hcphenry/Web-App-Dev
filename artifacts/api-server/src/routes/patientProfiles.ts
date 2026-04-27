import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, usersTable, patientProfilesTable, auditLogsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, count, type SQL } from "drizzle-orm";
import { logAudit } from "../lib/audit";

// ─── Validation schemas ────────────────────────────────────────────────────

const dateField = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.literal('').transform(() => null),
  z.null(),
]).optional();

const patientProfileSchema = z.object({
  apellidoPaterno: z.string().max(100).nullable().optional(),
  apellidoMaterno: z.string().max(100).nullable().optional(),
  perioricidad: z.enum(["semanal", "quincenal", "mensual", "intensivo"]).nullable().optional(),
  fechaAlta: dateField,
  nroCelular: z.string().max(20).nullable().optional(),
  tipoDocumento: z.string().max(20).nullable().optional(),
  numeroDocumento: z.string().max(30).nullable().optional(),
  fechaNacimiento: dateField,
  sexo: z.enum(["masculino", "femenino", "otro"]).nullable().optional(),
  direccion: z.string().max(200).nullable().optional(),
  distrito: z.string().max(100).nullable().optional(),
  ciudad: z.string().max(100).nullable().optional(),
  departamento: z.string().max(100).nullable().optional(),
  pais: z.string().max(100).nullable().optional(),
});

const adminPatientProfileSchema = patientProfileSchema.extend({
  estado: z.enum(["activo", "inactivo", "suspendido"]).nullable().optional(),
  costoTerapia: z.string().max(20).nullable().optional(),
  psicologaAsignada: z.string().max(200).nullable().optional(),
});

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

async function loadUserRole(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return next();
  const users = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users[0]) req.session.userRole = users[0].role;
  next();
}

router.use(loadUserRole);

// ─── PATIENT: Own profile ─────────────────────────────────────────────────

router.get("/patient/profile", requireAuth, async (req, res) => {
  const userId = req.session!.userId!;
  const ip = req.ip || req.socket?.remoteAddress || null;

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const profiles = await db
    .select()
    .from(patientProfilesTable)
    .where(eq(patientProfilesTable.userId, userId))
    .limit(1);

  await logAudit({
    actorId: userId,
    actorName: actor?.name ?? null,
    action: "VIEW_OWN_PROFILE",
    targetTable: "patient_profiles",
    targetId: profiles[0]?.id ?? null,
    ipAddress: ip,
    details: { userId, profileExists: profiles.length > 0 },
  });

  res.json(profiles[0] ?? null);
});

router.put("/patient/profile", requireAuth, async (req, res) => {
  const userId = req.session!.userId!;
  const ip = req.ip || req.socket?.remoteAddress || null;

  const parsed = patientProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos del perfil inválidos", details: parsed.error.flatten() });
    return;
  }

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const body = parsed.data;
  const data = {
    apellidoPaterno: body.apellidoPaterno ?? null,
    apellidoMaterno: body.apellidoMaterno ?? null,
    perioricidad: body.perioricidad ?? null,
    fechaAlta: body.fechaAlta ?? null,
    nroCelular: body.nroCelular ?? null,
    tipoDocumento: body.tipoDocumento ?? null,
    numeroDocumento: body.numeroDocumento ?? null,
    fechaNacimiento: body.fechaNacimiento ?? null,
    sexo: body.sexo ?? null,
    direccion: body.direccion ?? null,
    distrito: body.distrito ?? null,
    ciudad: body.ciudad ?? null,
    departamento: body.departamento ?? null,
    pais: body.pais ?? "Perú",
    updatedAt: new Date(),
  };

  const existing = await db
    .select({ id: patientProfilesTable.id })
    .from(patientProfilesTable)
    .where(eq(patientProfilesTable.userId, userId))
    .limit(1);

  let profile;
  if (existing.length > 0) {
    [profile] = await db
      .update(patientProfilesTable)
      .set(data)
      .where(eq(patientProfilesTable.userId, userId))
      .returning();
  } else {
    [profile] = await db
      .insert(patientProfilesTable)
      .values({ userId, ...data })
      .returning();
  }

  await logAudit({
    actorId: userId,
    actorName: actor?.name ?? null,
    action: "UPDATE_OWN_PROFILE",
    targetTable: "patient_profiles",
    targetId: profile.id,
    ipAddress: ip,
    details: { userId },
  });

  res.json(profile);
});

// ─── ADMIN: Patient profiles ──────────────────────────────────────────────

router.get("/admin/patients/:id/profile", requireAdmin, async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [targetUser] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, patientId)).limit(1);
  if (!targetUser) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  if (targetUser.role !== "user") { res.status(400).json({ error: "El usuario especificado no es un paciente" }); return; }

  const actorId = req.session!.userId!;
  const ip = req.ip || req.socket?.remoteAddress || null;

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  const profiles = await db
    .select()
    .from(patientProfilesTable)
    .where(eq(patientProfilesTable.userId, patientId))
    .limit(1);

  await logAudit({
    actorId,
    actorName: actor?.name ?? null,
    action: "VIEW_PATIENT_PROFILE",
    targetTable: "patient_profiles",
    targetId: profiles[0]?.id ?? null,
    ipAddress: ip,
    details: { patientId },
  });

  if (profiles.length === 0) {
    res.json(null);
    return;
  }
  res.json(profiles[0]);
});

router.put("/admin/patients/:id/profile", requireAdmin, async (req, res) => {
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [targetUser] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, patientId)).limit(1);
  if (!targetUser) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  if (targetUser.role !== "user") { res.status(400).json({ error: "El usuario especificado no es un paciente" }); return; }

  const parsed = adminPatientProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos del perfil inválidos", details: parsed.error.flatten() });
    return;
  }

  const actorId = req.session!.userId!;
  const ip = req.ip || req.socket?.remoteAddress || null;

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  const body = parsed.data;
  const data = {
    apellidoPaterno: body.apellidoPaterno ?? null,
    apellidoMaterno: body.apellidoMaterno ?? null,
    perioricidad: body.perioricidad ?? null,
    fechaAlta: body.fechaAlta ?? null,
    estado: body.estado ?? "activo",
    nroCelular: body.nroCelular ?? null,
    tipoDocumento: body.tipoDocumento ?? null,
    numeroDocumento: body.numeroDocumento ?? null,
    fechaNacimiento: body.fechaNacimiento ?? null,
    sexo: body.sexo ?? null,
    direccion: body.direccion ?? null,
    distrito: body.distrito ?? null,
    ciudad: body.ciudad ?? null,
    departamento: body.departamento ?? null,
    pais: body.pais ?? "Perú",
    costoTerapia: body.costoTerapia ?? null,
    psicologaAsignada: body.psicologaAsignada ?? null,
    updatedAt: new Date(),
  };

  const existing = await db
    .select({ id: patientProfilesTable.id })
    .from(patientProfilesTable)
    .where(eq(patientProfilesTable.userId, patientId))
    .limit(1);

  let profile;
  if (existing.length > 0) {
    [profile] = await db
      .update(patientProfilesTable)
      .set(data)
      .where(eq(patientProfilesTable.userId, patientId))
      .returning();
  } else {
    [profile] = await db
      .insert(patientProfilesTable)
      .values({ userId: patientId, ...data })
      .returning();
  }

  await logAudit({
    actorId,
    actorName: actor?.name ?? null,
    action: "ADMIN_UPDATE_PATIENT_PROFILE",
    targetTable: "patient_profiles",
    targetId: profile.id,
    ipAddress: ip,
    details: { patientId },
  });

  res.json(profile);
});

// ─── ADMIN: Audit logs ────────────────────────────────────────────────────

router.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  const { action, actorId, from, to, limit: limitParam, offset: offsetParam } = req.query as Record<string, string>;

  const parsedLimit = parseInt(limitParam || "50");
  const parsedOffset = parseInt(offsetParam || "0");
  const parsedActorId = actorId ? parseInt(actorId) : null;

  if (isNaN(parsedLimit) || isNaN(parsedOffset) || parsedLimit < 1 || parsedOffset < 0) {
    res.status(400).json({ error: "Parámetros de paginación inválidos (limit >= 1, offset >= 0)" });
    return;
  }
  if (actorId && isNaN(parsedActorId!)) {
    res.status(400).json({ error: "actorId debe ser un número entero" });
    return;
  }
  if (from && isNaN(Date.parse(from))) {
    res.status(400).json({ error: "Fecha 'from' inválida" });
    return;
  }
  if (to && isNaN(Date.parse(to))) {
    res.status(400).json({ error: "Fecha 'to' inválida" });
    return;
  }

  const limit = Math.min(parsedLimit, 200);
  const offset = parsedOffset;

  // Normalize `to` to end-of-day so all records from that calendar day are included.
  const toDate = to ? (() => { const d = new Date(to); d.setHours(23, 59, 59, 999); return d; })() : null;

  const conditions: SQL[] = [];
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (parsedActorId !== null) conditions.push(eq(auditLogsTable.actorId, parsedActorId));
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  if (toDate) conditions.push(lte(auditLogsTable.createdAt, toDate));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLogsTable)
      .where(whereClause)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLogsTable).where(whereClause),
  ]);

  res.json({
    logs: rows.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    total,
    limit,
    offset,
  });
});

export default router;
