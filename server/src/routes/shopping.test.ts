import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken, workerToken } from '../test/helpers';
import prisma from '../lib/prisma';

/**
 * Shopping list access model (2026-09-17):
 * - Any authenticated user (incl. WORKER) can CREATE a list and add items.
 *   Before this, list creation was FAMILY-only and the DB had zero lists,
 *   so workers saw a blank page with nowhere to add items.
 * - Deleting a list stays FAMILY-only.
 * - The first GET by FAMILY while zero lists exist seeds a default
 *   'Household Shopping List'; a WORKER GET never creates one.
 */
describe('Shopping list access for workers', () => {
  it('WORKER can create a list', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/shopping')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Worker Test List ${Date.now()}` });
    expect(res.status).toBe(201);
    expect(res.body.name).toContain('Worker Test List');
    // clean up
    await prisma.shoppingList.delete({ where: { id: res.body.id } });
  });

  it('WORKER can add an item to an existing list', async () => {
    const fToken = await familyToken();
    const wToken = await workerToken();
    // create a scratch list as family
    const create = await request(app)
      .post('/api/shopping')
      .set('Authorization', `Bearer ${fToken}`)
      .send({ name: `Item Test List ${Date.now()}` });
    expect(create.status).toBe(201);
    const listId = create.body.id;

    const res = await request(app)
      .post(`/api/shopping/${listId}/items`)
      .set('Authorization', `Bearer ${wToken}`)
      .send({ name: 'Milk', quantity: '2' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Milk');
    expect(res.body.addedBy).toBeTruthy();

    // clean up (deleting the list cascades items via onDelete: Cascade)
    await prisma.shoppingList.delete({ where: { id: listId } });
  });

  it('WORKER cannot delete a list (FAMILY-only)', async () => {
    const fToken = await familyToken();
    const wToken = await workerToken();
    const create = await request(app)
      .post('/api/shopping')
      .set('Authorization', `Bearer ${fToken}`)
      .send({ name: `Delete Test List ${Date.now()}` });
    expect(create.status).toBe(201);

    const res = await request(app)
      .delete(`/api/shopping/${create.body.id}`)
      .set('Authorization', `Bearer ${wToken}`);
    expect(res.status).toBe(403);

    // family can still delete it
    const del = await request(app)
      .delete(`/api/shopping/${create.body.id}`)
      .set('Authorization', `Bearer ${fToken}`);
    expect(del.status).toBe(200);
  });

  it('GET seeds a default list when none exist (FAMILY triggers, WORKER does not)', async () => {
    // ensure a clean slate
    const lists = await prisma.shoppingList.findMany();
    for (const l of lists) {
      await prisma.shoppingList.delete({ where: { id: l.id } });
    }

    // WORKER GET must NOT create a list
    const wToken = await workerToken();
    const wRes = await request(app)
      .get('/api/shopping')
      .set('Authorization', `Bearer ${wToken}`);
    expect(wRes.status).toBe(200);
    expect(wRes.body).toEqual([]);

    // FAMILY GET seeds the default household list
    const fToken = await familyToken();
    const fRes = await request(app)
      .get('/api/shopping')
      .set('Authorization', `Bearer ${fToken}`);
    expect(fRes.status).toBe(200);
    expect(fRes.body.length).toBe(1);
    expect(fRes.body[0].name).toBe('Household Shopping List');

    // and the next GET is idempotent (no second seed)
    const fRes2 = await request(app)
      .get('/api/shopping')
      .set('Authorization', `Bearer ${fToken}`);
    expect(fRes2.body.length).toBe(1);
  });
});
