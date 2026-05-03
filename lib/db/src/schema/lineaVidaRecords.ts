import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const lineaVidaRecordsTable = pgTable("linea_vida_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  presenteCircunstancias: text("presente_circunstancias"),
  reflexionPatrones: text("reflexion_patrones"),
  fortalezasVitales: text("fortalezas_vitales"),
  aprendizajesGenerales: text("aprendizajes_generales"),
  eventos: jsonb("eventos").notNull().default([]),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("linea_vida_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("linea_vida_records_assignment_idx").on(t.assignmentId),
}));

export type LineaVidaRecord = typeof lineaVidaRecordsTable.$inferSelect;
export type InsertLineaVidaRecord = typeof lineaVidaRecordsTable.$inferInsert;
