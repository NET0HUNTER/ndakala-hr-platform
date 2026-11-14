import { validation } from '../../core/errors/errors.js';

export const EMPLOYEE_STATUSES = [
  'ONBOARDING',
  'PROBATION',
  'ACTIVE',
  'SUSPENDED',
  'RESIGNED',
  'TERMINATED',
  'RETIRED',
  'DECEASED',
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/**
 * Allowed employment status transitions. Terminal states cannot be left.
 * PROBATION -> PROBATION is not a transition: extensions are recorded on the probation
 * record through an authorised human decision, not via a status change.
 * NOTE: Leave of absence is intentionally not modelled as a status here; it belongs to the
 * Leave module (not implemented in Phase 2).
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  ONBOARDING: ['PROBATION', 'ACTIVE', 'TERMINATED', 'RESIGNED', 'DECEASED'],
  PROBATION: ['ACTIVE', 'TERMINATED', 'RESIGNED', 'DECEASED'],
  ACTIVE: ['SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'DECEASED'],
  SUSPENDED: ['ACTIVE', 'RESIGNED', 'TERMINATED', 'DECEASED'],
  RESIGNED: [],
  TERMINATED: [],
  RETIRED: [],
  DECEASED: [],
};

export const TERMINAL_STATUSES: EmployeeStatus[] = ['RESIGNED', 'TERMINATED', 'RETIRED', 'DECEASED'];

export function assertValidStatusTransition(currentStatus: string, nextStatus: string): void {
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus as EmployeeStatus];
  if (!allowed) {
    throw validation(`Unknown current employment status: '${currentStatus}'`);
  }
  if (!(EMPLOYEE_STATUSES as readonly string[]).includes(nextStatus)) {
    throw validation(`Unknown target employment status: '${nextStatus}'`);
  }
  if (!allowed.includes(nextStatus as EmployeeStatus)) {
    throw validation(
      `Invalid lifecycle transition: cannot transition employee status from '${currentStatus}' to '${nextStatus}'. Allowed transitions: [${allowed.join(', ')}]`,
    );
  }
}
