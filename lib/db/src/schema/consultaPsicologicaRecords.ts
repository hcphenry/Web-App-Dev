import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const consultaPsicologicaRecordsTable = pgTable("consulta_psicologica_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  fechaConsulta: text("fecha_consulta"),
  nombrePersonaConsulta: text("nombre_persona_consulta"),
  nombrePaciente: text("nombre_paciente"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("consulta_psicologica_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("consulta_psicologica_records_assignment_idx").on(t.assignmentId),
}));

export type ConsultaPsicologicaRecord = typeof consultaPsicologicaRecordsTable.$inferSelect;
export type InsertConsultaPsicologicaRecord = typeof consultaPsicologicaRecordsTable.$inferInsert;
