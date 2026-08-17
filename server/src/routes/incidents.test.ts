import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken, workerToken } from '../test/helpers';
import prisma from '../lib/prisma';

describe('Incident routes', () => {
  it('GET /api/incidents requires auth', async () => {
    const res = await request(app).get('/api/incidents');
    expect(res.status).toBe(401);
  });

  it('GET /api/incidents returns an array', async () => {
    const token = await workerToken();
    const res = await request(app).get('/api/incidents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/incidents creates a low-severity incident', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Test incident ${Date.now()}`,
        description: 'A minor scrape, fully resolved on site.',
        severity: 'low',
      });
    expect(res.status).toBe(201);
    expect(res.body.severity).toBe('low');
    expect(res.body.photos).toEqual([]);

    // clean up (FAMILY can delete)
    const family = await familyToken();
    const del = await request(app)
      .delete(`/api/incidents/${res.body.id}`)
      .set('Authorization', `Bearer ${family}`);
    expect(del.status).toBe(204);
  });

  it('POST /api/incidents rejects an invalid severity', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', description: 'y', severity: 'apocalyptic' });
    expect(res.status).toBe(400);
  });

  it('POST /api/incidents requires all fields', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'no description' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/incidents/:id is forbidden for WORKER', async () => {
    const worker = await workerToken();
    const res = await request(app)
      .delete('/api/incidents/does-not-exist')
      .set('Authorization', `Bearer ${worker}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /api/incidents/:id returns 404 for a missing id (FAMILY)', async () => {
    const token = await familyToken();
    const res = await request(app)
      .delete('/api/incidents/missing-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('reporting a high-severity incident writes an audit log entry', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Audit incident ${Date.now()}`,
        description: 'For audit-log verification.',
        severity: 'high',
      });
    expect(res.status).toBe(201);

    const log = await prisma.auditLog.findFirst({ where: { entityId: res.body.id } });
    expect(log).not.toBeNull();
    expect(log?.action).toBe('incident.reported');

    const family = await familyToken();
    await request(app).delete(`/api/incidents/${res.body.id}`).set('Authorization', `Bearer ${family}`);
  });
});
