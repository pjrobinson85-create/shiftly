import { Router } from 'express';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';

const router = Router();

// Refresh token storage: server/.google-oauth.json (0600 perms, gitignored).
// Written by the OAuth callback; never returned to clients or logged.
const CRED_FILE = path.resolve(process.cwd(), '.google-oauth.json');

function readStoredCreds(): { refresh_token?: string } | null {
  try {
    return JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function storeCreds(tokens: { refresh_token?: string | null }): void {
  if (!tokens.refresh_token) return;
  fs.writeFileSync(CRED_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log('[calendar] Google credentials stored (refresh token kept out of logs/responses)');
}

router.use(requireAuth);

// Build OAuth2 client from env vars
function getOauth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback'
  );
}

// GET /api/calendar/events — list synced calendar events (optionally filter by date)
router.get('/events', async (req: AuthRequest, res) => {
  try {
    const where: any = {};
    if (req.query.date) {
      const [year, month, day] = (req.query.date as string).split('-').map(Number);
      where.startTime = {
        gte: new Date(year, month - 1, day),
        lte: new Date(year, month - 1, day + 1),
      };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });
    res.json(events);
  } catch (error) {
    console.error('List calendar events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/calendar/status — is Google Calendar connected? (FAMILY only)
router.get('/status', requireRole('FAMILY'), (_req: AuthRequest, res) => {
  const stored = readStoredCreds();
  res.json({ connected: Boolean(stored?.refresh_token) });
});

// GET /api/calendar/auth-url — get Google OAuth consent URL (FAMILY only)
router.get('/auth-url', requireRole('FAMILY'), (_req: AuthRequest, res) => {
  const oauth2Client = getOauth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    // Scope #40: narrow to events.readonly only (not full calendar.readonly)
    scope: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    prompt: 'consent', // forces refresh token on first consent
  });
  res.json({ authUrl: url });
});

// GET /api/calendar/callback — OAuth callback (FAMILY only)
router.get('/callback', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const code = req.query.code as string;
    if (!code) return res.status(400).json({ error: 'No authorization code' });

    const oauth2Client = getOauth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // FIX #40: persist refresh token to a 0600 file — never log it, never
    // echo it back to the client.
    storeCreds(tokens);

    // Immediately sync on first connect
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const res_google = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res_google.data.items || [];
    let syncedCount = 0;

    for (const event of events) {
      if (!event.id || !event.summary) continue;

      const existing = await prisma.calendarEvent.findUnique({
        where: { googleId: event.id },
      });

      if (!existing) {
        await prisma.calendarEvent.create({
          data: {
            googleId: event.id,
            title: event.summary,
            startTime: new Date(event.start?.dateTime || event.start?.date || new Date()),
            endTime: event.end?.dateTime ? new Date(event.end.dateTime) : null,
            description: event.description || null,
            location: event.location || null,
          },
        });
        syncedCount++;
      } else {
        await prisma.calendarEvent.update({
          where: { googleId: event.id },
          data: {
            title: event.summary,
            startTime: new Date(event.start?.dateTime || event.start?.date || new Date()),
            endTime: event.end?.dateTime ? new Date(event.end.dateTime) : null,
            description: event.description || null,
            location: event.location || null,
          },
        });
      }
    }

    await logAudit(
      {
        userId: req.user!.id,
        action: 'calendar.connected',
        entity: 'calendar',
        detail: `Connected Google Calendar, synced ${syncedCount} new event(s)`,
      },
      req
    );

    // FIX #40: never return the refresh token to the client.
    res.json({
      connected: true,
      eventsSynced: syncedCount,
    });
  } catch (error) {
    console.error('Calendar callback error:', error);
    res.status(500).json({ error: 'Failed to connect Google Calendar' });
  }
});

// POST /api/calendar/events — manually add a calendar event (FAMILY or admin).
// Stored with googleId null; Google sync never touches manual events.
router.post('/events', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      title?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      location?: string;
    };

    if (!body.title?.trim()) return res.status(400).json({ error: 'Event title is required' });
    if (!body.startTime) return res.status(400).json({ error: 'startTime is required' });

    const start = new Date(body.startTime);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'startTime is invalid' });
    const end = body.endTime ? new Date(body.endTime) : null;
    if (end && isNaN(end.getTime())) return res.status(400).json({ error: 'endTime is invalid' });
    if (end && end < start) return res.status(400).json({ error: 'endTime must be after startTime' });

    const event = await prisma.calendarEvent.create({
      data: {
        googleId: null,
        title: body.title.trim(),
        startTime: start,
        endTime: end,
        description: body.description?.trim() || null,
        location: body.location?.trim() || null,
      },
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'calendar.manual_created',
        entity: 'calendar',
        entityId: event.id,
        detail: `Manually added "${event.title}" at ${start.toISOString()}`,
      },
      req
    );

    res.status(201).json(event);
  } catch (error) {
    console.error('Create calendar event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/calendar/events/:id — manually update an event (FAMILY or admin)
router.put('/events/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.calendarEvent.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const body = req.body as {
      title?: string;
      startTime?: string;
      endTime?: string;
      description?: string | null;
      location?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (!body.title.trim()) return res.status(400).json({ error: 'Event title is required' });
      data.title = body.title.trim();
    }
    if (body.startTime !== undefined) {
      const d = new Date(body.startTime);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'startTime is invalid' });
      data.startTime = d;
    }
    if (body.endTime !== undefined) {
      data.endTime = body.endTime ? new Date(body.endTime) : null;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.location !== undefined) data.location = body.location?.trim() || null;

    const updated = await prisma.calendarEvent.update({
      where: { id: existing.id },
      data,
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'calendar.manual_updated',
        entity: 'calendar',
        entityId: updated.id,
        detail: `Updated "${updated.title}": ${Object.keys(data).join(', ')}`,
      },
      req
    );

    res.json(updated);
  } catch (error) {
    console.error('Update calendar event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/calendar/events/:id — manually remove an event (FAMILY or admin)
router.delete('/events/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.calendarEvent.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    await prisma.calendarEvent.delete({ where: { id: existing.id } });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'calendar.manual_deleted',
        entity: 'calendar',
        entityId: existing.id,
        detail: `Deleted "${existing.title}"`,
      },
      req
    );

    res.status(204).end();
  } catch (error) {
    console.error('Delete calendar event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/calendar/sync — manually trigger sync (FAMILY only)
router.post('/sync', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    // FIX #40: prefer the stored credential file; env var remains as fallback.
    const stored = readStoredCreds();
    const refreshToken = stored?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      return res
        .status(400)
        .json({ error: 'Google Calendar is not connected. You can still add events manually with "Add event".' });
    }

    const oauth2Client = getOauth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Refresh the access token if needed
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const timeMin = new Date().toISOString();
    const res_google = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res_google.data.items || [];
    let created = 0;
    let updated = 0;

    for (const event of events) {
      if (!event.id || !event.summary) continue;

      const existing = await prisma.calendarEvent.findUnique({
        where: { googleId: event.id },
      });

      if (existing) {
        await prisma.calendarEvent.update({
          where: { googleId: event.id },
          data: {
            title: event.summary,
            startTime: new Date(event.start?.dateTime || event.start?.date || new Date()),
            endTime: event.end?.dateTime ? new Date(event.end.dateTime) : null,
            description: event.description || null,
            location: event.location || null,
          },
        });
        updated++;
      } else {
        await prisma.calendarEvent.create({
          data: {
            googleId: event.id,
            title: event.summary,
            startTime: new Date(event.start?.dateTime || event.start?.date || new Date()),
            endTime: event.end?.dateTime ? new Date(event.end.dateTime) : null,
            description: event.description || null,
            location: event.location || null,
          },
        });
        created++;
      }
    }

    await logAudit(
      {
        userId: req.user!.id,
        action: 'calendar.synced',
        entity: 'calendar',
        detail: `Calendar sync: ${created} new, ${updated} updated, ${events.length} total`,
      },
      req
    );

    res.json({ synced: true, created, updated, total: events.length });
  } catch (error) {
    console.error('Calendar sync error:', (error as Error).message);
    res.status(500).json({ error: 'Sync failed — check the Google Calendar connection' });
  }
});

export default router;
