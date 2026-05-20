import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import {
  canCheckIn,
  canCheckOut,
  deriveShiftStatus,
  normalizeShiftPhotos,
  validateCheckoutNote,
} from '../lib/shift-session';

const router = Router();

router.use(requireAuth);

function parseDate(dateStr: string): [Date, Date] {
  const [year, month, day] = dateStr.split('-').map(Number);
  return [
    new Date(year, month - 1, day, 0, 0, 0),
    new Date(year, month - 1, day, 23, 59, 59),
  ];
}

async function getOrCreateShiftSession(date: Date) {
  return prisma.shiftSession.upsert({
    where: { shiftDate: date },
    update: {},
    create: { shiftDate: date },
    include: {
      checkedInBy: { select: { id: true, name: true, role: true } },
      checkedOutBy: { select: { id: true, name: true, role: true } },
    },
  });
}

function toShiftSessionSummary(session: Awaited<ReturnType<typeof getOrCreateShiftSession>>) {
  return {
    id: session.id,
    shiftDate: session.shiftDate,
    checkedInAt: session.checkedInAt,
    checkedOutAt: session.checkedOutAt,
    checkedInBy: session.checkedInBy,
    checkedOutBy: session.checkedOutBy,
    status: deriveShiftStatus({
      checkedInAt: session.checkedInAt,
      checkedOutAt: session.checkedOutAt,
    }),
  };
}

// GET /api/shifts/:date — full shift summary for a date
router.get('/:date', async (req: AuthRequest, res) => {
  try {
    const [startOfDay, endOfDay] = parseDate(req.params.date as string);

    const [tasks, calendarEvents, shiftNotes, shiftSession] = await Promise.all([
      prisma.taskInstance.findMany({
        where: { dueDate: { gte: startOfDay, lte: endOfDay } },
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          completedBy: { select: { id: true, name: true, role: true } },
        },
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
      getOrCreateShiftSession(startOfDay),
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
      shiftSession: toShiftSessionSummary(shiftSession),
    });
  } catch (error) {
    console.error('Shift summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shifts/:date/check-in — worker starts the shift
router.post('/:date/check-in', requireRole('WORKER'), async (req: AuthRequest, res) => {
  try {
    const [startOfDay] = parseDate(req.params.date as string);
    const existing = await getOrCreateShiftSession(startOfDay);

    if (!canCheckIn({ checkedInAt: existing.checkedInAt, checkedOutAt: existing.checkedOutAt })) {
      return res.status(409).json({ error: 'Shift has already been checked in' });
    }

    const shiftSession = await prisma.shiftSession.update({
      where: { id: existing.id },
      data: {
        checkedInAt: new Date(),
        checkedInById: req.user!.id,
        checkedOutAt: null,
        checkedOutById: null,
      },
      include: {
        checkedInBy: { select: { id: true, name: true, role: true } },
        checkedOutBy: { select: { id: true, name: true, role: true } },
      },
    });

    res.status(201).json({ shiftSession: toShiftSessionSummary(shiftSession) });
  } catch (error) {
    console.error('Shift check-in error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shifts/:date/check-out — worker ends the shift and leaves a handover note
router.post('/:date/check-out', requireRole('WORKER'), async (req: AuthRequest, res) => {
  try {
    const [startOfDay] = parseDate(req.params.date as string);
    const existing = await getOrCreateShiftSession(startOfDay);

    if (!canCheckOut({ checkedInAt: existing.checkedInAt, checkedOutAt: existing.checkedOutAt })) {
      return res.status(409).json({ error: 'Shift must be checked in before checkout' });
    }

    const content = validateCheckoutNote((req.body as { content?: string }).content);
    if (!content) {
      return res.status(400).json({ error: 'Checkout note is required' });
    }

    const photos = normalizeShiftPhotos((req.body as { photos?: unknown }).photos);

    const [note, shiftSession] = await prisma.$transaction([
      prisma.shiftNote.create({
        data: {
          content,
          photos,
          shiftDate: startOfDay,
          userId: req.user!.id,
        },
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      prisma.shiftSession.update({
        where: { id: existing.id },
        data: {
          checkedOutAt: new Date(),
          checkedOutById: req.user!.id,
        },
        include: {
          checkedInBy: { select: { id: true, name: true, role: true } },
          checkedOutBy: { select: { id: true, name: true, role: true } },
        },
      }),
    ]);

    const { io } = await import('../index');
    io.emit('note:created', note);
    io.emit('shift:updated', toShiftSessionSummary(shiftSession));

    res.status(201).json({
      shiftSession: toShiftSessionSummary(shiftSession),
      note,
    });
  } catch (error) {
    console.error('Shift checkout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shifts/:date/notes — add a shift note outside checkout
router.post('/:date/notes', async (req: AuthRequest, res) => {
  try {
    const [startOfDay] = parseDate(req.params.date as string);
    const content = validateCheckoutNote((req.body as { content?: string }).content);
    const photos = normalizeShiftPhotos((req.body as { photos?: unknown }).photos);

    if (!content) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const note = await prisma.shiftNote.create({
      data: {
        content,
        shiftDate: startOfDay,
        photos,
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
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
