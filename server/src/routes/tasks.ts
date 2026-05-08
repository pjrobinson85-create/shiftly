import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

interface CreateTaskBody {
  title: string;
  description?: string;
  priority?: 'NORMAL' | 'URGENT';
  dueDate: string;
}

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
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
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
    const body = req.body as { title: string; description?: string; priority?: 'NORMAL' | 'URGENT'; dueDate: string };
    if (!body.title || !body.dueDate) {
      return res.status(400).json({ error: 'Title and dueDate are required' });
    }

    const task = await prisma.taskInstance.create({
      data: {
        title: body.title, description: body.description, priority: body.priority,
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

// PATCH /api/tasks/:id/complete — mark complete (WORKER)
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

// DELETE /api/tasks/:id — delete ad-hoc task (FAMILY only)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'FAMILY') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    await prisma.taskInstance.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
