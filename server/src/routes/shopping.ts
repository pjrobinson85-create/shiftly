import { Router } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();
router.use(requireAuth);

// GET /api/shopping — list all shopping lists
router.get('/', async (_req: AuthRequest, res) => {
  try {
    const lists = await prisma.shoppingList.findMany({
      include: {
        items: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(lists);
  } catch (error) {
    console.error('List shopping lists error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shopping — create a new list (FAMILY only)
router.post('/', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const { name, category } = req.body as { name: string; category?: string };
    if (!name?.trim()) {
      return res.status(400).json({ error: 'List name is required' });
    }

    const list = await prisma.shoppingList.create({
      data: {
        name: name.trim(),
        category: category || undefined,
      },
    });
    res.status(201).json(list);
  } catch (error) {
    console.error('Create shopping list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/shopping/:id — delete a list (FAMILY only)
router.delete('/:id', requireRole('FAMILY'), async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);
    await prisma.shoppingList.delete({ where: { id } });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete shopping list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shopping/:listId/items — add item to a list
router.post('/:listId/items', async (req: AuthRequest, res) => {
  try {
    const listId = String(req.params.listId);
    const { name, quantity } = req.body as { name: string; quantity?: string };
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const list = await prisma.shoppingList.findUnique({
      where: { id: listId },
    });
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const item = await prisma.shoppingListItem.create({
      data: {
        name: name.trim(),
        quantity: quantity || undefined,
        listId,
        addedById: req.user?.id,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Add shopping item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/shopping/items/:itemId — update an item (toggle completed, etc.)
router.patch('/items/:itemId', async (req: AuthRequest, res) => {
  try {
    const itemId = String(req.params.itemId);
    const updates = req.body as { completed?: boolean };

    const item = await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: updates,
    });
    res.json(item);
  } catch (error) {
    console.error('Update shopping item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/shopping/items/:itemId — remove an item
router.delete('/items/:itemId', async (req: AuthRequest, res) => {
  try {
    const itemId = String(req.params.itemId);
    await prisma.shoppingListItem.delete({ where: { id: itemId } });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete shopping item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
