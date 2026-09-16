import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/config';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    // Permission flags live in the DB, not the JWT — fetch via getUserPermissions().
    // Populated on demand by requireAdmin / the care-profile gate.
    isAdmin?: boolean;
    canEditCarePlan?: boolean;
  };
}

// Require authentication
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      username: string;
      role: string;
    };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Require specific role(s)
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Fetch live permission flags (tokens intentionally don't carry them, so
// changes made in the admin panel take effect immediately, not at re-login).
export async function getUserPermissions(id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { isAdmin: true, canEditCarePlan: true },
  });
  return u ?? { isAdmin: false, canEditCarePlan: false };
}

// Async middleware: admin panel access.
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const perms = await getUserPermissions(req.user.id);
    if (!perms.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = { ...req.user, ...perms };
    next();
  } catch (error) {
    console.error('requireAdmin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
