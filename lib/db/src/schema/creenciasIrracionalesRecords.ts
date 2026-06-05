import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const creenciasIrracionalesRecordsTable = pgTable("creencias_irracionales_records", {
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
  pacienteIdx: index("creencias_irracionales_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("creencias_irracionales_records_assignment_idx").on(t.assignmentId),
}));

export type CreenciasIrracionalesRecord = typeof creenciasIrracionalesRecordsTable.$inferSelect;
export type InsertCreenciasIrracionalesRecord = typeof creenciasIrracionalesRecordsTable.$inferInsert;
