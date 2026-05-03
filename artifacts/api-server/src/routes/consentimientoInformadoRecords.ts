import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  consentimientoInformadoRecordsTable,
  taskAssignmentsTable,
  therapeuticTasksTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

export const CONSENT_VERSION = "1.0-2026-05";
export const CONSENT_TEXT = `CONSENTIMIENTO INFORMADO PARA EL TRATAMIENTO DE INFORMACIÓN DIGITAL EN SALUD MENTAL

Centro Psicológico ABC Positivamente · Lima, Perú

En cumplimiento de la Ley N.° 29733 (Ley de Protección de Datos Personales), su Reglamento aprobado por D.S. N.° 003-2013-JUS, la Ley General de Salud N.° 26842, la Ley N.° 30024 (Registro Nacional de Historias Clínicas Electrónicas) y la normativa emitida por el Ministerio de Salud del Perú (MINSA), declaro lo siguiente:

1. FINALIDAD DEL TRATAMIENTO DE MIS DATOS
Autorizo al Centro Psicológico ABC Positivamente a recopilar, almacenar, procesar y conservar de forma electrónica mis datos personales y datos sensibles de salud mental con la finalidad de:
   a) Brindarme atención psicológica clínica y dar continuidad terapéutica.
   b) Construir y mantener mi historia clínica digital (anamnesis, registros ABC, sesiones, planes de intervención, líneas de vida y otros instrumentos clínicos).
   c) Coordinar con el equipo de psicólogos tratantes y el personal administrativo estrictamente autorizado.
   d) Emitir comprobantes, gestionar pagos y cumplir obligaciones tributarias y legales.

2. DATOS QUE SE TRATARÁN
Datos de identificación (nombres, DNI/CE, fecha de nacimiento, sexo, dirección, teléfono, correo), datos clínicos (motivo de consulta, antecedentes, diagnósticos, evaluaciones, registros emocionales, evolución terapéutica) y datos administrativos (tarifas, sesiones, asistencia).

3. CONFIDENCIALIDAD Y SECRETO PROFESIONAL
La información clínica está protegida por el secreto profesional regulado en el Código de Ética del Colegio de Psicólogos del Perú. Solo será conocida por mi psicólogo/a tratante y, cuando corresponda, por el personal administrativo autorizado bajo deber de reserva. La información NO será compartida con terceros sin mi consentimiento expreso, salvo las excepciones legales (mandato judicial, riesgo grave para mi vida o la de terceros, denuncia obligatoria de delitos según Ley).

4. SEGURIDAD DE LA INFORMACIÓN
La plataforma digital aplica medidas técnicas y organizativas razonables (cifrado en tránsito, control de accesos por roles, registros de auditoría, copias de respaldo) conforme a la Directiva de Seguridad de la Información del MINSA y el Reglamento de la Ley N.° 29733.

5. CONSERVACIÓN DE LA INFORMACIÓN
Mi historia clínica electrónica se conservará por el plazo mínimo establecido por la normativa peruana vigente para historias clínicas (mínimo 15 años desde la última atención, conforme a la NTS N.° 139-MINSA/2018) y posteriormente podrá ser anonimizada con fines estadísticos o de investigación.

6. MIS DERECHOS COMO TITULAR DE DATOS (Ley 29733, art. 18-25)
Tengo derecho a: a) acceder a mis datos, b) rectificarlos cuando sean inexactos, c) cancelarlos en los casos legalmente previstos, d) oponerme a tratamientos no necesarios, e) revocar mi consentimiento en cualquier momento (sin efecto retroactivo y sin afectar la conservación legal obligatoria de la historia clínica), y f) presentar reclamos ante la Autoridad Nacional de Protección de Datos Personales (ANPDP).

7. EJERCICIO DE DERECHOS Y CONTACTO
Puedo ejercer mis derechos enviando una solicitud al correo del Centro Psicológico ABC Positivamente o presentando el formulario de reclamación disponible en la plataforma.

8. DECLARACIÓN DE COMPRENSIÓN Y ACEPTACIÓN
Declaro que he leído íntegramente el presente consentimiento, que he tenido la oportunidad de consultar mis dudas, que comprendo los términos en que se tratarán mis datos personales y de salud mental, y que mi aceptación es libre, voluntaria, informada e inequívoca.

Versión del documento: 1.0 (Mayo 2026).`;

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

// GET /api/consentimiento-informado/text — public-ish: returns the
// canonical consent version + text so client and mobile can render it
// without hard-coding it.
router.get("/text", requireAuth, (_req, res) => {
  res.json({ version: CONSENT_VERSION, text: CONSENT_TEXT });
});

// GET /api/consentimiento-informado/mine — returns latest record (or null)
router.get("/mine", requirePaciente, async (req: any, res) => {
  const rows = await db.select().from(consentimientoInformadoRecordsTable)
    .where(eq(consentimientoInformadoRecordsTable.pacienteId, req.session.userId))
    .orderBy(desc(consentimientoInformadoRecordsTable.createdAt))
    .limit(1);
  if (rows.length === 0) { res.json(null); return; }
  const r = rows[0];
  res.json({
    ...r,
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
});

// POST /api/consentimiento-informado/mine — paciente accepts the consent
router.post("/mine", requirePaciente, async (req: any, res) => {
  const b = req.body ?? {};
  const accepted = b.accepted === true;
  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  const documentType = typeof b.documentType === "string" ? b.documentType.trim() : "DNI";
  const documentNumber = typeof b.documentNumber === "string" ? b.documentNumber.trim() : "";

  if (!accepted) {
    res.status(400).json({ error: "Debes aceptar el consentimiento para continuar" });
    return;
  }
  if (fullName.length < 3) {
    res.status(400).json({ error: "Ingresa tu nombre completo" });
    return;
  }
  if (!["DNI", "CE", "PASAPORTE"].includes(documentType)) {
    res.status(400).json({ error: "Tipo de documento inválido" });
    return;
  }
  if (documentNumber.length < 6) {
    res.status(400).json({ error: "Número de documento inválido" });
    return;
  }

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
    if (row.key !== "consentimiento-informado") {
      res.status(400).json({ error: "La asignación no corresponde a la tarea Consentimiento Informado" });
      return;
    }
    assignmentId = v;
  }

  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  const now = new Date();

  const [row] = await db.insert(consentimientoInformadoRecordsTable).values({
    pacienteId: req.session.userId,
    assignmentId,
    accepted: true,
    acceptedAt: now,
    fullName,
    documentType,
    documentNumber,
    ipAddress: getIp(req),
    userAgent: ua,
    consentVersion: CONSENT_VERSION,
    consentTextSnapshot: CONSENT_TEXT,
  }).returning();

  if (assignmentId !== null) {
    await db.update(taskAssignmentsTable).set({
      status: "completada",
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(taskAssignmentsTable.id, assignmentId),
      eq(taskAssignmentsTable.pacienteId, req.session.userId),
    ));
  }

  await logAudit({
    actorId: req.session.userId,
    actorName: fullName,
    action: "ACCEPT_CONSENT",
    targetTable: "consentimiento_informado_records",
    targetId: row.id,
    ipAddress: getIp(req),
    details: { version: CONSENT_VERSION, documentType, assignmentId },
  });

  res.status(201).json({
    ...row,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// GET /api/consentimiento-informado — admin/psi list (optional ?pacienteId)
router.get("/", requireAdminOrPsi, async (req, res) => {
  const pacienteId = req.query.pacienteId ? Number(req.query.pacienteId) : null;
  const filters: any[] = [];
  if (pacienteId !== null && Number.isInteger(pacienteId)) {
    filters.push(eq(consentimientoInformadoRecordsTable.pacienteId, pacienteId));
  }
  const rows = await db.select().from(consentimientoInformadoRecordsTable)
    .where(filters.length ? and(...filters) : undefined as any)
    .orderBy(desc(consentimientoInformadoRecordsTable.createdAt));

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
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

// GET /api/consentimiento-informado/:id — owner/admin/psi
router.get("/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [row] = await db.select().from(consentimientoInformadoRecordsTable)
    .where(eq(consentimientoInformadoRecordsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "No encontrado" }); return; }
  const role = req.session.userRole;
  if (role !== "admin" && role !== "psicologo" && row.pacienteId !== req.session.userId) {
    res.status(403).json({ error: "Acceso denegado" }); return;
  }
  res.json({
    ...row,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

export default router;
