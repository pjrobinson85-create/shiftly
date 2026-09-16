/**
 * Vitest global setup — hermetic test database.
 *
 * The Prisma schema's datasource url is `env("DATABASE_URL")`. Before tests
 * run, this script creates a throwaway SQLite file in /tmp, applies all
 * migrations to it, and seeds it — the same shape as a fresh dev DB. The
 * vitest workers (via test.env.DATABASE_URL in vitest.config.ts) point at
 * this same file, so the live prisma/dev.db is never touched.
 *
 * History: the schema used to hardcode `file:./dev.db`. The generated
 * client resolves relative URLs against its own location in
 * node_modules/.prisma/client, which let "scratch" test runs silently read
 * from or write to the production database. The env-driven absolute path
 * makes that failure mode impossible.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TEST_DB_DIR = path.join(os.tmpdir(), 'shiftly-vitest');
export const TEST_DB_PATH = path.join(TEST_DB_DIR, 'dev.db');
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

// Child processes inherit DATABASE_URL set here explicitly, which takes
// precedence over any .env file they might load on their own.
function runWithDbUrl(command: string, args: string[]) {
  execFileSync(command, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

export default async function globalSetup() {
  // Fresh DB every run: wipe, migrate, seed.
  rmSync(TEST_DB_PATH, { force: true });
  runWithDbUrl('npx', ['prisma', 'migrate', 'deploy']);
  runWithDbUrl('npx', ['tsx', 'prisma/seed.ts']);
}
