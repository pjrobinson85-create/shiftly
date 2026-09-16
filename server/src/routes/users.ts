import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole, requireAdmin } from '../middleware/auth';
import prisma from '../lib/prisma';
import { logAudit } from '../lib/audit';

const router = Router();
router.use(requireAuth);

// GET /api/users — user list for the assignee picker (FAMILY only)
router.get('/', requireRole('FAMILY'), async (_req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        phone: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/admin — full user list incl. permission flags (admin only)
router.get('/admin', requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        phone: true,
        isAdmin: true,
        canEditCarePlan: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (error) {
    console.error('List users (admin) error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/:id — update role / permissions / contact (admin only)
// Body: { role?: 'FAMILY'|'WORKER', isAdmin?: boolean, canEditCarePlan?: boolean, email?, phone? }
router.patch('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const body = req.body as {
      role?: string;
      isAdmin?: boolean;
      canEditCarePlan?: boolean;
      email?: string | null;
      phone?: string | null;
    };

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const data: Record<string, unknown> = {};
    if (body.role !== undefined) {
      if (body.role !== 'FAMILY' && body.role !== 'WORKER') {
        return res.status(400).json({ error: 'role must be FAMILY or WORKER' });
      }
      data.role = body.role;
    }
    if (typeof body.isAdmin === 'boolean') data.isAdmin = body.isAdmin;
    if (typeof body.canEditCarePlan === 'boolean') data.canEditCarePlan = body.canEditCarePlan;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;

    // Self-demotion guard: an admin can't revoke their own admin flag
    // (would lock the panel out with no one left able to fix it).
    if (target.id === req.user!.id && data.isAdmin === false) {
      return res.status(400).json({ error: 'You cannot remove your own admin access' });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        phone: true,
        isAdmin: true,
        canEditCarePlan: true,
      },
    });

    await logAudit(
      {
        userId: req.user!.id,
        action: 'user.updated',
        entity: 'user',
        entityId: id,
        detail: `Updated ${target.username || target.name}: ${Object.keys(data).join(', ')}`,
      },
      req
    );

    res.json(updated);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
