import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const recordsTable = pgTable("records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  situacion: text("situacion").notNull(),
  pensamientos: text("pensamientos").notNull(),
  emocion: text("emocion").notNull(),
  intensidad: integer("intensidad").notNull(),
  conducta: text("conducta").notNull(),
  reflexion: text("reflexion"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRecordSchema = createInsertSchema(recordsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRecord = z.infer<typeof insertRecordSchema>;
export type Record = typeof recordsTable.$inferSelect;
