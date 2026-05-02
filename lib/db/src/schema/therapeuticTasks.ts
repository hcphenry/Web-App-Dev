import { pgTable, serial, text, timestamp, integer, boolean, index, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const therapeuticTasksTable = pgTable("therapeutic_tasks", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("ClipboardList"),
  color: text("color").notNull().default("from-teal-500 to-teal-600"),
  badgeColor: text("badge_color").notNull().default("bg-teal-100 text-teal-700"),
  routePath: text("route_path"),
  isActive: boolean("is_active").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  keyUnique: uniqueIndex("therapeutic_tasks_key_unique").on(t.key),
}));

export const taskAssignmentsTable = pgTable("task_assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => therapeuticTasksTable.id, { onDelete: "restrict" }),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignedById: integer("assigned_by_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  psicologoId: integer("psicologo_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pendiente"),
  dueDate: timestamp("due_date"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("task_assignments_paciente_idx").on(t.pacienteId),
  psicologoIdx: index("task_assignments_psicologo_idx").on(t.psicologoId),
  taskIdx: index("task_assignments_task_idx").on(t.taskId),
  statusIdx: index("task_assignments_status_idx").on(t.status),
  statusCheck: check(
    "task_assignments_status_check",
    sql`${t.status} IN ('pendiente','en_progreso','completada','cancelada')`,
  ),
}));

export type TherapeuticTask = typeof therapeuticTasksTable.$inferSelect;
export type InsertTherapeuticTask = typeof therapeuticTasksTable.$inferInsert;
export type TaskAssignment = typeof taskAssignmentsTable.$inferSelect;
export type InsertTaskAssignment = typeof taskAssignmentsTable.$inferInsert;
