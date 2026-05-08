import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(requireAuth);

interface CreateTaskBody {
  title: string;
  description?: string;
  dayOfWeek?: number | null;
  time?: string;
  priority?: 'NORMAL' | 'URGENT';
}

interface GenerateBody {
  startDate: string;
  endDate: string;
}

// GET /api/recurring-tasks — list all recurring task definitions
router.get('/', (_req, res) => {
  prisma.recurringTask
    .findMany({ orderBy: [{ dayOfWeek: 'asc' }, { time: 'asc' }] })
    .then(tasks => res.json(tasks))
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    });
});

// POST /api/recurring-tasks — create (FAMILY only)
router.post('/', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as CreateTaskBody;
    if (!body.title) return res.status(400).json({ error: 'Title is required' });

    const task = await prisma.recurringTask.create({
      data: {
        title: body.title,
        description: body.description,
        // Explicitly allow null (every day) vs a specific day number
        dayOfWeek: body.dayOfWeek ?? null,
        time: body.time,
        priority: body.priority ?? 'NORMAL',
      },
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
    const body = req.body as Partial<CreateTaskBody>;
    const task = await prisma.recurringTask.update({
      where: { id: req.params.id as string },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.dayOfWeek !== undefined && { dayOfWeek: body.dayOfWeek }),
        ...(body.time !== undefined && { time: body.time }),
        ...(body.priority !== undefined && { priority: body.priority }),
      },
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

// POST /api/recurring-tasks/generate — generate TaskInstances for a date range (FAMILY only)
// NOTE: This route must be registered BEFORE /:id to avoid Express matching "generate" as an id.
router.post('/generate', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.body as GenerateBody;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    const recurringTasks = await prisma.recurringTask.findMany();

    // Build the full list of (taskId, dueDate) pairs we want to create
    const candidates: { recurringTaskId: string; dueDate: Date; title: string; description?: string | null; priority: 'NORMAL' | 'URGENT' }[] = [];

    for (const task of recurringTasks) {
      let current = new Date(start);
      while (current <= end) {
        // FIX: use === null check so dayOfWeek 0 (Sunday) is not treated as "every day"
        const matchesDay = task.dayOfWeek === null || current.getDay() === task.dayOfWeek;

        if (matchesDay) {
          const dueDate = new Date(current);
          if (task.time) {
            const [h, m] = task.time.split(':').map(Number);
            dueDate.setHours(h, m, 0, 0);
          } else {
            dueDate.setHours(9, 0, 0, 0);
          }
          candidates.push({
            recurringTaskId: task.id,
            dueDate,
            title: task.title,
            description: task.description,
            priority: task.priority,
          });
        }

        current.setDate(current.getDate() + 1);
      }
    }

    if (candidates.length === 0) {
      return res.json({ count: 0, tasks: [] });
    }

    // FIX: Fetch all existing instances for the range in one query, then skip duplicates in memory
    // rather than issuing N×D individual count queries.
    const recurringTaskIds = [...new Set(candidates.map(c => c.recurringTaskId))];
    const existingInstances = await prisma.taskInstance.findMany({
      where: {
        recurringTaskId: { in: recurringTaskIds },
        dueDate: { gte: start, lte: end },
      },
      select: { recurringTaskId: true, dueDate: true },
    });

    // Build a Set of "recurringTaskId|isoDate" for O(1) lookup
    const existingKeys = new Set(
      existingInstances.map(e => `${e.recurringTaskId}|${e.dueDate.toISOString()}`)
    );

    const toCreate = candidates.filter(
      c => !existingKeys.has(`${c.recurringTaskId}|${c.dueDate.toISOString()}`)
    );

    if (toCreate.length === 0) {
      return res.json({ count: 0, tasks: [] });
    }

    await prisma.taskInstance.createMany({
      data: toCreate.map(c => ({
        title: c.title,
        description: c.description,
        priority: c.priority,
        dueDate: c.dueDate,
        isRecurring: true,
        recurringTaskId: c.recurringTaskId,
      })),
    });

    // Return the created count (createMany doesn't return records in all DBs)
    res.json({ count: toCreate.length, tasks: [] });
  } catch (error) {
    console.error('Generate tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
