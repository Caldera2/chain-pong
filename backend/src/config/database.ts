import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Singleton Prisma client — prevents hot-reload connection exhaustion
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.isDev ? ['query', 'warn', 'error'] : ['error'],
    datasourceUrl: env.DATABASE_URL,
  });

if (env.isDev) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('🔌 Database disconnected');
}
