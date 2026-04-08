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
  // Retry connection up to 3 times — free-tier databases (Neon, Supabase, Railway)
  // often "sleep" after inactivity and need a wake-up attempt.
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      // Warm the connection pool with a trivial query
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connected');
      return;
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      if (attempt === MAX_RETRIES) {
        console.error('❌ All database connection attempts exhausted');
        process.exit(1);
      }
      // Wait before retrying (2s, 4s)
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
}

// Keepalive: ping the database every 4 minutes to prevent connection timeouts
// on free-tier providers that kill idle connections after 5 minutes.
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

export function startKeepalive(): void {
  if (keepaliveInterval) return;
  keepaliveInterval = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.warn('[DB] Keepalive ping failed — reconnecting:', (err as Error).message);
      try { await prisma.$connect(); } catch {}
    }
  }, 4 * 60 * 1000);
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('🔌 Database disconnected');
}
