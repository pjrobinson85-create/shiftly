import { describe, it, expect, afterEach } from 'vitest';
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

describe('Registration role gate', () => {
  const original = process.env.FAMILY_INVITE_CODE;

  afterEach(() => {
    if (original === undefined) delete process.env.FAMILY_INVITE_CODE;
    else process.env.FAMILY_INVITE_CODE = original;
  });

  it('POST /api/auth/register: FAMILY with no invite code configured -> 403', async () => {
    delete process.env.FAMILY_INVITE_CODE;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `fam-${Date.now()}@shiftly.test`,
        password: 'password123',
        name: 'Fam',
        role: 'FAMILY',
        inviteCode: 'anything',
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invitation/i);
  });

  it('POST /api/auth/register: FAMILY with a wrong invite code -> 403', async () => {
    process.env.FAMILY_INVITE_CODE = 'secret-code-123';
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `fam2-${Date.now()}@shiftly.test`,
        password: 'password123',
        name: 'Fam2',
        role: 'FAMILY',
        inviteCode: 'wrong-code',
      });
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/register: FAMILY with the matching invite code -> 201 FAMILY', async () => {
    process.env.FAMILY_INVITE_CODE = 'secret-code-123';
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `fam3-${Date.now()}@shiftly.test`,
        password: 'password123',
        name: 'Fam3',
        role: 'FAMILY',
        inviteCode: 'secret-code-123',
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('FAMILY');
    expect(res.body.accessToken).toBeTruthy();
  });
});
