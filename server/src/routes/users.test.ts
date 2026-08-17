import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken, workerToken } from '../test/helpers';

describe('User routes (assignee picker)', () => {
  it('GET /api/users requires auth', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/users is forbidden for WORKER', async () => {
    const token = await workerToken();
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/users returns the user list for FAMILY', async () => {
    const token = await familyToken();
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const emails = res.body.map((u: { email: string }) => u.email);
    expect(emails).toContain('family@shiftly.test');
    expect(emails).toContain('worker@shiftly.test');
    // each entry carries the fields the picker needs
    const first = res.body[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('role');
  });
});
