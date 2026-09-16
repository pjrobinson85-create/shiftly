import { PrismaClient } from '@prisma/client';

// Shared singleton — prevents multiple connection pools being opened.
// In development with hot-reload, attaching to globalThis avoids creating
// a new instance on every file change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The datasource url in schema.prisma is `env("DATABASE_URL")`, so this
// client always connects to the absolute database named in the environment:
//   • production  -> server/.env (loaded by dotenv before import)
//   • tests        -> vitest.config.ts test.env (a throwaway /tmp DB set up
//                     by src/test/global-setup.ts before each run)
// Because the path is absolute and supplied by the environment, every
// process (live server, scratch test runs, seeds) targets the exact file
// it's told to — the old `file:./dev.db` relative default (which resolved
// against node_modules/.prisma/client) can no longer silently route two
// processes at different databases.
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
