import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody, LoginResponse, GetMeResponse, LogoutResponse } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET environment variable is required in production");
}
const TOKEN_SECRET: string =
  process.env.SESSION_SECRET ?? "abc-tcc-dev-secret-do-not-use-in-prod";

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { email, password } = parsed.data;

  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  (req as any).session.userId = user.id;

  await logAudit({
    actorId: user.id,
    actorName: user.name,
    action: "LOGIN",
    targetTable: "users",
    targetId: user.id,
    ipAddress: (req as any).ip || (req as any).socket?.remoteAddress || null,
    details: { email: user.email, role: user.role },
  });

  const response = LoginResponse.parse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });

  const token = jwt.sign({ userId: user.id }, TOKEN_SECRET, { expiresIn: "7d" });

  res.json({ ...response, token });
});

router.post("/logout", (req, res) => {
  (req as any).session.destroy(() => {
    const response = LogoutResponse.parse({ message: "Sesión cerrada" });
    res.json(response);
  });
});

router.put("/me/email", async (req, res) => {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { email, currentPassword } = req.body;
  if (!email || !currentPassword) {
    res.status(400).json({ error: "Se requiere el nuevo correo y la contraseña actual" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Contraseña actual incorrecta" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0 && existing[0].id !== userId) {
    res.status(400).json({ error: "Ese correo ya está en uso por otra cuenta" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ email })
    .where(eq(usersTable.id, userId))
    .returning();

  await logAudit({
    actorId: user.id,
    actorName: user.name,
    action: "UPDATE_OWN_EMAIL",
    targetTable: "users",
    targetId: user.id,
    ipAddress: (req as any).ip || (req as any).socket?.remoteAddress || null,
    details: { newEmail: email },
  });

  res.json({ message: "Correo actualizado correctamente", email: updated.email });
});

router.put("/me/password", async (req, res) => {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Se requiere la contraseña actual y la nueva" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Contraseña actual incorrecta" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));

  await logAudit({
    actorId: user.id,
    actorName: user.name,
    action: "UPDATE_OWN_PASSWORD",
    targetTable: "users",
    targetId: user.id,
    ipAddress: (req as any).ip || (req as any).socket?.remoteAddress || null,
    details: {},
  });

  res.json({ message: "Contraseña actualizada correctamente" });
});

router.get("/me", async (req, res) => {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ error: "Usuario no encontrado" });
    return;
  }

  const response = GetMeResponse.parse({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  res.json(response);
});

export default router;
