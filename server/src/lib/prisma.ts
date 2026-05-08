import { PrismaClient } from '@prisma/client';

// Shared singleton — prevents multiple connection pools being opened.
// In development with hot-reload, attaching to globalThis avoids creating
// a new instance on every file change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
