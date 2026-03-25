import dotenv from 'dotenv';
import path from 'path';

// Load .env file for local development — Vercel injects env vars automatically
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Blockchain
  RPC_URL: process.env.RPC_URL || 'https://sepolia.base.org',
  CHAIN_ID: parseInt(process.env.CHAIN_ID || '84532', 10),
  STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS || '',
  TREASURY_PRIVATE_KEY: process.env.TREASURY_PRIVATE_KEY || '',
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || '0x25f771D0B086602FEc043B6cCa1eD3E5fDcd8F1d',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Derived
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
} as const;

// Validate required env vars (skip in Vercel build phase)
if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV) {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
  for (const key of required) {
    if (!process.env[key]) {
      console.warn(`⚠️ Missing environment variable: ${key}`);
    }
  }
}
