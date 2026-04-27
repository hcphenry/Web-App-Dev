import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  targetTable: text("target_table"),
  targetId: integer("target_id"),
  ipAddress: text("ip_address"),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
