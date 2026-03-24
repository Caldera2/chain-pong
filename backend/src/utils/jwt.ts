import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../types';

export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as string as any };
  return jwt.sign(payload as object, env.JWT_SECRET, options);
}

export function signRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as string as any };
  return jwt.sign(payload as object, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}

export function getTokenExpiry(expiresIn: string): Date {
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 7 * 86400000);
  return new Date(Date.now() + parseInt(match[1]) * (units[match[2]] || 1000));
}
