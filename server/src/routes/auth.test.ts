import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken } from '../test/helpers';

describe('Auth routes', () => {
  it('GET /api/health is open', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/auth/login succeeds for a seeded user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'family@shiftly.test', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('FAMILY');
  });

  it('POST /api/auth/login rejects a bad password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'family@shiftly.test', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('POST /api/auth/login requires email and password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/register enforces min password length', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `new-${Date.now()}@shiftly.test`, password: 'short', name: 'New Person' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('POST /api/auth/register creates a worker by default', async () => {
    const email = `reg-${Date.now()}@shiftly.test`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'Test Worker' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('WORKER');
    expect(res.body.accessToken).toBeTruthy();
  });

  it('GET /api/auth/me returns the caller with a valid token', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('family@shiftly.test');
  });

  it('GET /api/auth/me returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
