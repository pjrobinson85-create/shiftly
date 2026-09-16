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
      .send({ username: 'family', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe('FAMILY');
  });

  it('POST /api/auth/login rejects a bad password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'family', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('POST /api/auth/login requires name and password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login is case-insensitive on the username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'Family', password: 'password123' });
    expect(res.status).toBe(200);
  });

  it('POST /api/auth/register enforces min password length', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `newperson${Date.now()}`, password: 'short', name: 'New Person' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('POST /api/auth/register creates a worker by default', async () => {
    const username = `regworker${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'password123', name: 'Test Worker' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('WORKER');
    expect(res.body.user.username).toBe(username);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('POST /api/auth/register allows an account without an email', async () => {
    const username = `noemail${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'password123', name: 'No Email' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBeNull();
  });

  it('GET /api/auth/me returns the caller with a valid token', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('family');
  });

  it('GET /api/auth/me returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Change password', () => {
  it('POST /api/auth/change-password rejects without a token', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'password123', newPassword: 'newpassword999' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/change-password rejects a wrong current password', async () => {
    const token = await familyToken();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'nope', newPassword: 'newpassword999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/current password/i);
  });

  it('POST /api/auth/change-password rejects a too-short new password', async () => {
    const token = await familyToken();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password123', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('POST /api/auth/change-password rejects a new password identical to the current one', async () => {
    const token = await familyToken();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password123', newPassword: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different/i);
  });

  it('POST /api/auth/change-password updates the password and lets you log in with it', async () => {
    // Use a throwaway account so the seeded 'family' password is untouched.
    const username = `pwchg${Date.now()}`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'password123', name: 'Pw Chg' });
    const token = reg.body.accessToken;

    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password123', newPassword: 'brand-new-42' });
    expect(change.status).toBe(200);
    expect(change.body.message).toMatch(/password updated/i);
    expect(change.body.accessToken).toBeTruthy();

    // Old password no longer works...
    const old = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'password123' });
    expect(old.status).toBe(401);

    // ...but the new one does.
    const fresh = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'brand-new-42' });
    expect(fresh.status).toBe(200);
    expect(fresh.body.accessToken).toBeTruthy();
  });

  it('POST /api/auth/change-password rotates the refresh token (old one rejected)', async () => {
    const username = `pwrot${Date.now()}`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'password123', name: 'Pw Rot' });

    // Grab the refresh token cookie set by register.
    const refreshCookie = reg.headers['set-cookie']
      .find((c: string) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeTruthy();

    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .set('Cookie', [refreshCookie])
      .send({ currentPassword: 'password123', newPassword: 'brand-new-42' });
    expect(change.status).toBe(200);

    // The *old* refresh token should now be invalid.
    const staleRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie]);
    expect(staleRefresh.status).toBe(401);

    // The *new* refresh token (set by change-password) should work.
    const newRefreshCookie = change.headers['set-cookie'].find(
      (c: string) => c.startsWith('refreshToken=')
    );
    const freshRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [newRefreshCookie]);
    expect(freshRefresh.status).toBe(200);
    expect(freshRefresh.body.accessToken).toBeTruthy();
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
        username: `fam${Date.now()}`,
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
        username: `fam2${Date.now()}`,
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
        username: `fam3${Date.now()}`,
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
