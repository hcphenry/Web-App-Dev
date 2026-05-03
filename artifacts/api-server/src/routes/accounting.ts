import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  patientProfilesTable,
  psychologistProfilesTable,
  tarifasPacienteTable,
  sesionesContabilidadTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, lte, inArray, ilike, or } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────
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
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users[0]) req.session.userRole = users[0].role;
  next();
}

router.use(loadUserRole);

const ALLOWED_CURRENCIES = new Set(["PEN", "USD", "EUR"]);
function validCurrency(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const up = c.toUpperCase();
  return ALLOWED_CURRENCIES.has(up) ? up : null;
}

async function getActorName(actorId: number | null | undefined): Promise<string | null> {
  if (!actorId) return null;
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, actorId)).limit(1);
  return u?.name ?? null;
}

function getIp(req: any): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}

// ─── TARIFAS POR PACIENTE ─────────────────────────────────────────────────

// GET /api/contabilidad/tarifas — list all rates with patient info
router.get("/tarifas", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: tarifasPacienteTable.id,
      pacienteId: tarifasPacienteTable.pacienteId,
      pacienteName: usersTable.name,
      pacienteEmail: usersTable.email,
      montoPorSesion: tarifasPacienteTable.montoPorSesion,
      moneda: tarifasPacienteTable.moneda,
      vigenteDesde: tarifasPacienteTable.vigenteDesde,
      updatedAt: tarifasPacienteTable.updatedAt,
    })
    .from(tarifasPacienteTable)
    .innerJoin(usersTable, eq(usersTable.id, tarifasPacienteTable.pacienteId))
    .orderBy(usersTable.name);

  res.json(rows.map(r => ({
    ...r,
    montoPorSesion: Number(r.montoPorSesion),
    vigenteDesde: r.vigenteDesde.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// POST /api/contabilidad/tarifas — upsert (create or update by paciente_id)
router.post("/tarifas", requireAdmin, async (req: any, res) => {
  const { pacienteId, montoPorSesion, moneda } = req.body ?? {};
  const pid = Number(pacienteId);
  const monto = Number(montoPorSesion);

  if (!Number.isInteger(pid) || pid <= 0) {
    res.status(400).json({ error: "pacienteId inválido" }); return;
  }
  if (!Number.isFinite(monto) || monto < 0) {
    res.status(400).json({ error: "montoPorSesion inválido" }); return;
  }

  // Validate paciente exists and is a 'user' (paciente)
  const [paciente] = await db.select().from(usersTable).where(eq(usersTable.id, pid)).limit(1);
  if (!paciente) { res.status(404).json({ error: "Paciente no encontrado" }); return; }
  if (paciente.role !== "user") { res.status(400).json({ error: "El usuario no es paciente" }); return; }

  let monedaFinal = "PEN";
  if (moneda !== undefined && moneda !== null && moneda !== "") {
    const v = validCurrency(moneda);
    if (!v) { res.status(400).json({ error: "Moneda inválida (PEN, USD o EUR)" }); return; }
    monedaFinal = v;
  }

  // Upsert: insert or update on conflict
  const [tarifa] = await db
    .insert(tarifasPacienteTable)
    .values({
      pacienteId: pid,
      montoPorSesion: monto.toFixed(2),
      moneda: monedaFinal,
    })
    .onConflictDoUpdate({
      target: tarifasPacienteTable.pacienteId,
      set: {
        montoPorSesion: monto.toFixed(2),
        moneda: monedaFinal,
        vigenteDesde: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  await logAudit({
    actorId: req.session?.userId ?? null,
    actorName: await getActorName(req.session?.userId),
    action: "UPSERT_TARIFA_PACIENTE",
    targetTable: "tarifas_paciente",
    targetId: tarifa.id,
    ipAddress: getIp(req),
    details: { pacienteId: pid, montoPorSesion: monto, moneda: monedaFinal },
  });

  res.status(201).json({
    ...tarifa,
    montoPorSesion: Number(tarifa.montoPorSesion),
    vigenteDesde: tarifa.vigenteDesde.toISOString(),
    createdAt: tarifa.createdAt.toISOString(),
    updatedAt: tarifa.updatedAt.toISOString(),
  });
});

// DELETE /api/contabilidad/tarifas/:pacienteId
router.delete("/tarifas/:pacienteId", requireAdmin, async (req: any, res) => {
  const pid = parseInt(req.params.pacienteId);
  if (!Number.isInteger(pid)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(tarifasPacienteTable)
    .where(eq(tarifasPacienteTable.pacienteId, pid))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Tarifa no encontrada" }); return; }

  await logAudit({
    actorId: req.session?.userId ?? null,
    actorName: await getActorName(req.session?.userId),
    action: "DELETE_TARIFA_PACIENTE",
    targetTable: "tarifas_paciente",
    targetId: deleted.id,
    ipAddress: getIp(req),
    details: { pacienteId: pid },
  });

  res.json({ message: "Tarifa eliminada" });
});

// ─── SESIONES CONTABLES ───────────────────────────────────────────────────

// GET /api/agenda/mis-sesiones — patient sees their own scheduled sessions
router.get("/mis-sesiones", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (req.session.userRole !== "user") {
    res.status(403).json({ error: "Solo pacientes" });
    return;
  }
  const rows = await db
    .select({
      id: sesionesContabilidadTable.id,
      fechaSesion: sesionesContabilidadTable.fechaSesion,
      montoCobrado: sesionesContabilidadTable.montoCobrado,
      moneda: sesionesContabilidadTable.moneda,
      estadoPago: sesionesContabilidadTable.estadoPago,
      fechaPago: sesionesContabilidadTable.fechaPago,
      metodoPago: sesionesContabilidadTable.metodoPago,
      notas: sesionesContabilidadTable.notas,
      psicologoId: sesionesContabilidadTable.psicologoId,
      psicologoNombre: usersTable.name,
      psicologoEmail: usersTable.email,
    })
    .from(sesionesContabilidadTable)
    .innerJoin(usersTable, eq(usersTable.id, sesionesContabilidadTable.psicologoId))
    .where(eq(sesionesContabilidadTable.pacienteId, userId))
    .orderBy(desc(sesionesContabilidadTable.fechaSesion));
  res.json(rows);
});

// GET /api/contabilidad/sesiones — with filters
router.get("/sesiones", requireAdmin, async (req, res) => {
  const { estado, pacienteId, psicologoId, from, to, search } = req.query as Record<string, string>;
  const filters: any[] = [];

  if (estado && ["pagado", "pendiente", "deuda"].includes(estado)) {
    filters.push(eq(sesionesContabilidadTable.estadoPago, estado as any));
  }
  if (pacienteId) {
    const pid = parseInt(pacienteId);
    if (Number.isInteger(pid)) filters.push(eq(sesionesContabilidadTable.pacienteId, pid));
  }
  if (psicologoId) {
    const pid = parseInt(psicologoId);
    if (Number.isInteger(pid)) filters.push(eq(sesionesContabilidadTable.psicologoId, pid));
  }
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) filters.push(gte(sesionesContabilidadTable.fechaSesion, d));
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) filters.push(lte(sesionesContabilidadTable.fechaSesion, d));
  }

  // For patient name search, find matching IDs first
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const matchingPatients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "user"), or(ilike(usersTable.name, term), ilike(usersTable.email, term))));
    const ids = matchingPatients.map(p => p.id);
    if (ids.length === 0) { res.json([]); return; }
    filters.push(inArray(sesionesContabilidadTable.pacienteId, ids));
  }

  const pacienteAlias = usersTable;
  const rows = await db
    .select({
      id: sesionesContabilidadTable.id,
      pacienteId: sesionesContabilidadTable.pacienteId,
      psicologoId: sesionesContabilidadTable.psicologoId,
      fechaSesion: sesionesContabilidadTable.fechaSesion,
      montoCobrado: sesionesContabilidadTable.montoCobrado,
      moneda: sesionesContabilidadTable.moneda,
      estadoPago: sesionesContabilidadTable.estadoPago,
      fechaPago: sesionesContabilidadTable.fechaPago,
      metodoPago: sesionesContabilidadTable.metodoPago,
      notas: sesionesContabilidadTable.notas,
      createdAt: sesionesContabilidadTable.createdAt,
      pacienteName: pacienteAlias.name,
      pacienteEmail: pacienteAlias.email,
    })
    .from(sesionesContabilidadTable)
    .innerJoin(pacienteAlias, eq(pacienteAlias.id, sesionesContabilidadTable.pacienteId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(sesionesContabilidadTable.fechaSesion));

  // Resolve psicologo names in a separate query (avoid double-join alias headache)
  const psicologoIds = Array.from(new Set(rows.map(r => r.psicologoId)));
  const psicologos = psicologoIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(inArray(usersTable.id, psicologoIds))
    : [];
  const psicoMap = new Map(psicologos.map(p => [p.id, p.name]));

  res.json(rows.map(r => ({
    ...r,
    montoCobrado: Number(r.montoCobrado),
    fechaSesion: r.fechaSesion.toISOString(),
    fechaPago: r.fechaPago ? r.fechaPago.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    psicologoName: psicoMap.get(r.psicologoId) ?? "—",
  })));
});

// POST /api/contabilidad/sesiones — register a session (atomic with tarifa lookup)
router.post("/sesiones", requireAdmin, async (req: any, res) => {
  const {
    pacienteId, psicologoId, fechaSesion, montoCobrado,
    estadoPago, fechaPago, metodoPago, notas, moneda,
  } = req.body ?? {};

  const pid = Number(pacienteId);
  const psid = Number(psicologoId);
  if (!Number.isInteger(pid) || !Number.isInteger(psid)) {
    res.status(400).json({ error: "pacienteId y psicologoId son requeridos" }); return;
  }
  if (!fechaSesion || isNaN(new Date(fechaSesion).getTime())) {
    res.status(400).json({ error: "fechaSesion inválida" }); return;
  }
  const estadoFinal = (estadoPago === "pagado" || estadoPago === "deuda") ? estadoPago : "pendiente";

  try {
    const sesion = await db.transaction(async (tx) => {
      // Validate paciente
      const [paciente] = await tx.select().from(usersTable).where(eq(usersTable.id, pid)).limit(1);
      if (!paciente || paciente.role !== "user") throw new Error("Paciente inválido");

      // Validate psicólogo
      const [psicologo] = await tx.select().from(usersTable).where(eq(usersTable.id, psid)).limit(1);
      if (!psicologo || psicologo.role !== "psicologo") throw new Error("Psicólogo inválido");

      // Resolve monto: if not provided, use tarifa del paciente
      let monto = Number(montoCobrado);
      let monedaFinal = "PEN";
      if (moneda !== undefined && moneda !== null && moneda !== "") {
        const v = validCurrency(moneda);
        if (!v) throw new Error("Moneda inválida (PEN, USD o EUR)");
        monedaFinal = v;
      }
      if (!Number.isFinite(monto) || monto < 0) {
        const [tarifa] = await tx.select().from(tarifasPacienteTable)
          .where(eq(tarifasPacienteTable.pacienteId, pid)).limit(1);
        if (!tarifa) throw new Error("No hay tarifa registrada y no se proporcionó monto");
        monto = Number(tarifa.montoPorSesion);
        monedaFinal = tarifa.moneda;
      }

      const [s] = await tx.insert(sesionesContabilidadTable).values({
        pacienteId: pid,
        psicologoId: psid,
        fechaSesion: new Date(fechaSesion),
        montoCobrado: monto.toFixed(2),
        moneda: monedaFinal,
        estadoPago: estadoFinal as any,
        fechaPago: estadoFinal === "pagado"
          ? (fechaPago ? new Date(fechaPago) : new Date())
          : null,
        metodoPago: typeof metodoPago === "string" ? metodoPago : null,
        notas: typeof notas === "string" ? notas : null,
      }).returning();

      return s;
    });

    await logAudit({
      actorId: req.session?.userId ?? null,
      actorName: await getActorName(req.session?.userId),
      action: "CREATE_SESION_CONTABILIDAD",
      targetTable: "sesiones_contabilidad",
      targetId: sesion.id,
      ipAddress: getIp(req),
      details: { pacienteId: pid, psicologoId: psid, monto: Number(sesion.montoCobrado), estado: sesion.estadoPago },
    });

    res.status(201).json({
      ...sesion,
      montoCobrado: Number(sesion.montoCobrado),
      fechaSesion: sesion.fechaSesion.toISOString(),
      fechaPago: sesion.fechaPago ? sesion.fechaPago.toISOString() : null,
      createdAt: sesion.createdAt.toISOString(),
      updatedAt: sesion.updatedAt.toISOString(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Error al registrar sesión" });
  }
});

// PATCH /api/contabilidad/sesiones/:id — update (mark paid, change status, edit fields)
router.patch("/sesiones/:id", requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const updates: any = { updatedAt: new Date() };
  const { estadoPago, fechaPago, montoCobrado, moneda, metodoPago, notas, fechaSesion, pacienteId, psicologoId } = req.body ?? {};

  if (estadoPago && ["pagado", "pendiente", "deuda"].includes(estadoPago)) {
    updates.estadoPago = estadoPago;
    if (estadoPago === "pagado") {
      updates.fechaPago = fechaPago ? new Date(fechaPago) : new Date();
    } else {
      updates.fechaPago = null;
    }
  } else if (fechaPago !== undefined) {
    updates.fechaPago = fechaPago ? new Date(fechaPago) : null;
  }

  if (montoCobrado !== undefined) {
    const m = Number(montoCobrado);
    if (!Number.isFinite(m) || m < 0) { res.status(400).json({ error: "monto inválido" }); return; }
    updates.montoCobrado = m.toFixed(2);
  }
  if (typeof moneda === "string" && ["PEN", "USD", "EUR"].includes(moneda)) {
    updates.moneda = moneda;
  }
  if (typeof metodoPago === "string") updates.metodoPago = metodoPago || null;
  if (typeof notas === "string") updates.notas = notas || null;
  if (fechaSesion) {
    const d = new Date(fechaSesion);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "fechaSesion inválida" }); return; }
    updates.fechaSesion = d;
  }
  if (pacienteId !== undefined) {
    const pid = Number(pacienteId);
    if (!Number.isInteger(pid)) { res.status(400).json({ error: "pacienteId inválido" }); return; }
    const [p] = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, pid)).limit(1);
    if (!p || p.role !== "user") { res.status(400).json({ error: "Paciente inválido" }); return; }
    updates.pacienteId = pid;
  }
  if (psicologoId !== undefined) {
    const psid = Number(psicologoId);
    if (!Number.isInteger(psid)) { res.status(400).json({ error: "psicologoId inválido" }); return; }
    const [p] = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, psid)).limit(1);
    if (!p || p.role !== "psicologo") { res.status(400).json({ error: "Psicólogo inválido" }); return; }
    updates.psicologoId = psid;
  }

  const [updated] = await db.update(sesionesContabilidadTable)
    .set(updates)
    .where(eq(sesionesContabilidadTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Sesión no encontrada" }); return; }

  await logAudit({
    actorId: req.session?.userId ?? null,
    actorName: await getActorName(req.session?.userId),
    action: "UPDATE_SESION_CONTABILIDAD",
    targetTable: "sesiones_contabilidad",
    targetId: updated.id,
    ipAddress: getIp(req),
    details: { updatedFields: Object.keys(updates).filter(k => k !== "updatedAt") },
  });

  res.json({
    ...updated,
    montoCobrado: Number(updated.montoCobrado),
    fechaSesion: updated.fechaSesion.toISOString(),
    fechaPago: updated.fechaPago ? updated.fechaPago.toISOString() : null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// DELETE /api/contabilidad/sesiones/:id
router.delete("/sesiones/:id", requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(sesionesContabilidadTable)
    .where(eq(sesionesContabilidadTable.id, id))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Sesión no encontrada" }); return; }

  await logAudit({
    actorId: req.session?.userId ?? null,
    actorName: await getActorName(req.session?.userId),
    action: "DELETE_SESION_CONTABILIDAD",
    targetTable: "sesiones_contabilidad",
    targetId: id,
    ipAddress: getIp(req),
    details: { pacienteId: deleted.pacienteId, monto: Number(deleted.montoCobrado) },
  });

  res.json({ message: "Sesión eliminada" });
});

// ─── REPORTES ─────────────────────────────────────────────────────────────

// GET /api/contabilidad/reportes/clinica — KPIs and totals
router.get("/reportes/clinica", requireAdmin, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const filters: any[] = [];
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) filters.push(gte(sesionesContabilidadTable.fechaSesion, d));
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) filters.push(lte(sesionesContabilidadTable.fechaSesion, d));
  }
  const where = filters.length ? and(...filters) : undefined;

  const [agg] = await db
    .select({
      totalSesiones: sql<number>`count(*)::int`,
      totalRecaudado: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pagado' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      totalPendiente: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pendiente' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      totalDeuda: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'deuda' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      sesionesPagadas: sql<number>`count(*) filter (where ${sesionesContabilidadTable.estadoPago} = 'pagado')::int`,
      sesionesPendientes: sql<number>`count(*) filter (where ${sesionesContabilidadTable.estadoPago} = 'pendiente')::int`,
      sesionesDeuda: sql<number>`count(*) filter (where ${sesionesContabilidadTable.estadoPago} = 'deuda')::int`,
    })
    .from(sesionesContabilidadTable)
    .where(where);

  // Monthly breakdown (last 12 months)
  const monthly = await db
    .select({
      mes: sql<string>`to_char(${sesionesContabilidadTable.fechaSesion}, 'YYYY-MM')`,
      recaudado: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pagado' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      pendiente: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} != 'pagado' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      sesiones: sql<number>`count(*)::int`,
    })
    .from(sesionesContabilidadTable)
    .where(where)
    .groupBy(sql`to_char(${sesionesContabilidadTable.fechaSesion}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${sesionesContabilidadTable.fechaSesion}, 'YYYY-MM') desc`)
    .limit(12);

  res.json({
    kpis: {
      totalSesiones: agg?.totalSesiones ?? 0,
      totalRecaudado: Number(agg?.totalRecaudado ?? 0),
      totalPendiente: Number(agg?.totalPendiente ?? 0),
      totalDeuda: Number(agg?.totalDeuda ?? 0),
      sesionesPagadas: agg?.sesionesPagadas ?? 0,
      sesionesPendientes: agg?.sesionesPendientes ?? 0,
      sesionesDeuda: agg?.sesionesDeuda ?? 0,
    },
    monthly: monthly.map(m => ({
      mes: m.mes,
      recaudado: Number(m.recaudado),
      pendiente: Number(m.pendiente),
      sesiones: m.sesiones,
    })).reverse(),
  });
});

// GET /api/contabilidad/reportes/paciente — por cada paciente
router.get("/reportes/paciente", requireAdmin, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const filters: any[] = [];
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) filters.push(gte(sesionesContabilidadTable.fechaSesion, d));
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) filters.push(lte(sesionesContabilidadTable.fechaSesion, d));
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      pacienteId: sesionesContabilidadTable.pacienteId,
      pacienteName: usersTable.name,
      pacienteEmail: usersTable.email,
      totalSesiones: sql<number>`count(*)::int`,
      totalRecaudado: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pagado' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      totalPendiente: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pendiente' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      totalDeuda: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'deuda' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
    })
    .from(sesionesContabilidadTable)
    .innerJoin(usersTable, eq(usersTable.id, sesionesContabilidadTable.pacienteId))
    .where(where)
    .groupBy(sesionesContabilidadTable.pacienteId, usersTable.name, usersTable.email)
    .orderBy(desc(sql`coalesce(sum(${sesionesContabilidadTable.montoCobrado}), 0)`));

  res.json(rows.map(r => ({
    pacienteId: r.pacienteId,
    pacienteName: r.pacienteName,
    pacienteEmail: r.pacienteEmail,
    totalSesiones: r.totalSesiones,
    totalRecaudado: Number(r.totalRecaudado),
    totalPendiente: Number(r.totalPendiente),
    totalDeuda: Number(r.totalDeuda),
    totalGeneral: Number(r.totalRecaudado) + Number(r.totalPendiente) + Number(r.totalDeuda),
  })));
});

// GET /api/contabilidad/reportes/psicologo — por cada psicólogo, con comisión
router.get("/reportes/psicologo", requireAdmin, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const filters: any[] = [];
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) filters.push(gte(sesionesContabilidadTable.fechaSesion, d));
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) filters.push(lte(sesionesContabilidadTable.fechaSesion, d));
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      psicologoId: sesionesContabilidadTable.psicologoId,
      psicologoName: usersTable.name,
      psicologoEmail: usersTable.email,
      comisionPct: psychologistProfilesTable.commissionPercentage,
      totalSesiones: sql<number>`count(*)::int`,
      totalRecaudado: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pagado' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      totalPendiente: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'pendiente' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
      totalDeuda: sql<string>`coalesce(sum(case when ${sesionesContabilidadTable.estadoPago} = 'deuda' then ${sesionesContabilidadTable.montoCobrado} else 0 end), 0)`,
    })
    .from(sesionesContabilidadTable)
    .innerJoin(usersTable, eq(usersTable.id, sesionesContabilidadTable.psicologoId))
    .leftJoin(psychologistProfilesTable, eq(psychologistProfilesTable.userId, sesionesContabilidadTable.psicologoId))
    .where(where)
    .groupBy(
      sesionesContabilidadTable.psicologoId,
      usersTable.name,
      usersTable.email,
      psychologistProfilesTable.commissionPercentage,
    )
    .orderBy(desc(sql`coalesce(sum(${sesionesContabilidadTable.montoCobrado}), 0)`));

  res.json(rows.map(r => {
    const recaudado = Number(r.totalRecaudado);
    const pct = r.comisionPct ? Number(r.comisionPct) : 0;
    const comision = Number.isFinite(pct) ? +(recaudado * pct / 100).toFixed(2) : 0;
    return {
      psicologoId: r.psicologoId,
      psicologoName: r.psicologoName,
      psicologoEmail: r.psicologoEmail,
      comisionPct: pct,
      totalSesiones: r.totalSesiones,
      totalRecaudado: recaudado,
      totalPendiente: Number(r.totalPendiente),
      totalDeuda: Number(r.totalDeuda),
      comisionCalculada: comision,
      neto: +(recaudado - comision).toFixed(2),
    };
  }));
});

// GET /api/contabilidad/pacientes — list patients (helpers for forms)
// Includes the assigned psicólogo (resolved from patient_profiles.psicologa_asignada
// → users where role='psicologo' AND name matches case-insensitively).
router.get("/pacientes", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      psicologaAsignada: patientProfilesTable.psicologaAsignada,
    })
    .from(usersTable)
    .leftJoin(patientProfilesTable, eq(patientProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.role, "user"))
    .orderBy(sql`lower(${usersTable.name})`);

  // Resolve assigned psicólogo (id+name) for each patient using a single side query
  const psicologos = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.role, "psicologo"));
  const psicoByLowerName = new Map(psicologos.map(p => [p.name.trim().toLowerCase(), p]));

  res.json(rows.map(r => {
    const key = (r.psicologaAsignada ?? "").trim().toLowerCase();
    const psi = key ? psicoByLowerName.get(key) ?? null : null;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      psicologoAsignadoId: psi?.id ?? null,
      psicologoAsignadoName: psi?.name ?? null,
    };
  }));
});

// GET /api/contabilidad/psicologos — list psicólogos
router.get("/psicologos", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      comisionPct: psychologistProfilesTable.commissionPercentage,
    })
    .from(usersTable)
    .leftJoin(psychologistProfilesTable, eq(psychologistProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.role, "psicologo"))
    .orderBy(sql`lower(${usersTable.name})`);
  res.json(rows);
});

export default router;
