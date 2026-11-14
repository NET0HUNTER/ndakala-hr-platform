import { forbidden } from '../errors/errors.js';

export function hasPermission(
  userPermissions: Set<string>,
  required: string | string[],
  any = false,
): boolean {
  const reqList = Array.isArray(required) ? required : [required];
  if (reqList.length === 0) return true;
  return any
    ? reqList.some((p) => userPermissions.has(p))
    : reqList.every((p) => userPermissions.has(p));
}

export function assertPermission(
  userPermissions: Set<string>,
  required: string | string[],
  any = false,
): void {
  if (!hasPermission(userPermissions, required, any)) {
    const list = Array.isArray(required) ? required.join(', ') : required;
    throw forbidden(`Access denied: requires permission (${list})`);
  }
}

/**
 * Enforces segregation of duties: prevents an actor from assigning roles to themselves
 * or elevating their own access.
 */
export function assertNotSelfRoleAssignment(actorUserId: string, targetUserId: string): void {
  if (actorUserId === targetUserId) {
    throw forbidden('Privilege escalation blocked: users cannot assign or modify their own roles');
  }
}

/**
 * Enforces maker-checker rule: an author cannot approve their own configuration proposal.
 */
export function assertMakerChecker(authorUserId: string, approverUserId: string): void {
  if (authorUserId === approverUserId) {
    throw forbidden('Maker-Checker violation: you cannot approve a configuration or record that you created/submitted');
  }
}

/**
 * Enforces workflow self-approval prevention.
 */
export function assertNotSelfApproval(initiatorUserId: string, approverUserId: string): void {
  if (initiatorUserId === approverUserId) {
    throw forbidden('Self-approval blocked: workflow initiator cannot approve their own request');
  }
}
