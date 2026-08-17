import { Router } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseRange(query: { from?: string; to?: string }): { from: Date; to: Date } {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : now;
  if (isNaN(from.getTime())) throw new Error('Invalid "from" date (expected YYYY-MM-DD)');
  if (isNaN(to.getTime())) throw new Error('Invalid "to" date (expected YYYY-MM-DD)');
  // Normalize to full-day window
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/**
 * GET /export/incidents?from=YYYY-MM-DD&to=YYYY-MM-DD
 * CSV export of incident reports for NDIS provider records.
 */
router.get('/incidents', requireAuth, requireRole('FAMILY', 'WORKER'), (req: AuthRequest, res) => {
  let from: Date, to: Date;
  try {
    ({ from, to } = parseRange(req.query as any));
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
  if (to < from) return res.status(400).json({ error: '"to" must be on or after "from"' });

  prisma.incident.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    orderBy: { occurredAt: 'asc' },
    include: { user: true },
  })
    .then((incidents) => {
      const header = ['Date', 'Time', 'Title', 'Severity', 'Description', 'Reported By', 'Photos'];
      const rows = incidents.map((i) => [
        i.occurredAt.toISOString().slice(0, 10),
        i.occurredAt.toTimeString().slice(0, 5),
        i.title,
        i.severity,
        i.description,
        i.user?.name || '',
        Array.isArray(i.photos) ? (i.photos as string[]).join(' ; ') : '',
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="shiftly-incidents-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
      res.send(`\uFEFF${csv}`); // BOM so Excel opens UTF-8 correctly
    })
    .catch((err) => {
      console.error('[export:incidents]', (err as Error).message);
      res.status(500).json({ error: 'Export failed' });
    });
});

/**
 * GET /export/activity?from=YYYY-MM-DD&to=YYYY-MM-DD
 * CSV export of the audit trail (who did what) for the given window.
 */
router.get('/activity', requireAuth, requireRole('FAMILY', 'WORKER'), (req: AuthRequest, res) => {
  let from: Date, to: Date;
  try {
    ({ from, to } = parseRange(req.query as any));
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
  if (to < from) return res.status(400).json({ error: '"to" must be on or after "from"' });

  prisma.auditLog.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'asc' },
    include: { user: true },
  })
    .then((logs) => {
      const header = ['Timestamp', 'User', 'Action', 'Entity', 'Entity ID', 'Detail'];
      const rows = logs.map((l) => [
        l.createdAt.toISOString(),
        l.user?.name || '',
        l.action,
        l.entity,
        l.entityId || '',
        l.detail || '',
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="shiftly-activity-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
      res.send(`\uFEFF${csv}`);
    })
    .catch((err) => {
      console.error('[export:activity]', (err as Error).message);
      res.status(500).json({ error: 'Export failed' });
    });
});

export default router;
