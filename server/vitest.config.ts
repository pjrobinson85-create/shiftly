import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

// Pin the process timezone so date-window logic (export, shifts) is
// deterministic regardless of the host machine's /etc/timezone (M3/M6).
process.env.TZ = process.env.TZ || 'Australia/Brisbane';

// Hermetic test database — a throwaway file in /tmp that global-setup
// migrates and seeds before tests run (see src/test/global-setup.ts).
// Must stay in sync with TEST_DB_PATH in that file.
const testDbPath = path.join(os.tmpdir(), 'shiftly-vitest', 'dev.db');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/lib/*.test.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    hookTimeout: 60000,
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-do-not-use-in-prod',
      TZ: 'Australia/Brisbane',
      DATABASE_URL: `file:${testDbPath}`,
    },
  },
});
