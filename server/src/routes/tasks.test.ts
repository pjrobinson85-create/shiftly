import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken, workerToken } from '../test/helpers';
import prisma from '../lib/prisma';

const today = new Date().toISOString().split('T')[0];

describe('Task routes', () => {
  it('GET /api/tasks requires auth', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('GET /api/tasks returns an array for a date', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get(`/api/tasks?date=${today}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/tasks rejects an invalid date', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get('/api/tasks?date=not-a-date')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('POST /api/tasks by a WORKER is forbidden (FAMILY only)', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Should not work', dueDate: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  it('POST /api/tasks creates a task and returns it', async () => {
    const token = await familyToken();
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Test task ${Date.now()}`,
        description: 'created by test suite',
        dueDate: new Date().toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBeTruthy();
    expect(res.body.id).toBeTruthy();
  });

  it('PATCH /api/tasks/:id/assign assigns to a user', async () => {
    const family = await familyToken();
    const worker = await workerToken();
    // create a task first
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${family}`)
      .send({ title: `Assign test ${Date.now()}`, dueDate: new Date().toISOString() });
    expect(created.status).toBe(201);

    const workerMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${worker}`);
    const workerId = workerMe.body.id;

    const res = await request(app)
      .patch(`/api/tasks/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${family}`)
      .send({ assignedToId: workerId });
    expect(res.status).toBe(200);
    expect(res.body.assignedTo?.id).toBe(workerId);

    // unassign
    const un = await request(app)
      .patch(`/api/tasks/${created.body.id}/assign`)
      .set('Authorization', `Bearer ${family}`)
      .send({ assignedToId: null });
    expect(un.status).toBe(200);
    expect(un.body.assignedTo).toBeNull();

    // clean up
    await request(app).delete(`/api/tasks/${created.body.id}`).set('Authorization', `Bearer ${family}`);
  });

  it('PATCH /api/tasks/:id/complete marks a task done', async () => {
    const family = await familyToken();
    const worker = await workerToken();

    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${family}`)
      .send({ title: `Complete test ${Date.now()}`, dueDate: new Date().toISOString(), priority: 'NORMAL' });

    const done = await request(app)
      .patch(`/api/tasks/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${worker}`);
    expect(done.status).toBe(200);
    expect(done.body.completed).toBe(true);
    expect(done.body.completedById).toBeTruthy();

    const undone = await request(app)
      .patch(`/api/tasks/${created.body.id}/uncomplete`)
      .set('Authorization', `Bearer ${worker}`);
    expect(undone.status).toBe(200);
    expect(undone.body.completed).toBe(false);

    await request(app).delete(`/api/tasks/${created.body.id}`).set('Authorization', `Bearer ${family}`);
  });

  it('DELETE /api/tasks/:id returns 204 and removes the task', async () => {
    const family = await familyToken();
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${family}`)
      .send({ title: `Delete test ${Date.now()}`, dueDate: new Date().toISOString() });

    const del = await request(app)
      .delete(`/api/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${family}`);
    expect(del.status).toBe(204);

    const after = await prisma.taskInstance.findUnique({ where: { id: created.body.id } });
    expect(after).toBeNull();
  });

  it('assignment + completion write audit log entries', async () => {
    const family = await familyToken();
    const created = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${family}`)
      .send({ title: `Audit test ${Date.now()}`, dueDate: new Date().toISOString() });

    await request(app)
      .patch(`/api/tasks/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${family}`);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: created.body.id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('task.created');
    expect(actions).toContain('task.completed');

    await request(app).delete(`/api/tasks/${created.body.id}`).set('Authorization', `Bearer ${family}`);
  });
});
