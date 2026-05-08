import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { JWT_SECRET, REFRESH_TOKEN_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from '../lib/config';

const router = Router();

function createTokens(user: { id: string; email: string; role: string }) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
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

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone } = req.body as {
      email: string;
      password: string;
      name: string;
      role?: 'FAMILY' | 'WORKER';
      phone?: string;
    };

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role ?? 'WORKER',
        phone,
      },
      select: { id: true, email: true, name: true, role: true, phone: true },
    });

    const { accessToken, refreshToken, hashedToken } = createTokens(user);

    await prisma.refreshToken.create({
      data: { token: hashedToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
      select: { id: true, email: true, name: true, role: true, phone: true },
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

export default router;
