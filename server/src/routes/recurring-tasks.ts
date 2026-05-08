import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

interface CreateTaskBody {
  title: string;
  description?: string;
  dayOfWeek?: number;
  time?: string;
  priority?: 'NORMAL' | 'URGENT';
}

interface GenerateBody {
  startDate: string;
  endDate: string;
}

// GET /api/recurring-tasks — list all recurring task definitions
router.get('/', (_req, res) => {
  prisma.recurringTask.findMany({ orderBy: { dayOfWeek: 'asc' } })
    .then(tasks => res.json(tasks))
    .catch(err => { console.error(err); res.status(500).json({ error: 'Server error' }); });
});

// POST /api/recurring-tasks — create (FAMILY only)
router.post('/', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
   const body = req.body as { title?: string; description?: string; dayOfWeek?: number; time?: string; priority?: 'NORMAL' | 'URGENT' };
    if (!body.title) return res.status(400).json({ error: 'Title is required' });

    const task = await prisma.recurringTask.create({
      data: { title: body.title, description: body.description, dayOfWeek: body.dayOfWeek, time: body.time, priority: body.priority },
    });
    res.status(201).json(task);
  } catch (error) {
    console.error('Create recurring task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/recurring-tasks/:id — update (FAMILY only)
router.put('/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const task = await prisma.recurringTask.update({
      where: { id: req.params.id as string },
      data: req.body as Partial<CreateTaskBody>,
    });
    res.json(task);
  } catch (error) {
    console.error('Update recurring task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/recurring-tasks/:id — delete (FAMILY only)
router.delete('/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    await prisma.recurringTask.delete({ where: { id: req.params.id as string } });
    res.status(204).end();
  } catch (error) {
    console.error('Delete recurring task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recurring-tasks/generate — generate TaskInstances for a date range
router.post('/generate', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.body as GenerateBody;
    const start = new Date(startDate);
    const end = new Date(endDate);

    const recurringTasks = await prisma.recurringTask.findMany();
    const created: any[] = [];

    for (const task of recurringTasks) {
      let current = new Date(start);
      while (current <= end) {
        if (!task.dayOfWeek || current.getDay() === task.dayOfWeek!) {
          const dueDate = new Date(current);
          if (task.time) {
            const [h, m] = task.time.split(':').map(Number);
            dueDate.setHours(h, m, 0, 0);
          } else {
            dueDate.setHours(9, 0, 0, 0);
          }

          const existing = await prisma.taskInstance.count({
            where: { recurringTaskId: task.id, dueDate },
          });

          if (!existing) {
            const instance = await prisma.taskInstance.create({
              data: {
                title: task.title,
                description: task.description,
                priority: task.priority,
                dueDate,
                isRecurring: true,
                recurringTaskId: task.id,
              },
            });
            created.push(instance);
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    res.json({ count: created.length, tasks: created });
  } catch (error) {
    console.error('Generate tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
