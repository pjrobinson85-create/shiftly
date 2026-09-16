import request from 'supertest';
import { app } from '../index';

/**
 * Log in as a seeded user and return a Bearer token.
 * Login is by username (email is optional contact info only).
 * Seed users (see prisma/seed.ts):
 *   family / password123 (FAMILY)
 *   sarah  / password123 (WORKER)
 */
export async function login(username: string, password = 'password123'): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${username}: ${res.status} ${res.body.error}`);
  }
  return res.body.accessToken as string;
}

export async function familyToken(): Promise<string> {
  return login('family');
}

export async function workerToken(): Promise<string> {
  return login('sarah');
}
