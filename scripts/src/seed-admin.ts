import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const email = "admin@abc.com";
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (existing.length > 0) {
    console.log("Admin already exists:", email);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash("Admin2024!", 12);

  await db.insert(usersTable).values({
    name: "Administrador",
    email,
    passwordHash,
    role: "admin",
  });

  console.log("Admin created:");
  console.log("  Email:", email);
  console.log("  Password: Admin2024!");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Error seeding admin:", err);
  process.exit(1);
});
