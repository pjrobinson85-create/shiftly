import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Calendar routes', () => {
  it('GET /api/calendar/events returns empty array when no events synced', async () => {
    const res = await request(app).get('/api/calendar/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/calendar/auth-url requires auth header', async () => {
    const res = await request(app).get('/api/calendar/auth-url');
    expect(res.status).toBe(401);
  });

  it('POST /api/calendar/sync requires refresh token', async () => {
    const res = await request(app)
      .post('/api/calendar/sync')
      .send({});
    expect(res.status).toBeIn([400, 401]);
  });
});
