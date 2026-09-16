import prisma from './prisma';
import { sendMail } from './email';

/**
 * Pre-shift briefing for support workers.
 * Every morning (07:00 AEST default) each WORKER with an email address gets
 * one email covering what's pertinent for the day's shift:
 *   - shift check-in/out status for that date
 *   - shift notes written for that date
 *   - tasks still open and due that day (by priority)
 *   - incidents reported that day
 *   - calendar events that day
 *   - care-profile info changed since this worker's last briefing
 *
 * Dedupe: User.lastBriefingSentAt is stamped per worker, and a worker only
 * gets one briefing per AEST day (sendBriefingForDate() checks it).
 */

const AEST = 'Australia/Brisbane';

/** AEST "YYYY-MM-DD" for the given instant (default now). */
export function aestDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AEST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface BriefingData {
  date: string;
  shift: { checkedInAt: string | null; checkedOutAt: string | null } | null;
  notes: { author: string; content: string }[];
  tasks: { title: string; priority: string; dueAt: string }[];
  incidents: { title: string; severity: string; at: string }[];
  events: { title: string; start: string; location: string | null }[];
  careProfileUpdated: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: AEST,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function buildBriefing(date: string, since?: Date): Promise<BriefingData> {
  // Shifts here are single-client: one AEST day, one shift. All "for that day"
  // queries use an explicit +10:00 (AEST) window — the server runs in AEST
  // anyway, but being explicit keeps it correct if the box's tz ever changes.
  const from = new Date(`${date}T00:00:00+10:00`);
  const to = new Date(`${date}T23:59:59+10:00`);

  const [shift, notes, tasks, incidents, events, careProfile] = await Promise.all([
    prisma.shiftSession.findUnique({ where: { shiftDate: date } }),
    prisma.shiftNote.findMany({
      where: { shiftDate: date },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.taskInstance.findMany({
      where: { completed: false, dueDate: { gte: from, lte: to } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.incident.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: 'asc' },
    }),
    prisma.calendarEvent.findMany({
      where: { startTime: { gte: from, lte: to } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.careProfile.findFirst(),
  ]);

  return {
    date,
    shift: shift
      ? {
          checkedInAt: shift.checkedInAt?.toISOString() ?? null,
          checkedOutAt: shift.checkedOutAt?.toISOString() ?? null,
        }
      : null,
    notes: notes.map((n) => ({ author: n.user.name, content: n.content })),
    tasks: tasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      dueAt: t.dueDate.toISOString(),
    })),
    incidents: incidents.map((i) => ({
      title: i.title,
      severity: i.severity,
      at: i.occurredAt.toISOString(),
    })),
    events: events.map((e) => ({
      title: e.title,
      start: e.startTime.toISOString(),
      location: e.location,
    })),
    // Care-profile changes since the recipient's last briefing (or since the
    // start of time, first time around) are the "pertinent info" that most
    // deserves a nudge — medication, preferences, contacts can change.
    careProfileUpdated: !!careProfile && (!since || careProfile.updatedAt >= since),
  };
}

export function briefingHtml(b: BriefingData): string {
  const rows: string[] = [];

  if (b.shift) {
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">Shift status</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">Checked in ${esc(fmtTime(b.shift.checkedInAt))} &middot; checked out ${esc(fmtTime(b.shift.checkedOutAt))}</td>
    </tr>`);
  } else {
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">Shift status</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">No check-in recorded yet — remember to check in when you start</td>
    </tr>`);
  }

  for (const n of b.notes) {
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">Note &middot; ${esc(n.author)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${esc(n.content)}</td>
    </tr>`);
  }

  for (const t of b.tasks) {
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(t.priority)} task</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${esc(t.title)} (due ${esc(fmtTime(t.dueAt))})</td>
    </tr>`);
  }

  for (const i of b.incidents) {
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${esc(i.severity)} incident</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${esc(i.title)} (${esc(fmtTime(i.at))})</td>
    </tr>`);
  }

  for (const e of b.events) {
    const loc = e.location ? ` &middot; ${esc(e.location)}` : '';
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">Calendar</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${esc(e.title)} (${esc(fmtTime(e.start))}${loc})</td>
    </tr>`);
  }

  if (b.careProfileUpdated) {
    rows.push(`<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">Care details</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">Updated since your last briefing — check medical info, medications and contacts in the app</td>
    </tr>`);
  }

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px 0">
  <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0f766e;padding:16px 20px">
      <div style="font-size:18px;font-weight:700;color:#ffffff">Shiftly &mdash; pre-shift briefing</div>
      <div style="font-size:13px;color:#ccfbf1;margin-top:2px">${b.date} AEST</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join('')}</table>
    <div style="padding:14px 20px;font-size:12px;color:#6b7280">
      Sent automatically by Shiftly. Check the app for photos and full details.
    </div>
  </div>
</div>
</body></html>`;
}

/**
 * Build and send the briefing for `date` to every WORKER with an email
 * address, once per AEST day per worker (stamped on lastBriefingSentAt).
 * Returns { sent, skippedNoEmail, skippedAlreadySent }.
 */
export async function sendBriefingForDate(
  date: string
): Promise<{ sent: number; skippedNoEmail: number; skippedAlreadySent: number }> {
  const workers = await prisma.user.findMany({
    where: { role: 'WORKER' },
    select: { id: true, email: true, lastBriefingSentAt: true },
  });

  let sent = 0;
  let skippedNoEmail = 0;
  let skippedAlreadySent = 0;

  for (const w of workers) {
    if (!w.email) {
      skippedNoEmail++;
      continue;
    }
    // One briefing per worker per AEST day.
    if (w.lastBriefingSentAt && aestDate(w.lastBriefingSentAt) === date) {
      skippedAlreadySent++;
      continue;
    }

    try {
      const data = await buildBriefing(date, w.lastBriefingSentAt ?? undefined);
      const { delivered } = await sendMail(
        w.email,
        `Shiftly briefing — ${data.date} (pre-shift)`,
        briefingHtml(data)
      );
      if (!delivered) {
        // SMTP not configured: don't stamp, so the briefing still goes out
        // (retroactively, once) as soon as mail is set up.
        continue;
      }
      await prisma.user.update({
        where: { id: w.id },
        data: { lastBriefingSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`[briefing] failed for ${w.email}:`, err);
    }
  }

  return { sent, skippedNoEmail, skippedAlreadySent };
}
