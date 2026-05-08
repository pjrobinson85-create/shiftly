import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/incidents — list incidents (optionally filter by date range)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const where: any = {};
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
    const body = req.body as { title: string; description: string; severity: 'low' | 'medium' | 'high'; occurredAt?: string; photos?: string[] };

    if (!body.title || !body.description || !body.severity) {
      return res.status(400).json({ error: 'Title, description, and severity are required' });
    }

    const incident = await prisma.incident.create({
      data: {
        title: body.title,
        description: body.description,
        severity: body.severity,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        photos: body.photos || [],
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    const { io } = await import('../index');
    io.emit('incident:created', incident);

    res.status(201).json(incident);
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
