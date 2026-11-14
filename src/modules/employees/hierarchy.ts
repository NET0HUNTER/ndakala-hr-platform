import { validation } from '../../core/errors/errors.js';
import type { Db } from '../notifications/service.js';

/**
 * Prevents circular reporting lines: walks up from the proposed manager and rejects the
 * assignment if the employee is encountered (direct or indirect loop).
 */
export async function assertNoCircularReporting(
  db: Db,
  employeeId: string,
  proposedManagerId: string | null | undefined,
): Promise<void> {
  if (!proposedManagerId) return;

  if (employeeId === proposedManagerId) {
    throw validation('Invalid reporting assignment: an employee cannot be their own reporting manager');
  }

  let currentManagerId: string | null = proposedManagerId;
  const visited = new Set<string>();

  while (currentManagerId) {
    if (currentManagerId === employeeId) {
      throw validation(
        'Circular reporting line detected: the proposed supervisor reports directly or indirectly to this employee',
      );
    }

    if (visited.has(currentManagerId)) {
      throw validation('Existing circular loop detected in organizational hierarchy chain');
    }
    visited.add(currentManagerId);

    const supervisor: { managerId: string | null; isActive: boolean } | null = await db.employee.findUnique({
      where: { id: currentManagerId },
      select: { managerId: true, isActive: true },
    });
    if (!supervisor) {
      throw validation(`Proposed reporting manager '${currentManagerId}' does not exist`);
    }
    if (currentManagerId === proposedManagerId && !supervisor.isActive) {
      throw validation('Proposed reporting manager is not an active employee');
    }

    currentManagerId = supervisor.managerId ?? null;
  }
}
