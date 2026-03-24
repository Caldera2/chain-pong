import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

/**
 * Middleware: Require valid JWT access token.
 * Attaches `req.user` with { userId, username, authMethod }.
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization header');
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}

/**
 * Middleware: Optionally attach user if token is present.
 * Does NOT reject requests without a token.
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.slice(7);
      req.user = verifyAccessToken(token);
    }
  } catch {
    // Token invalid — just continue without user
  }
  next();
}
