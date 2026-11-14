import type { Db } from '../notifications/service.js';

/**
 * Lifecycle event outbox — the integration interface for future Leave, Payroll and
 * ICT/Access modules. Phase 2 publishes events only; it implements NO consumer rules
 * (no leave accrual, no payroll effect, no automated provisioning).
 *
 * Payloads must never contain sensitive identifiers, bank details or medical data.
 */
export type LifecycleEventType =
  | 'EMPLOYEE_CREATED'
  | 'STATUS_CHANGED'
  | 'TRANSFERRED'
  | 'MANAGER_CHANGED'
  | 'EMPLOYMENT_CHANGED'
  | 'PERSONAL_DETAILS_CHANGED'
  | 'ONBOARDING_COMPLETED'
  | 'PROBATION_CONFIRMED'
  | 'PROBATION_EXTENDED'
  | 'PROBATION_TERMINATION_APPROVED'
  | 'EMPLOYEE_DEACTIVATED';

export interface PublishInput {
  employeeId: string;
  eventType: LifecycleEventType;
  effectiveDate: Date;
  payload: Record<string, unknown>;
  sourceType: string;
  sourceId?: string | null;
  actorUserId: string;
  reason?: string | null;
}

const FORBIDDEN_PAYLOAD_KEYS = /national|kra|nssf|shif|bank|account|medical|password|token|secret/i;

export async function publishLifecycleEvent(db: Db, input: PublishInput): Promise<void> {
  for (const key of Object.keys(input.payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.test(key)) {
      throw new Error(`Lifecycle event payload must not contain sensitive field '${key}'`);
    }
  }
  await db.lifecycleEvent.create({
    data: {
      employeeId: input.employeeId,
      eventType: input.eventType,
      effectiveDate: input.effectiveDate,
      payload: JSON.stringify(input.payload),
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      actorUserId: input.actorUserId,
      reason: input.reason ?? null,
    },
  });
}
