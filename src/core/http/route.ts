import type { Request, Response, NextFunction, RequestHandler, Router } from 'express';
import { z } from 'zod';
import { AppError, unauthenticated, validation } from '../errors/errors.js';
import { hasPermission } from '../permissions/rbac.js';
import type { AuthContext } from '../auth/session.js';
import type { AppDeps } from './context.js';

export type RouteAuth =
  | 'public'
  | 'session'
  | { permission: string | string[]; any?: boolean };

export interface RouteDef<
  B extends z.ZodTypeAny | undefined = undefined,
  Q extends z.ZodTypeAny | undefined = undefined,
  P extends z.ZodTypeAny | undefined = undefined,
> {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  auth: RouteAuth;
  body?: B;
  query?: Q;
  params?: P;
  successStatus?: number;
  handler: (ctx: {
    req: Request;
    res: Response;
    body: B extends z.ZodTypeAny ? z.infer<B> : undefined;
    query: Q extends z.ZodTypeAny ? z.infer<Q> : undefined;
    params: P extends z.ZodTypeAny ? z.infer<P> : undefined;
    auth: AuthContext;
    deps: AppDeps;
  }) => Promise<unknown>;
}

export function registerRoute<
  B extends z.ZodTypeAny | undefined,
  Q extends z.ZodTypeAny | undefined,
  P extends z.ZodTypeAny | undefined,
>(router: Router, deps: AppDeps, def: RouteDef<B, Q, P>): void {
  const guard: RequestHandler = (req, _res, next) => {
    try {
      if (def.auth !== 'public') {
        if (!req.auth) throw unauthenticated();
        if (def.auth !== 'session') {
          const reqPerms = def.auth.permission;
          const anyMatch = def.auth.any ?? false;
          if (!hasPermission(req.auth.permissions, reqPerms, anyMatch)) {
            const list = Array.isArray(reqPerms) ? reqPerms.join(', ') : reqPerms;
            throw new AppError(403, 'FORBIDDEN', `Access denied: requires permission (${list})`);
          }
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };

  const execute: RequestHandler = async (req, res, next) => {
    try {
      let parsedBody: unknown = undefined;
      let parsedQuery: unknown = req.query;
      let parsedParams: unknown = req.params;

      if (def.body) {
        const result = def.body.safeParse(req.body);
        if (!result.success) {
          throw validation('Validation error in request body', result.error.errors);
        }
        parsedBody = result.data;
      }

      if (def.query) {
        const result = def.query.safeParse(req.query);
        if (!result.success) {
          throw validation('Validation error in query parameters', result.error.errors);
        }
        parsedQuery = result.data;
      }

      if (def.params) {
        const result = def.params.safeParse(req.params);
        if (!result.success) {
          throw validation('Validation error in route parameters', result.error.errors);
        }
        parsedParams = result.data;
      }

      const result = await def.handler({
        req,
        res,
        body: parsedBody as any,
        query: parsedQuery as any,
        params: parsedParams as any,
        auth: req.auth as AuthContext,
        deps,
      });

      if (res.headersSent) return;
      const status = def.successStatus ?? 200;
      res.status(status).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  router[def.method](def.path, guard, execute);
}
