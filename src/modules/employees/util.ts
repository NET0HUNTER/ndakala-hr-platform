import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../core/auth/session.js';
import type { AuditContext } from '../../core/audit/audit.js';

export function auditCtx(auth: AuthContext, req: Request): AuditContext {
  return {
    userId: auth.userId,
    email: auth.email,
    role: auth.roles[0],
    correlationId: req.requestId,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  };
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** ISO date or datetime string that parses to a valid date. */
export const zDate = z
  .string()
  .min(10)
  .max(40)
  .refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)), 'Invalid ISO date');
