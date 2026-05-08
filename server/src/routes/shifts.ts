import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

router.use(requireAuth);

function parseDate(dateStr: string): [Date, Date] {
  const [year, month, day] = dateStr.split('-').map(Number);
  return [
    new Date(year, month - 1, day, 0, 0, 0),
    new Date(year, month - 1, day, 23, 59, 59),
  ];
}

// GET /api/shifts/:date — full shift summary for a date
router.get('/:date', async (req: AuthRequest, res) => {
  try {
    const [startOfDay, endOfDay] = parseDate(req.params.date as string);

    const [tasks, calendarEvents, shiftNotes] = await Promise.all([
      prisma.taskInstance.findMany({
        where: { dueDate: { gte: startOfDay, lte: endOfDay } },
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          completedBy: { select: { id: true, name: true, role: true } },
        },
        // FIX: 'desc' puts URGENT before NORMAL
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      }),
      prisma.calendarEvent.findMany({
        where: { startTime: { gte: startOfDay, lte: endOfDay } },
        orderBy: { startTime: 'asc' },
      }),
      prisma.shiftNote.findMany({
        where: { shiftDate: { gte: startOfDay, lte: endOfDay } },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      date: req.params.date,
      tasks: {
        total: tasks.length,
        completed: tasks.filter(t => t.completed).length,
        pending: tasks.filter(t => !t.completed).length,
        list: tasks,
      },
      calendarEvents,
      shiftNotes,
    });
  } catch (error) {
    console.error('Shift summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shifts/:date/notes — add a shift note
router.post('/:date/notes', async (req: AuthRequest, res) => {
  try {
    const [startOfDay] = parseDate(req.params.date as string);
    const { content } = req.body as { content: string };

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const note = await prisma.shiftNote.create({
      data: {
        content: content.trim(),
        shiftDate: startOfDay,
        photos: [],
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    const { io } = await import('../index');
    io.emit('note:created', note);

    res.status(201).json(note);
  } catch (error) {
    console.error('Create shift note error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
