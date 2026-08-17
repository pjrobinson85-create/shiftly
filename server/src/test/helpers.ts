import request from 'supertest';
import { app } from '../index';

/**
 * Log in as a seeded user and return a Bearer token.
 * Seed users (see prisma/seed.ts):
 *   family@shiftly.test / password123 (FAMILY)
 *   worker@shiftly.test / password123 (WORKER)
 */
export async function login(email: string, password = 'password123'): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${res.body.error}`);
  }
  return res.body.accessToken as string;
}

export async function familyToken(): Promise<string> {
  return login('family@shiftly.test');
}

export async function workerToken(): Promise<string> {
  return login('worker@shiftly.test');
}
