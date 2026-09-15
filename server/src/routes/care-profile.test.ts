import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { familyToken, workerToken } from '../test/helpers';

/**
 * H2 (code review 2026-09-15): internalNotes is medical/family-confidential.
 * The serializer strips it for non-FAMILY roles, but this test pins the
 * *wire* contract — a WORKER token must never receive internalNotes in the
 * JSON body, even if a future code path forgets the serializer flag.
 */
describe('Care profile internal notes (wire-level role gate)', () => {
  it('FAMILY token receives internalNotes', async () => {
    const token = await familyToken();
    const res = await request(app)
      .get('/api/care-profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.internalNotes).toBeTruthy();
    expect(res.body.internalNotes.length).toBeGreaterThan(10);
  });

  it('WORKER token never receives internalNotes', async () => {
    const token = await workerToken();
    const res = await request(app)
      .get('/api/care-profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // null (stripped by serializer) — never the actual content
    expect(res.body.internalNotes ?? null).toBeNull();
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('respite agency');
    expect(raw).not.toContain('blue lockbox');
  });
});
