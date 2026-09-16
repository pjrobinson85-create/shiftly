import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { JWT_SECRET, REFRESH_TOKEN_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from '../lib/config';
import { aestDate, sendBriefingForDate } from '../lib/briefing';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

function createTokens(user: { id: string; username: string | null; role: string }) {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

  return { accessToken, refreshToken, hashedToken };
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh',
  });
}

function clearRefreshCookie(res: Response) {
  res.cookie('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth/refresh',
  });
}

// Normalize a user-supplied username: trim, lowercase, collapse spaces to '-'
function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword, name, role, phone, inviteCode } =
      req.body as {
        username?: string;
        email?: string;
        password: string;
        confirmPassword?: string;
        name: string;
        role?: 'FAMILY' | 'WORKER';
        phone?: string;
        inviteCode?: string;
      };

    if (!password || !name) {
      return res.status(400).json({ error: 'Password and name are required' });
    }

    // Confirm-password check. The signup form always sends confirmPassword
    // (and the client rejects mismatches before submitting); the server
    // re-validates it when present so the match can't be bypassed via a
    // direct API call.
    if (typeof confirmPassword === 'string' && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Username is the login key — short, unique, optional at registration:
    // if omitted we derive one from the name (lowercase, letters+numbers only).
    let finalUsername = username ? normalizeUsername(username) : '';
    if (!finalUsername) {
      finalUsername = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 16);
    }
    if (!finalUsername || finalUsername.length < 2) {
      return res.status(400).json({ error: 'Please choose a short name (at least 2 characters)' });
    }
    if (!/^[a-z0-9-]+$/.test(finalUsername)) {
      return res.status(400).json({ error: 'Name may only contain letters, numbers and dashes' });
    }

    // Registration is open for workers, but FAMILY is a privileged role
    // (read access to care profiles, internal notes, incidents, calendar).
    // It can only be claimed with a valid invite code, and only if the
    // server has an invite code configured at all.
    let finalRole: 'FAMILY' | 'WORKER' = 'WORKER';
    if (role === 'FAMILY') {
      const configured = process.env.FAMILY_INVITE_CODE;
      if (!configured) {
        return res
          .status(403)
          .json({ error: 'Family accounts require an invitation code' });
      }
      const ok =
        typeof inviteCode === 'string' &&
        inviteCode.length > 0 &&
        inviteCode.length === configured.length &&
        crypto
          .timingSafeEqual(
            crypto.createHash('sha256').update(inviteCode).digest(),
            crypto.createHash('sha256').update(configured).digest()
          );
      if (!ok) {
        return res
          .status(403)
          .json({ error: 'Family accounts require a valid invitation code' });
      }
      finalRole = 'FAMILY';
    }

    const existing = await prisma.user.findUnique({ where: { username: finalUsername } });
    if (existing) {
      return res.status(400).json({ error: 'That name is already taken — pick another' });
    }

    // Email is optional contact info only — never used for login.
    // Not unique (some users may share/omit), but we avoid accidental
    // duplicate contact info when a distinct person tries the same address.
    const finalEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    if (finalEmail) {
      const emailTaken = await prisma.user.findFirst({ where: { email: finalEmail } });
      if (emailTaken) {
        return res.status(400).json({ error: 'That email is already in use' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username: finalUsername,
        email: finalEmail,
        password: hashedPassword,
        name,
        role: finalRole,
        phone,
      },
      select: { id: true, username: true, email: true, name: true, role: true, phone: true },
    });

    const { accessToken, refreshToken, hashedToken } = createTokens(user);

    await prisma.refreshToken.create({
      data: { token: hashedToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      accessToken,
      user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password: string };

    if (!username || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { username: normalizeUsername(username) } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid name or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid name or password' });
    }

    const { accessToken, refreshToken, hashedToken } = createTokens(user);

    // Revoke old refresh tokens and create new one (rotate on login)
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.create({
      data: { token: hashedToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin,
        canEditCarePlan: user.canEditCarePlan,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/refresh — exchange refresh token for new access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const record = await prisma.refreshToken.findUnique({ where: { token: hashedToken } });

    if (!record || record.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate refresh token (delete old, create new)
    await prisma.refreshToken.delete({ where: { id: record.id } });

    const { accessToken, refreshToken: newRefreshToken, hashedToken: newHashed } = createTokens(user);
    await prisma.refreshToken.create({
      data: { token: newHashed, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setRefreshCookie(res, newRefreshToken);
    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout — revoke refresh token
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await prisma.refreshToken.deleteMany({ where: { token: hashedToken } });
    }
    clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — get current user from access token
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isAdmin: true,
        canEditCarePlan: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// POST /api/auth/change-password — any authenticated user can change their own
// password. Verifies the current password, enforces the same minimum length as
// registration, and requires a new value that differs from the old one. On
// success the refresh token is rotated so any other device/session is signed
// out; the caller receives a fresh access token.
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    // Rotate the refresh token: signing out everywhere else is the safe
    // default when credentials change.
    const { accessToken, refreshToken, hashedToken } = createTokens(user);
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.create({
      data: { token: hashedToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    setRefreshCookie(res, refreshToken);

    res.json({
      message: 'Password updated',
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin,
        canEditCarePlan: user.canEditCarePlan,
      },
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/test-briefing — FAMILY-only: send the pre-shift briefing now
// (for the given AEST date, default today) so we can verify email delivery
// without waiting for the daily 07:00 schedule. Does NOT bump the
// lastBriefingSentAt stamp, so the real morning send still goes out.
router.post('/test-briefing', requireAuth, requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const date =
      typeof (req.body as { date?: string })?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((req.body as { date?: string }).date!)
        ? (req.body as { date: string }).date
        : aestDate();

    // Send without stamping lastBriefingSentAt: we don't want a manual
    // test to suppress the real daily briefing.
    const workers = await prisma.user.findMany({
      where: { role: 'WORKER' },
      select: { id: true, email: true, lastBriefingSentAt: true },
    });
    const { buildBriefing, briefingHtml } = await import('../lib/briefing');
    const { sendMail } = await import('../lib/email');
    let sent = 0;
    for (const w of workers) {
      if (!w.email) continue;
      const data = await buildBriefing(date, w.lastBriefingSentAt ?? undefined);
      await sendMail(w.email, `[test] Shiftly briefing — ${data.date}`, briefingHtml(data));
      sent++;
    }
    res.json({
      date,
      sent,
      note:
        sent === 0
          ? 'No workers with an email address — add an email at signup to receive briefings'
          : `Sent to ${sent} worker(s). SMTP must be configured for it to actually deliver.`,
    });
  } catch (error) {
    console.error('Test briefing error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
