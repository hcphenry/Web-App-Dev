import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const distorsionesRecordsTable = pgTable("distorsiones_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  psicologoId: integer("psicologo_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  items: jsonb("items").notNull().default([]),
  notas: text("notas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("distorsiones_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("distorsiones_records_assignment_idx").on(t.assignmentId),
}));

export type DistorsionRecord = typeof distorsionesRecordsTable.$inferSelect;
export type InsertDistorsionRecord = typeof distorsionesRecordsTable.$inferInsert;
