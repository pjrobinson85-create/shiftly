import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { sendAlert } from '../lib/telegram';
import { getSocket } from '../lib/socket';

const router = Router();

router.use(requireAuth);

const INCIDENT_INCLUDE = {
  user: { select: { id: true, name: true, role: true } },
} as const;

// GET /api/incidents — list incidents (optionally filter by date range)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const where: { occurredAt?: { gte?: Date; lte?: Date } } = {};
    if (req.query.from) {
      const d = new Date(req.query.from as string);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid "from" date' });
      where.occurredAt = { ...where.occurredAt, gte: d };
    }
    if (req.query.to) {
      const d = new Date(req.query.to as string);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid "to" date' });
      where.occurredAt = { ...where.occurredAt, lte: d };
    }

    const incidents = await prisma.incident.findMany({
      where,
      include: INCIDENT_INCLUDE,
      orderBy: { occurredAt: 'desc' },
    });
    res.json(incidents);
  } catch (error) {
    console.error('List incidents error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/incidents/:id — get a single incident
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: req.params.id as string },
      include: INCIDENT_INCLUDE,
    });
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    res.json(incident);
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/incidents — create an incident report (both roles)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      title: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      occurredAt?: string;
      photos?: string[];
    };

    if (!body.title || !body.description || !body.severity) {
      return res.status(400).json({ error: 'Title, description, and severity are required' });
    }
    if (!['low', 'medium', 'high'].includes(body.severity)) {
      return res.status(400).json({ error: 'severity must be low, medium, or high' });
    }
    if (body.occurredAt && isNaN(new Date(body.occurredAt).getTime())) {
      return res.status(400).json({ error: 'occurredAt is invalid' });
    }
    if (body.photos !== undefined && !Array.isArray(body.photos)) {
      return res.status(400).json({ error: 'photos must be an array of paths' });
    }

    const incident = await prisma.incident.create({
      data: {
        title: body.title,
        description: body.description,
        severity: body.severity,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        photos: body.photos ?? [],
        userId: req.user!.id,
      },
      include: INCIDENT_INCLUDE,
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'incident.reported',
        entity: 'incident',
        entityId: incident.id,
        detail: `${incident.severity.toUpperCase()} incident: "${incident.title}"`,
      },
      req
    );    getSocket().emit('incident:created', incident);

    // HIGH severity → immediate Telegram alert to the family.
    // MEDIUM → alert too (worth knowing in real time). LOW → no ping (reduces noise).
    if (incident.severity === 'high' || incident.severity === 'medium') {
      const sevLabel = incident.severity.toUpperCase();
      const when = incident.occurredAt.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' });
      void sendAlert(
        `⚠️ <b>${sevLabel} incident reported</b>\n${incident.title}\n\n${incident.description}\n\n` +
          `Reported by ${incident.user?.name ?? 'worker'} · ${when}`
      );
    }

    res.status(201).json(incident);
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/incidents/:id — remove an incident (FAMILY only)
router.delete('/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.incident.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Incident not found' });

    await prisma.incident.delete({ where: { id: req.params.id as string } });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'incident.deleted',
        entity: 'incident',
        entityId: existing.id,
        detail: `Deleted incident "${existing.title}"`,
      },
      req
    );    getSocket().emit('incident:deleted', { id: existing.id });

    res.status(204).end();
  } catch (error) {
    console.error('Delete incident error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
