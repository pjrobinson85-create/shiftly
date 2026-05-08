import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(requireAuth);

// GET /api/tasks — list tasks for a date (default: today)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59);

    const tasks = await prisma.taskInstance.findMany({
      where: { dueDate: { gte: startOfDay, lte: endOfDay } },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        completedBy: { select: { id: true, name: true, role: true } },
      },
      // FIX: 'desc' puts URGENT before NORMAL (alphabetical descending)
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });

    res.json(tasks);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks — create an ad-hoc task
router.post('/', async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      title: string;
      description?: string;
      priority?: 'NORMAL' | 'URGENT';
      dueDate: string;
    };

    if (!body.title) return res.status(400).json({ error: 'Title is required' });
    if (!body.dueDate) return res.status(400).json({ error: 'dueDate is required' });

    const task = await prisma.taskInstance.create({
      data: {
        title: body.title,
        description: body.description,
        priority: body.priority ?? 'NORMAL',
        dueDate: new Date(body.dueDate),
        isRecurring: false,
        createdById: req.user!.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    const { io } = await import('../index');
    io.to('WORKER').emit('task:created', task);

    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/complete — mark complete
router.patch('/:id/complete', async (req: AuthRequest, res) => {
  try {
    const task = await prisma.taskInstance.update({
      where: { id: req.params.id as string },
      data: {
        completed: true,
        completedAt: new Date(),
        completedById: req.user!.id,
      },
      include: { completedBy: { select: { id: true, name: true } } },
    });

    const { io } = await import('../index');
    io.emit('task:completed', task);

    res.json(task);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id — delete task (FAMILY only)
// FIX: Use requireRole middleware for consistency instead of inline role check
router.delete('/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    await prisma.taskInstance.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
