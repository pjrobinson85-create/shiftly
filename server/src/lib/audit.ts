import { Request } from 'express';
import prisma from './prisma';

export interface AuditContext {
  userId: string;
  action: string;   // e.g., "task.completed"
  entity: string;   // e.g., "task"
  entityId?: string;
  detail?: string;
}

/**
 * Write an audit log entry. Fire-and-forget: an audit failure must never
 * break the main request.
 */
export async function logAudit(
  ctx: AuditContext,
  req?: Request
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        action: ctx.action,
        entity: ctx.entity,
        entityId: ctx.entityId ?? null,
        detail: ctx.detail ?? null,
        ip: req?.ip ?? null,
      },
    });
  } catch (err) {
    console.error(`[audit] failed to log ${ctx.action}:`, (err as Error).message);
  }
}
