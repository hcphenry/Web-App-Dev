import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import {
  CreateUserBody,
  UpdateUserBody,
  UpdateUserParams,
  DeleteUserParams,
  SuggestPasswordResponse,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

async function getActorName(actorId: number | undefined | null): Promise<string | null> {
  if (!actorId) return null;
  const [actor] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, actorId)).limit(1);
  return actor?.name ?? null;
}

const router: IRouter = Router();

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
  const user = users[0];
  if (user) {
    req.session.userRole = user.role;
  }
  next();
}

router.use(loadUserRole);

router.get("/users", requireAdmin, async (req, res) => {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.createdAt);

  res.json(users.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  })));
});

router.post("/users", requireAdmin, async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { name, email, password, role } = parsed.data;

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
    role: role ?? "user",
  }).returning();

  await logAudit({
    actorId: (req as any).session?.userId ?? null,
    actorName: await getActorName((req as any).session?.userId),
    action: "CREATE_USER",
    targetTable: "users",
    targetId: user.id,
    ipAddress: (req as any).ip || (req as any).socket?.remoteAddress || null,
    details: { name, email, role: user.role },
  });

  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

router.put("/users/:id", requireAdmin, async (req, res) => {
  const paramsParsed = UpdateUserParams.safeParse({ id: parseInt(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const bodyParsed = UpdateUserBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { name, email, password, role } = bodyParsed.data;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (role !== undefined) updates.role = role;
  if (password !== undefined) {
    updates.passwordHash = await bcrypt.hash(password, 12);
  }

  const [user] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, paramsParsed.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  await logAudit({
    actorId: (req as any).session?.userId ?? null,
    actorName: await getActorName((req as any).session?.userId),
    action: "UPDATE_USER",
    targetTable: "users",
    targetId: user.id,
    ipAddress: (req as any).ip || (req as any).socket?.remoteAddress || null,
    details: { updatedFields: Object.keys(updates) },
  });

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  const paramsParsed = DeleteUserParams.safeParse({ id: parseInt(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [deleted] = await db.delete(usersTable)
    .where(eq(usersTable.id, paramsParsed.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  await logAudit({
    actorId: (req as any).session?.userId ?? null,
    actorName: await getActorName((req as any).session?.userId),
    action: "DELETE_USER",
    targetTable: "users",
    targetId: paramsParsed.data.id,
    ipAddress: (req as any).ip || (req as any).socket?.remoteAddress || null,
    details: { name: deleted.name, email: deleted.email },
  });

  res.json({ message: "Usuario eliminado correctamente" });
});

router.get("/suggest-password", requireAdmin, (req, res) => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  const response = SuggestPasswordResponse.parse({
    password,
    strength: "Fuerte (12 caracteres, mayúsculas, números y símbolos)",
  });
  res.json(response);
});

export default router;
