import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index';
import { familyToken } from '../test/helpers';

// The dev box may have a real Google creds file, which would let /sync
// proceed past the "no connection" guard — set it aside for the test.
const CRED_FILE = path.resolve(process.cwd(), '.google-oauth.json');
const CRED_BACKUP = `${CRED_FILE}.test-bak`;

describe('Calendar routes', () => {
  let hadCredsFile = false;
  let backupPath: string | null = null;
  let savedRefreshToken: string | undefined;

  beforeAll(() => {
    if (fs.existsSync(CRED_FILE)) {
      hadCredsFile = true;
      backupPath = fs.existsSync(CRED_BACKUP) ? `${CRED_BACKUP}.2` : CRED_BACKUP;
      fs.renameSync(CRED_FILE, backupPath);
    }
    savedRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    delete process.env.GOOGLE_REFRESH_TOKEN;
  });

  afterAll(() => {
    if (savedRefreshToken !== undefined) process.env.GOOGLE_REFRESH_TOKEN = savedRefreshToken;
    if (hadCredsFile && backupPath && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, CRED_FILE);
    }
    if (backupPath && fs.existsSync(backupPath)) fs.rmSync(backupPath);
  });
  it('GET /api/calendar/events requires auth', async () => {
    const res = await request(app).get('/api/calendar/events');
    expect(res.status).toBe(401);
  });

  it('GET /api/calendar/events returns array when authenticated', async () => {
    const token = await familyToken();
    const res = await request(app).get('/api/calendar/events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/calendar/auth-url requires FAMILY role (401 unauth)', async () => {
    const res = await request(app).get('/api/calendar/auth-url');
    expect(res.status).toBe(401);
  });

  it('POST /api/calendar/sync without connection returns 400 for FAMILY', async () => {
    const token = await familyToken();
    const res = await request(app).post('/api/calendar/sync').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/connection/i);
  });

  it('GET /api/calendar/status requires auth', async () => {
    const res = await request(app).get('/api/calendar/status');
    expect(res.status).toBe(401);
  });
});
