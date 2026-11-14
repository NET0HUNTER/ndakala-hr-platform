import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../auth/session.js';

export interface AppDeps {
  prisma: PrismaClient;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
    }
  }
}
