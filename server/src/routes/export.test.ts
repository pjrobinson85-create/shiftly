import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken, workerToken } from '../test/helpers';
import prisma from '../lib/prisma';

const dayStart = new Date();
dayStart.setHours(0, 0, 0, 0);
const fromStr = dayStart.toISOString().slice(0, 10);
const toStr = new Date().toISOString().slice(0, 10);

describe('Export routes (NDIS CSV)', () => {
  it('GET /api/export/incidents requires auth', async () => {
    const res = await request(app).get(`/api/export/incidents?from=${fromStr}&to=${toStr}`);
    expect(res.status).toBe(401);
  });

  it('GET /api/export/incidents returns CSV with header + a seeded incident row', async () => {
    const token = await familyToken();

    // guarantee at least one incident inside the window
    const incident = await prisma.incident.create({
      data: {
        title: `CSV incident ${Date.now()}`,
        description: 'Used by the export test — has "quotes" and, commas',
        severity: 'medium',
        photos: [],
        occurredAt: new Date(),
        userId: (await prisma.user.findUnique({ where: { email: 'worker@shiftly.test' } }))!.id,
      },
    });

    const res = await request(app)
      .get(`/api/export/incidents?from=${fromStr}&to=${toStr}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/shiftly-incidents-.*\.csv/);

    const text = (res.text as string).replace(/^\uFEFF/, '');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Date,Time,Title,Severity,Description,Reported By,Photos');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain(incident.title);
    // CSV escaping: embedded quotes are doubled
    expect(text).toContain(`""quotes""`);

    await prisma.incident.delete({ where: { id: incident.id } });
  });

  it('GET /api/export/activity returns the audit trail as CSV', async () => {
    const token = await workerToken();

    // Write our own audit entry so this test is independent of test-file ordering
    const workerId = (await prisma.user.findUnique({ where: { email: 'worker@shiftly.test' } }))!.id;
    const log = await prisma.auditLog.create({
      data: {
        action: 'task.completed',
        entity: 'task',
        detail: 'audit-entry written by export test',
        userId: workerId,
      },
    });

    const res = await request(app)
      .get(`/api/export/activity?from=${fromStr}&to=${toStr}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const text = (res.text as string).replace(/^\uFEFF/, '');
    expect(text.startsWith('Timestamp,User,Action,Entity,Entity ID,Detail')).toBe(true);
    expect(text).toMatch(/task\./);

    await prisma.auditLog.delete({ where: { id: log.id } });
  });

  it('GET /api/export/incidents rejects to < from', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get('/api/export/incidents?from=2026-08-10&to=2026-08-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('GET /api/export/incidents rejects invalid dates', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get('/api/export/incidents?from=garbage')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
