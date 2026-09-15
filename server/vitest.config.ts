import { defineConfig } from 'vitest/config';

// Pin the process timezone so date-window logic (export, shifts) is
// deterministic regardless of the host machine's /etc/timezone (M3/M6).
process.env.TZ = process.env.TZ || 'Australia/Brisbane';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/lib/*.test.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-do-not-use-in-prod',
      TZ: 'Australia/Brisbane',
    },
  },
});
