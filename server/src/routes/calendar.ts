import { Router } from 'express';
import { google } from 'googleapis';
import prisma from '../lib/prisma';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import {
  createCalendarOAuthState,
  getCalendarAuthFailure,
  openCalendarRefreshToken,
  sanitizeCalendarRedirectPath,
  sealCalendarRefreshToken,
  verifyCalendarOAuthState,
} from '../lib/calendar-oauth';
import { REFRESH_TOKEN_SECRET } from '../lib/config';

const router = Router();

function getOauth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback'
  );
}

function getRequiredGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

function buildRedirectUrl(path: string, params: Record<string, string>) {
  const redirect = new URL(path, 'https://shiftly.local');
  for (const [key, value] of Object.entries(params)) {
    redirect.searchParams.set(key, value);
  }
  return `${redirect.pathname}${redirect.search}${redirect.hash}`;
}

async function upsertCalendarRefreshToken(refreshToken: string, userId: string) {
  await prisma.calendarConnection.upsert({
    where: { provider: 'google-calendar' },
    update: {
      refreshTokenEncrypted: sealCalendarRefreshToken(refreshToken, REFRESH_TOKEN_SECRET),
      connectedByUserId: userId,
    },
    create: {
      provider: 'google-calendar',
      refreshTokenEncrypted: sealCalendarRefreshToken(refreshToken, REFRESH_TOKEN_SECRET),
      connectedByUserId: userId,
    },
  });
}

async function clearStoredCalendarRefreshToken() {
  await prisma.calendarConnection.deleteMany({ where: { provider: 'google-calendar' } });
}

async function getStoredCalendarRefreshToken() {
  const connection = await prisma.calendarConnection.findUnique({
    where: { provider: 'google-calendar' },
  });

  if (!connection) {
    return null;
  }

  return openCalendarRefreshToken(connection.refreshTokenEncrypted, REFRESH_TOKEN_SECRET);
}

async function syncGoogleCalendarEvents(oauth2Client: ReturnType<typeof getOauth2Client>) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: new Date().toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  let created = 0;
  let updated = 0;

  for (const event of events) {
    if (!event.id || !event.summary) continue;

    const data = {
      title: event.summary,
      startTime: new Date(event.start?.dateTime || event.start?.date || new Date()),
      endTime: event.end?.dateTime ? new Date(event.end.dateTime) : null,
      description: event.description || null,
      location: event.location || null,
    };

    const existing = await prisma.calendarEvent.findUnique({
      where: { googleId: event.id },
    });

    if (existing) {
      await prisma.calendarEvent.update({
        where: { googleId: event.id },
        data,
      });
      updated++;
    } else {
      await prisma.calendarEvent.create({
        data: {
          googleId: event.id,
          ...data,
        },
      });
      created++;
    }
  }

  return { created, updated, total: events.length };
}

// GET /api/calendar/events — list synced calendar events (optionally filter by date)
router.get('/events', requireAuth, async (req: AuthRequest, res) => {
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
router.get('/auth-url', requireAuth, requireRole('FAMILY'), (req: AuthRequest, res) => {
  const config = getRequiredGoogleConfig();
  if (!config) {
    return res.status(503).json({ error: 'Google Calendar OAuth is not configured on the server' });
  }

  const oauth2Client = getOauth2Client();
  const state = createCalendarOAuthState({
    userId: req.user!.id,
    redirectPath: sanitizeCalendarRedirectPath(req.query.redirect as string | undefined),
    secret: REFRESH_TOKEN_SECRET,
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    prompt: 'consent',
    include_granted_scopes: true,
    state,
  });
  res.json({ authUrl: url });
});

// GET /api/calendar/callback — OAuth callback from Google
router.get('/callback', async (req: AuthRequest, res) => {
  const verifiedState = verifyCalendarOAuthState(req.query.state as string | undefined, {
    secret: REFRESH_TOKEN_SECRET,
  });

  const fallbackRedirect = sanitizeCalendarRedirectPath();
  if (!verifiedState) {
    return res.redirect(302, buildRedirectUrl(fallbackRedirect, {
      calendarStatus: 'error',
      calendarMessage: 'Invalid or expired calendar connection request.',
    }));
  }

  try {
    const code = req.query.code as string | undefined;
    if (!code) {
      return res.redirect(302, buildRedirectUrl(verifiedState.redirectPath, {
        calendarStatus: 'error',
        calendarMessage: 'Missing Google authorization code.',
      }));
    }

    const config = getRequiredGoogleConfig();
    if (!config) {
      return res.redirect(302, buildRedirectUrl(verifiedState.redirectPath, {
        calendarStatus: 'error',
        calendarMessage: 'Google Calendar OAuth is not configured on the server.',
      }));
    }

    const oauth2Client = getOauth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (tokens.refresh_token) {
      await upsertCalendarRefreshToken(tokens.refresh_token, verifiedState.userId);
    } else {
      const existingToken = await getStoredCalendarRefreshToken();
      if (!existingToken) {
        return res.redirect(302, buildRedirectUrl(verifiedState.redirectPath, {
          calendarStatus: 'error',
          calendarMessage: 'Google did not return a refresh token. Reconnect and approve offline access.',
        }));
      }
    }

    const syncResult = await syncGoogleCalendarEvents(oauth2Client);
    return res.redirect(302, buildRedirectUrl(verifiedState.redirectPath, {
      calendarStatus: 'connected',
      eventsSynced: String(syncResult.total),
    }));
  } catch (error) {
    console.error('Calendar callback error:', error);
    return res.redirect(302, buildRedirectUrl(verifiedState.redirectPath, {
      calendarStatus: 'error',
      calendarMessage: 'Failed to connect Google Calendar.',
    }));
  }
});

// POST /api/calendar/sync — manually trigger sync (FAMILY only)
router.post('/sync', requireAuth, requireRole('FAMILY'), async (_req: AuthRequest, res) => {
  try {
    const config = getRequiredGoogleConfig();
    if (!config) {
      return res.status(503).json({ error: 'Google Calendar OAuth is not configured on the server' });
    }

    const refreshToken = await getStoredCalendarRefreshToken() || process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No Google Calendar connection found. Connect Google Calendar first.' });
    }

    const oauth2Client = getOauth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: credentials.access_token ?? undefined,
      expiry_date: credentials.expiry_date ?? undefined,
      token_type: credentials.token_type ?? undefined,
      scope: credentials.scope ?? undefined,
    });

    const syncResult = await syncGoogleCalendarEvents(oauth2Client);
    res.json({ synced: true, ...syncResult });
  } catch (error) {
    const failure = getCalendarAuthFailure(error);
    if (failure.shouldClearStoredToken) {
      await clearStoredCalendarRefreshToken();
    }
    console.error('Calendar sync error:', error);
    res.status(failure.status).json({ error: failure.message });
  }
});

export default router;
