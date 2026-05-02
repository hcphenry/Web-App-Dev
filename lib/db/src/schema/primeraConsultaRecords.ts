import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const primeraConsultaRecordsTable = pgTable("primera_consulta_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  nombreNino: text("nombre_nino").notNull().default(""),
  edad: text("edad"),
  motivoConsulta: text("motivo_consulta"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("primera_consulta_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("primera_consulta_records_assignment_idx").on(t.assignmentId),
}));

export type PrimeraConsultaRecord = typeof primeraConsultaRecordsTable.$inferSelect;
export type InsertPrimeraConsultaRecord = typeof primeraConsultaRecordsTable.$inferInsert;
