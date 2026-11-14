import type { Db } from '../notifications/service.js';

/**
 * Concurrency-safe employee number generation using a per-year sequence row updated
 * inside the caller's transaction. Format is a placeholder (prefix configurable via
 * EMPLOYEE_NUMBER_PREFIX) because the BRS does not specify one.
 */
export async function nextEmployeeNumber(db: Db, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const seq = await db.employeeNumberSequence.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  const prefix = (process.env.EMPLOYEE_NUMBER_PREFIX || 'NDA').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'NDA';
  return `${prefix}-${year}-${seq.lastValue.toString().padStart(4, '0')}`;
}
