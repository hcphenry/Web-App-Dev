import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { therapeuticTasksTable } from "./therapeuticTasks";

// Per-psychologist access to "para Psicólogos" tasks.
// A row's presence means the psychologist is allowed to use that task.
// Default (no row) = NOT available, as required.
export const psychologistTaskAccessTable = pgTable("psychologist_task_access", {
  id: serial("id").primaryKey(),
  psicologoId: integer("psicologo_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  taskId: integer("task_id")
    .notNull()
    .references(() => therapeuticTasksTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("psychologist_task_access_unique").on(t.psicologoId, t.taskId),
  psicologoIdx: index("psychologist_task_access_psicologo_idx").on(t.psicologoId),
  taskIdx: index("psychologist_task_access_task_idx").on(t.taskId),
}));

export type PsychologistTaskAccess = typeof psychologistTaskAccessTable.$inferSelect;
export type InsertPsychologistTaskAccess = typeof psychologistTaskAccessTable.$inferInsert;
