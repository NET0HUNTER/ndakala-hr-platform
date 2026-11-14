import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import { AppError } from '../errors/errors.js';
import { resolveSession } from '../auth/session.js';
import type { AppDeps } from './context.js';

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export function sessionAuthMiddleware(deps: AppDeps): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const cookieToken = req.cookies?.hr_sid;
      const headerAuth = req.get('authorization');
      let token: string | undefined = cookieToken;

      if (!token && headerAuth?.startsWith('Bearer ')) {
        token = headerAuth.slice(7).trim();
      }

      if (token) {
        const auth = await resolveSession(deps.prisma, token);
        if (auth) req.auth = auth;
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfMiddleware: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.auth) return next();

  // If request has cookie-based auth, verify CSRF token
  const sent = req.get('x-csrf-token') ?? '';
  const expected = req.auth.csrfToken;
  if (!sent || sent !== expected) {
    return next(new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token (X-CSRF-Token header required)'));
  }
  next();
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.requestId,
      },
    });
    return;
  }

  // Handle generic bad JSON body parse error or oversized payload
  const e = err as { type?: string; status?: number; statusCode?: number };
  if (e?.type === 'entity.too.large' || e?.status === 413 || e?.statusCode === 413) {
    res.status(400).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'File size exceeds maximum allowed limit',
        requestId: req.requestId,
      },
    });
    return;
  }

  if (e?.type === 'entity.parse.failed' || e?.status === 400 || e?.statusCode === 400) {
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Invalid or malformed JSON payload in request body',
        requestId: req.requestId,
      },
    });
    return;
  }

  // Internal unexpected error: hide internal stack traces from client
  console.error('Unhandled internal server error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred. Please contact the administrator with the correlation ID.',
      requestId: req.requestId,
    },
  });
};
