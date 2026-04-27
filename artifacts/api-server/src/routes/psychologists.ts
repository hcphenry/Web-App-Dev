import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, psychologistProfilesTable, availabilitySlotsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

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
  if (user) req.session.userRole = user.role;
  next();
}

router.use(loadUserRole);

// ─── ADMIN: CRUD PSICÓLOGOS ───────────────────────────────────────────────

router.get("/admin/psychologists", requireAdmin, async (req, res) => {
  const psicologos = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
      profileId: psychologistProfilesTable.id,
      dateOfBirth: psychologistProfilesTable.dateOfBirth,
      profession: psychologistProfilesTable.profession,
      registrationDate: psychologistProfilesTable.registrationDate,
      deregistrationDate: psychologistProfilesTable.deregistrationDate,
      commissionPercentage: psychologistProfilesTable.commissionPercentage,
      licenseNumber: psychologistProfilesTable.licenseNumber,
    })
    .from(usersTable)
    .leftJoin(psychologistProfilesTable, eq(psychologistProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.role, "psicologo"))
    .orderBy(desc(usersTable.createdAt));

  res.json(psicologos.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

router.post("/admin/psychologists", requireAdmin, async (req, res) => {
  const {
    name, email, password,
    dateOfBirth, profession, registrationDate, deregistrationDate,
    commissionPercentage, licenseNumber,
  } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: "Nombre, correo y contraseña son obligatorios" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "El correo ya está registrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db.insert(usersTable).values({
    name,
    email,
    passwordHash,
    role: "psicologo",
  }).returning();

  const [profile] = await db.insert(psychologistProfilesTable).values({
    userId: user.id,
    dateOfBirth: dateOfBirth || null,
    profession: profession || null,
    registrationDate: registrationDate || null,
    deregistrationDate: deregistrationDate || null,
    commissionPercentage: commissionPercentage || null,
    licenseNumber: licenseNumber || null,
  }).returning();

  res.status(201).json({
    ...profile,
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

router.put("/admin/psychologists/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const {
    name, email, password,
    dateOfBirth, profession, registrationDate, deregistrationDate,
    commissionPercentage, licenseNumber,
  } = req.body;

  const userUpdates: any = {};
  if (name) userUpdates.name = name;
  if (email) userUpdates.email = email;
  if (password) userUpdates.passwordHash = await bcrypt.hash(password, 12);

  if (Object.keys(userUpdates).length > 0) {
    await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, id));
  }

  const profileUpdates: any = { updatedAt: new Date() };
  if (dateOfBirth !== undefined) profileUpdates.dateOfBirth = dateOfBirth;
  if (profession !== undefined) profileUpdates.profession = profession;
  if (registrationDate !== undefined) profileUpdates.registrationDate = registrationDate;
  if (deregistrationDate !== undefined) profileUpdates.deregistrationDate = deregistrationDate;
  if (commissionPercentage !== undefined) profileUpdates.commissionPercentage = commissionPercentage;
  if (licenseNumber !== undefined) profileUpdates.licenseNumber = licenseNumber;

  const existingProfile = await db.select().from(psychologistProfilesTable).where(eq(psychologistProfilesTable.userId, id)).limit(1);
  if (existingProfile.length > 0) {
    await db.update(psychologistProfilesTable).set(profileUpdates).where(eq(psychologistProfilesTable.userId, id));
  } else {
    await db.insert(psychologistProfilesTable).values({ userId: id, ...profileUpdates });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Psicólogo no encontrado" }); return; }
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() });
});

router.delete("/admin/psychologists/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "psicologo"))).returning();
  if (!deleted) { res.status(404).json({ error: "Psicólogo no encontrado" }); return; }
  res.json({ message: "Psicólogo eliminado correctamente" });
});

router.get("/admin/psychologists/:id/availability", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const slots = await db.select().from(availabilitySlotsTable)
    .where(eq(availabilitySlotsTable.psychologistId, id))
    .orderBy(availabilitySlotsTable.startTime);
  res.json(slots.map(s => ({ ...s, startTime: s.startTime.toISOString(), endTime: s.endTime.toISOString(), createdAt: s.createdAt.toISOString() })));
});

// ─── PSICÓLOGO: PERFIL Y DISPONIBILIDAD ──────────────────────────────────

router.get("/psicologo/profile", requirePsicologo, async (req, res) => {
  const userId = req.session!.userId!;
  const [user] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt,
    dateOfBirth: psychologistProfilesTable.dateOfBirth,
    profession: psychologistProfilesTable.profession,
    registrationDate: psychologistProfilesTable.registrationDate,
    deregistrationDate: psychologistProfilesTable.deregistrationDate,
    commissionPercentage: psychologistProfilesTable.commissionPercentage,
    licenseNumber: psychologistProfilesTable.licenseNumber,
  })
    .from(usersTable)
    .leftJoin(psychologistProfilesTable, eq(psychologistProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) { res.status(404).json({ error: "Perfil no encontrado" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.get("/psicologo/availability", requirePsicologo, async (req, res) => {
  const userId = req.session!.userId!;
  const slots = await db.select().from(availabilitySlotsTable)
    .where(eq(availabilitySlotsTable.psychologistId, userId))
    .orderBy(availabilitySlotsTable.startTime);
  res.json(slots.map(s => ({ ...s, startTime: s.startTime.toISOString(), endTime: s.endTime.toISOString(), createdAt: s.createdAt.toISOString() })));
});

router.post("/psicologo/availability", requirePsicologo, async (req, res) => {
  const userId = req.session!.userId!;
  const { startTime, endTime, notes } = req.body;
  if (!startTime || !endTime) { res.status(400).json({ error: "Hora de inicio y fin son obligatorias" }); return; }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) { res.status(400).json({ error: "La hora de fin debe ser posterior a la hora de inicio" }); return; }

  const [slot] = await db.insert(availabilitySlotsTable).values({
    psychologistId: userId,
    startTime: start,
    endTime: end,
    notes: notes || null,
  }).returning();

  res.status(201).json({ ...slot, startTime: slot.startTime.toISOString(), endTime: slot.endTime.toISOString(), createdAt: slot.createdAt.toISOString() });
});

router.put("/psicologo/availability/:id", requirePsicologo, async (req, res) => {
  const userId = req.session!.userId!;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { startTime, endTime, notes, isAvailable } = req.body;
  const updates: any = {};
  if (startTime) updates.startTime = new Date(startTime);
  if (endTime) updates.endTime = new Date(endTime);
  if (notes !== undefined) updates.notes = notes;
  if (isAvailable !== undefined) updates.isAvailable = isAvailable;

  const [slot] = await db.update(availabilitySlotsTable)
    .set(updates)
    .where(and(eq(availabilitySlotsTable.id, id), eq(availabilitySlotsTable.psychologistId, userId)))
    .returning();

  if (!slot) { res.status(404).json({ error: "Horario no encontrado" }); return; }
  res.json({ ...slot, startTime: slot.startTime.toISOString(), endTime: slot.endTime.toISOString(), createdAt: slot.createdAt.toISOString() });
});

router.delete("/psicologo/availability/:id", requirePsicologo, async (req, res) => {
  const userId = req.session!.userId!;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(availabilitySlotsTable)
    .where(and(eq(availabilitySlotsTable.id, id), eq(availabilitySlotsTable.psychologistId, userId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Horario no encontrado" }); return; }
  res.json({ message: "Horario eliminado" });
});

export default router;
