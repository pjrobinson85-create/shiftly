import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

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

// GET /api/calendar/auth-url — get Google OAuth consent URL (FAMILY only)
router.get('/auth-url', requireRole('FAMILY'), (_req: AuthRequest, res) => {
  const oauth2Client = getOauth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
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

    // Store refresh token in env-safe way (for now, log it; in production, store in DB)
    console.log('Google Calendar refresh token:', tokens.refresh_token);

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

    res.json({
      connected: true,
      refreshToken: tokens.refresh_token,
      eventsSynced: syncedCount,
    });
  } catch (error) {
    console.error('Calendar callback error:', error);
    res.status(500).json({ error: 'Failed to connect Google Calendar' });
  }
});

// POST /api/calendar/sync — manually trigger sync (FAMILY only)
router.post('/sync', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || (req.body as any).refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token configured. Set GOOGLE_REFRESH_TOKEN in .env or pass in request body.' });
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

    res.json({ synced: true, created, updated, total: events.length });
  } catch (error) {
    console.error('Calendar sync error:', error);
    res.status(500).json({ error: 'Sync failed', details: String(error) });
  }
});

export default router;
