import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../core/auth/session.js';
import { forbidden, notFound } from '../../core/errors/errors.js';
import type { Db } from '../notifications/service.js';

export interface EmployeeAccess {
  actorEmployeeId: string | null;
  isSelf: boolean;
  isInReportingLine: boolean; // actor is a direct or indirect manager of the target
  isDirectManager: boolean;
  canView: boolean;
  canViewPersonal: boolean; // DOB, gender, personal email, next of kin
  canViewSensitive: boolean; // statutory identifiers, bank details
  canViewMedical: boolean;
  isHr: boolean; // maintains the employee file (employees.update)
}

export async function getActorEmployeeId(db: Db, userId: string): Promise<string | null> {
  const emp = await db.employee.findUnique({ where: { userId }, select: { id: true } });
  return emp?.id ?? null;
}

/** Ids of all employees in the actor's direct and indirect reporting line (cycle-safe). */
export async function getReportingLineIds(db: Db, managerEmployeeId: string, maxDepth = 15): Promise<Set<string>> {
  const result = new Set<string>();
  let frontier = [managerEmployeeId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const reports = await db.employee.findMany({
      where: { managerId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const r of reports) {
      if (!result.has(r.id) && r.id !== managerEmployeeId) {
        result.add(r.id);
        frontier.push(r.id);
      }
    }
  }
  return result;
}

export async function resolveEmployeeAccess(
  db: Db,
  auth: AuthContext,
  target: { id: string; userId: string | null; managerId: string | null },
): Promise<EmployeeAccess> {
  const actorEmployeeId = await getActorEmployeeId(db, auth.userId);
  const isSelf = !!target.userId && target.userId === auth.userId;
  const isDirectManager = !!actorEmployeeId && target.managerId === actorEmployeeId;
  let isInReportingLine = isDirectManager;
  if (!isInReportingLine && actorEmployeeId && auth.permissions.has('employees.view_team')) {
    isInReportingLine = (await getReportingLineIds(db, actorEmployeeId)).has(target.id);
  }

  const hasDirectory = auth.permissions.has('employees.view');
  const hasTeam = auth.permissions.has('employees.view_team') && isInReportingLine;
  const canViewSensitive = isSelf || auth.permissions.has('employees.view_sensitive');

  return {
    actorEmployeeId,
    isSelf,
    isInReportingLine,
    isDirectManager,
    canView: isSelf || hasDirectory || hasTeam,
    canViewPersonal: isSelf || canViewSensitive || auth.permissions.has('employees.update'),
    canViewSensitive,
    canViewMedical: isSelf || auth.permissions.has('employees.view_medical'),
    isHr: auth.permissions.has('employees.update'),
  };
}

/**
 * Loads an employee and asserts the actor may view it. Unauthorised access returns 404
 * rather than 403 so that record existence is not disclosed (BOLA/IDOR defence).
 */
export async function loadEmployeeForActor(prisma: PrismaClient, auth: AuthContext, employeeId: string) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw notFound('Employee', employeeId);
  const access = await resolveEmployeeAccess(prisma, auth, emp);
  if (!access.canView) throw notFound('Employee', employeeId);
  return { emp, access };
}

export type DocumentVisibility =
  | 'HR_EMPLOYEE_MANAGER'
  | 'HR_AND_EMPLOYEE'
  | 'CONFIDENTIAL'
  | 'HR_ONLY'
  | 'MEDICAL_RESTRICTED';

export const DOCUMENT_VISIBILITIES: DocumentVisibility[] = [
  'HR_EMPLOYEE_MANAGER',
  'HR_AND_EMPLOYEE',
  'CONFIDENTIAL',
  'HR_ONLY',
  'MEDICAL_RESTRICTED',
];

/** Per-document access rule. Applied to listing, metadata and download token issuance. */
export function canAccessDocument(access: EmployeeAccess, visibility: string): boolean {
  switch (visibility) {
    case 'MEDICAL_RESTRICTED':
      return access.canViewMedical;
    case 'HR_ONLY':
      // HR file only: requires both file maintenance and sensitive-data authority
      return access.isHr && access.canViewSensitive;
    case 'CONFIDENTIAL':
      return access.isSelf || access.canViewSensitive;
    case 'HR_AND_EMPLOYEE':
      return access.isSelf || access.isHr || access.canViewSensitive;
    case 'HR_EMPLOYEE_MANAGER':
      return access.isSelf || access.isHr || access.canViewSensitive || access.isInReportingLine;
    default:
      return false; // deny unknown visibility
  }
}

export function assertCan(condition: boolean, message: string): void {
  if (!condition) throw forbidden(message);
}
