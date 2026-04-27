import { Router, type IRouter } from "express";
import { db, usersTable, patientProfilesTable, auditLogsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, like, type SQL } from "drizzle-orm";
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

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Only accept patient-editable fields. Admin-only fields (estado, costoTerapia,
  // psicologaAsignada) are intentionally excluded to prevent privilege escalation.
  const {
    apellidoPaterno, apellidoMaterno, perioricidad, fechaAlta,
    nroCelular, tipoDocumento, numeroDocumento, fechaNacimiento, sexo,
    direccion, distrito, ciudad, departamento, pais,
  } = req.body;

  const data = {
    apellidoPaterno: apellidoPaterno ?? null,
    apellidoMaterno: apellidoMaterno ?? null,
    perioricidad: perioricidad ?? null,
    fechaAlta: fechaAlta ?? null,
    nroCelular: nroCelular ?? null,
    tipoDocumento: tipoDocumento ?? null,
    numeroDocumento: numeroDocumento ?? null,
    fechaNacimiento: fechaNacimiento ?? null,
    sexo: sexo ?? null,
    direccion: direccion ?? null,
    distrito: distrito ?? null,
    ciudad: ciudad ?? null,
    departamento: departamento ?? null,
    pais: pais ?? "Perú",
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
    targetId: patientId,
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

  const actorId = req.session!.userId!;
  const ip = req.ip || req.socket?.remoteAddress || null;

  const [actor] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  const {
    apellidoPaterno, apellidoMaterno, perioricidad, fechaAlta, estado,
    nroCelular, tipoDocumento, numeroDocumento, fechaNacimiento, sexo,
    direccion, distrito, ciudad, departamento, pais, costoTerapia, psicologaAsignada,
  } = req.body;

  const data = {
    apellidoPaterno: apellidoPaterno ?? null,
    apellidoMaterno: apellidoMaterno ?? null,
    perioricidad: perioricidad ?? null,
    fechaAlta: fechaAlta ?? null,
    estado: estado ?? "activo",
    nroCelular: nroCelular ?? null,
    tipoDocumento: tipoDocumento ?? null,
    numeroDocumento: numeroDocumento ?? null,
    fechaNacimiento: fechaNacimiento ?? null,
    sexo: sexo ?? null,
    direccion: direccion ?? null,
    distrito: distrito ?? null,
    ciudad: ciudad ?? null,
    departamento: departamento ?? null,
    pais: pais ?? "Perú",
    costoTerapia: costoTerapia ?? null,
    psicologaAsignada: psicologaAsignada ?? null,
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
    targetId: patientId,
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
  if (action) conditions.push(like(auditLogsTable.action, `%${action}%`));
  if (parsedActorId !== null) conditions.push(eq(auditLogsTable.actorId, parsedActorId));
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  if (toDate) conditions.push(lte(auditLogsTable.createdAt, toDate));

  const baseQuery = db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const logs = conditions.length > 0
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;

  res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

export default router;
