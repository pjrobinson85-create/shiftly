import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { logAudit } from '../lib/audit';
import { sendAlert } from '../lib/telegram';
import { getSocket } from '../lib/socket';

const router = Router();

router.use(requireAuth);

const TASK_INCLUDE = {
  createdBy: { select: { id: true, name: true, role: true } },
  completedBy: { select: { id: true, name: true, role: true } },
  assignedTo: { select: { id: true, name: true, role: true } },
} as const;

// GET /api/tasks — list tasks for a date (default: today)
// Optional: ?assignedToMe=true → only tasks assigned to (or unassigned) this user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) {
      return res.status(400).json({ error: 'Invalid date, expected YYYY-MM-DD' });
    }
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59);

    const where: Record<string, unknown> = { dueDate: { gte: startOfDay, lte: endOfDay } };
    if (req.query.assignedToMe === 'true') {
      where.OR = [{ assignedToId: req.user!.id }, { assignedToId: null }];
    }

    const tasks = await prisma.taskInstance.findMany({
      where,
      include: TASK_INCLUDE,
      // 'desc' puts URGENT before NORMAL (alphabetical descending)
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });

    res.json(tasks);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks — create an ad-hoc task (FAMILY only)
router.post('/', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      title: string;
      description?: string;
      priority?: 'NORMAL' | 'URGENT';
      dueDate: string;
      assignedToId?: string;
    };

    if (!body.title) return res.status(400).json({ error: 'Title is required' });
    if (!body.dueDate) return res.status(400).json({ error: 'dueDate is required' });
    const dueDate = new Date(body.dueDate);
    if (isNaN(dueDate.getTime())) return res.status(400).json({ error: 'dueDate is invalid' });

    if (body.assignedToId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assignedToId } });
      if (!assignee) return res.status(400).json({ error: 'assignedToId does not reference a user' });
    }

    const task = await prisma.taskInstance.create({
      data: {
        title: body.title,
        description: body.description,
        priority: body.priority ?? 'NORMAL',
        dueDate,
        isRecurring: false,
        createdById: req.user!.id,
        assignedToId: body.assignedToId,
      },
      include: TASK_INCLUDE,
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'task.created',
        entity: 'task',
        entityId: task.id,
        detail: `Created "${task.title}" (due ${dueDate.toISOString()}, ${task.priority})`,
      },
      req
    );    getSocket().to('WORKER').emit('task:created', task);

    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/assign — assign/unassign a task (FAMILY only)
router.patch('/:id/assign', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const { assignedToId } = req.body as { assignedToId?: string | null };

    if (assignedToId) {
      const assignee = await prisma.user.findUnique({ where: { id: assignedToId } });
      if (!assignee) return res.status(400).json({ error: 'assignedToId does not reference a user' });
    }

    const task = await prisma.taskInstance.update({
      where: { id: req.params.id as string },
      data: { assignedToId: assignedToId ?? null },
      include: TASK_INCLUDE,
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'task.assigned',
        entity: 'task',
        entityId: task.id,
        detail: task.assignedTo ? `Assigned "${task.title}" to ${task.assignedTo.name}` : `Unassigned "${task.title}"`,
      },
      req
    );    getSocket().to('WORKER').emit('task:updated', task);

    res.json(task);
  } catch (error) {
    console.error('Assign task error:', error);
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
      include: TASK_INCLUDE,
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'task.completed',
        entity: 'task',
        entityId: task.id,
        detail: `Completed "${task.title}"`,
      },
      req
    );

    // URGENT task completed → ping the family so they know it's handled
    if (task.priority === 'URGENT') {
      void sendAlert(
        `✅ <b>Urgent task completed</b>\n${task.title}\nby ${req.user!.email} · ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}`
      );
    }    getSocket().emit('task:completed', task);

    res.json(task);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/uncomplete — undo a completion (handy for mistakes)
router.patch('/:id/uncomplete', async (req: AuthRequest, res) => {
  try {
    const task = await prisma.taskInstance.update({
      where: { id: req.params.id as string },
      data: {
        completed: false,
        completedAt: null,
        completedById: null,
      },
      include: TASK_INCLUDE,
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'task.uncompleted',
        entity: 'task',
        entityId: task.id,
        detail: `Reopened "${task.title}"`,
      },
      req
    );    getSocket().emit('task:updated', task);

    res.json(task);
  } catch (error) {
    console.error('Uncomplete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id — delete task (FAMILY only)
router.delete('/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.taskInstance.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    await prisma.taskInstance.delete({ where: { id: req.params.id as string } });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'task.deleted',
        entity: 'task',
        entityId: existing.id,
        detail: `Deleted "${existing.title}"`,
      },
      req
    );    getSocket().emit('task:deleted', { id: existing.id });

    res.status(204).end();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
