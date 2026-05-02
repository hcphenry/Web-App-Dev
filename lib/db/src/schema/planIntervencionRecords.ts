import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const planIntervencionRecordsTable = pgTable("plan_intervencion_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  pacienteNombre: text("paciente_nombre"),
  fechaEmision: text("fecha_emision"),
  responsable: text("responsable"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("plan_intervencion_records_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("plan_intervencion_records_assignment_idx").on(t.assignmentId),
}));

export type PlanIntervencionRecord = typeof planIntervencionRecordsTable.$inferSelect;
export type InsertPlanIntervencionRecord = typeof planIntervencionRecordsTable.$inferInsert;
