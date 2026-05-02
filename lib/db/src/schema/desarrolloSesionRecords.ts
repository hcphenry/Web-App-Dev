import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const desarrolloSesionRecordsTable = pgTable("desarrollo_sesion_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  fechaSesion: text("fecha_sesion"),
  horaSesion: text("hora_sesion"),
  numeroSesion: text("numero_sesion"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("desarrollo_sesion_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("desarrollo_sesion_records_assignment_idx").on(t.assignmentId),
}));

export type DesarrolloSesionRecord = typeof desarrolloSesionRecordsTable.$inferSelect;
export type InsertDesarrolloSesionRecord = typeof desarrolloSesionRecordsTable.$inferInsert;
