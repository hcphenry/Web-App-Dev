import { db, auditLogsTable } from "@workspace/db";

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
    console.error("[audit] Failed to write audit log:", err);
  }
}
