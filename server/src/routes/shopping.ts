import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/shopping — list all shopping lists with items
router.get('/', async (_req: AuthRequest, res) => {
  try {
    const lists = await prisma.shoppingList.findMany({
      include: {
        items: {
          include: { addedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(lists);
  } catch (error) {
    console.error('List shopping lists error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shopping — create a shopping list (FAMILY only)
router.post('/', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as { name?: string; category?: string; isRecurring?: boolean };
    const list = await prisma.shoppingList.create({
      data: {
        name: body.name || 'Shopping List',
        category: body.category,
        isRecurring: body.isRecurring || false,
      },
    });
    res.status(201).json(list);
  } catch (error) {
    console.error('Create shopping list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/shopping/:listId — delete a shopping list (FAMILY only)
router.delete('/:listId', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    await prisma.shoppingList.delete({ where: { id: req.params.listId as string } });
    res.status(204).end();
  } catch (error) {
    console.error('Delete shopping list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shopping/:listId/items — add item to a list
router.post('/:listId/items', async (req: AuthRequest, res) => {
  try {
    const body = req.body as { name: string; quantity?: number };
    const item = await prisma.shoppingListItem.create({
      data: {
        name: body.name,
        quantity: body.quantity || 1,
        listId: req.params.listId as string,
        addedById: req.user!.id,
      },
      include: { addedBy: { select: { id: true, name: true } } },
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Add shopping item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/shopping/items/:itemId — update an item (e.g., mark completed)
router.patch('/items/:itemId', async (req: AuthRequest, res) => {
  try {
    const body = req.body as { completed?: boolean; quantity?: number };
    const item = await prisma.shoppingListItem.update({
      where: { id: req.params.itemId as string },
      data: body,
    });
    res.json(item);
  } catch (error) {
    console.error('Update shopping item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/shopping/items/:itemId — remove an item (FAMILY only)
router.delete('/items/:itemId', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    await prisma.shoppingListItem.delete({ where: { id: req.params.itemId as string } });
    res.status(204).end();
  } catch (error) {
    console.error('Delete shopping item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
