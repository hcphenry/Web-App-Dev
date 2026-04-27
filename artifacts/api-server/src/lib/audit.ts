import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

interface AuditParams {
  actorId?: number | null;
  actorName?: string | null;
  action: string;
  targetTable?: string | null;
  targetId?: number | null;
  ipAddress?: string | null;
  details?: Record<string, unknown> | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      actorId: params.actorId ?? null,
      actorName: params.actorName ?? null,
      action: params.action,
      targetTable: params.targetTable ?? null,
      targetId: params.targetId ?? null,
      ipAddress: params.ipAddress ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    logger.error({ err, action: params.action }, "[audit] Failed to write audit log");
  }
}
