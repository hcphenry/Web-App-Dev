import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const anamnesisRecordsTable = pgTable("anamnesis_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  nombreNino: text("nombre_nino").notNull().default(""),
  edad: text("edad"),
  sexo: text("sexo"),
  motivoConsulta: text("motivo_consulta"),
  entrevistador: text("entrevistador"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("anamnesis_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("anamnesis_records_assignment_idx").on(t.assignmentId),
}));

export type AnamnesisRecord = typeof anamnesisRecordsTable.$inferSelect;
export type InsertAnamnesisRecord = typeof anamnesisRecordsTable.$inferInsert;
