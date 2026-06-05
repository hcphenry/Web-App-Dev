import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const ruedaVidaRecordsTable = pgTable("rueda_vida_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  psicologoId: integer("psicologo_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  items: jsonb("items").notNull().default([]),
  accionSemillaArea: text("accion_semilla_area"),
  accionSemilla: text("accion_semilla"),
  accionSemillaFecha: text("accion_semilla_fecha"),
  notas: text("notas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("rueda_vida_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("rueda_vida_records_assignment_idx").on(t.assignmentId),
}));

export type RuedaVidaRecord = typeof ruedaVidaRecordsTable.$inferSelect;
export type InsertRuedaVidaRecord = typeof ruedaVidaRecordsTable.$inferInsert;
