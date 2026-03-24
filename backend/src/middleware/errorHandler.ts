import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { env } from '../config/env';
import { ZodError } from 'zod';

/**
 * Global error handler. Catches all errors thrown in routes/middleware.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: messages.join('; '),
    });
    return;
  }

  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Prisma known errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as unknown as { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === 'P2002') {
      const field = prismaErr.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        error: `A record with this ${field} already exists`,
      });
      return;
    }
  }

  // Unknown errors
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: env.isProd ? 'Internal server error' : err.message,
    ...(env.isDev && { stack: err.stack }),
  });
}
