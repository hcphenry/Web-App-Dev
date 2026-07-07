import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { taskAssignmentsTable } from "./therapeuticTasks";

// "Tablón de Anuncios": mensajes de un psicólogo a uno de SUS pacientes,
// opcionalmente ligados a una tarea asignada (task_assignments).
//
// Borrado LÓGICO en ambos sentidos (nunca DELETE físico — registro clínico):
//   - deleted_by_psi_at: el psicólogo lo eliminó → NADIE lo ve (ni el paciente).
//   - deleted_by_paciente_at: el paciente lo ocultó de SU panel; el psicólogo lo sigue viendo.
// Edición: body nuevo + edited_at, y read_at/deleted_by_paciente_at se resetean a NULL
// para que el mensaje vuelva a entregarse como nuevo (el texto anterior queda en audit_logs).
export const psiMessagesTable = pgTable("psi_messages", {
  id: serial("id").primaryKey(),
  psicologoId: integer("psicologo_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id")
    .references(() => taskAssignmentsTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  editedAt: timestamp("edited_at"),
  deletedByPsiAt: timestamp("deleted_by_psi_at"),
  deletedByPacienteAt: timestamp("deleted_by_paciente_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("psi_messages_paciente_idx").on(t.pacienteId),
  psicologoIdx: index("psi_messages_psicologo_idx").on(t.psicologoId),
}));

export type PsiMessage = typeof psiMessagesTable.$inferSelect;
export type InsertPsiMessage = typeof psiMessagesTable.$inferInsert;
