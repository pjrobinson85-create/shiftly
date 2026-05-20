import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';
import { validateIncidentPayload } from '../lib/incidents';

const router = Router();

router.use(requireAuth);

// GET /api/incidents — list incidents (optionally filter by date range)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const where: { occurredAt?: { gte?: Date; lte?: Date } } = {};
    if (req.query.from) {
      where.occurredAt = { ...where.occurredAt, gte: new Date(req.query.from as string) };
    }
    if (req.query.to) {
      where.occurredAt = { ...where.occurredAt, lte: new Date(req.query.to as string) };
    }

    const incidents = await prisma.incident.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
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
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    res.json(incident);
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/incidents — create an incident report
router.post('/', async (req: AuthRequest, res) => {
  try {
    const validation = validateIncidentPayload(req.body as Record<string, unknown>);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const incident = await prisma.incident.create({
      data: {
        title: validation.data.title,
        description: validation.data.description,
        severity: validation.data.severity,
        occurredAt: validation.data.occurredAt,
        photos: validation.data.photos,
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    const { io } = await import('../index');
    io.to('FAMILY').emit('incident:created', incident);

    res.status(201).json(incident);
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
