import { pgTable, serial, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

export const consentimientoInformadoRecordsTable = pgTable("consentimiento_informado_records", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  accepted: boolean("accepted").notNull().default(false),
  acceptedAt: timestamp("accepted_at"),
  fullName: text("full_name").notNull(),
  documentType: text("document_type").notNull(),
  documentNumber: text("document_number").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  consentVersion: text("consent_version").notNull(),
  consentTextSnapshot: text("consent_text_snapshot").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("consentimiento_informado_paciente_idx").on(t.pacienteId),
  assignmentIdx: index("consentimiento_informado_assignment_idx").on(t.assignmentId),
}));

export type ConsentimientoInformadoRecord = typeof consentimientoInformadoRecordsTable.$inferSelect;
export type InsertConsentimientoInformadoRecord = typeof consentimientoInformadoRecordsTable.$inferInsert;
