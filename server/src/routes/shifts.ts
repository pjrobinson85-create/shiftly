import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getSocket } from '../lib/socket';
import {
  canCheckIn,
  canCheckOut,
  deriveShiftStatus,
  normalizeShiftPhotos,
  validateCheckoutNote,
} from '../lib/shift-session';

const router = Router();

router.use(requireAuth);

// M5: shift keys are AEST calendar dates "YYYY-MM-DD" (the app's timezone,
// pinned in vitest.config.ts / the systemd unit). Stored as TEXT so one
// shift-day = one row, unambiguously, regardless of host/DB timezone.
const aestDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Brisbane',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parseDateKey(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw Object.assign(new Error('Invalid date, expected YYYY-MM-DD'), { status: 400 });
  }
  return dateStr;
}

// M5: AEST window for one shift-day: [dateKey 00:00 +10:00, next day 00:00 +10:00).
function aestWindow(dateKey: string): [Date, Date] {
  const start = new Date(`${dateKey}T00:00:00+10:00`);
  return [start, new Date(start.getTime() + 24 * 3600 * 1000)];
}

async function getOrCreateShiftSession(dateKey: string) {
  return prisma.shiftSession.upsert({
    where: { shiftDate: dateKey },
    update: {},
    create: { shiftDate: dateKey },
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
    const dateKey = parseDateKey(req.params.date as string);
    const [startOfDay, endOfDay] = aestWindow(dateKey);

    const [tasks, calendarEvents, shiftNotes, shiftSession] = await Promise.all([
      prisma.taskInstance.findMany({
        where: { dueDate: { gte: startOfDay, lt: endOfDay } },
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          completedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      }),
      prisma.calendarEvent.findMany({
        where: { startTime: { gte: startOfDay, lt: endOfDay } },
        orderBy: { startTime: 'asc' },
      }),
      prisma.shiftNote.findMany({
        where: { shiftDate: dateKey },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      getOrCreateShiftSession(dateKey),
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
    const dateKey = parseDateKey(req.params.date as string);
    const existing = await getOrCreateShiftSession(dateKey);

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
    const dateKey = parseDateKey(req.params.date as string);
    const existing = await getOrCreateShiftSession(dateKey);

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
          shiftDate: dateKey,
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

    getSocket().emit('note:created', note);
    getSocket().emit('shift:updated', toShiftSessionSummary(shiftSession));

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
    const dateKey = parseDateKey(req.params.date as string);
    const content = validateCheckoutNote((req.body as { content?: string }).content);
    const photos = normalizeShiftPhotos((req.body as { photos?: unknown }).photos);

    if (!content) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const note = await prisma.shiftNote.create({
      data: {
        content,
        shiftDate: dateKey,
        photos,
        userId: req.user!.id,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    getSocket().emit('note:created', note);

    res.status(201).json(note);
  } catch (error) {
    console.error('Create shift note error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
