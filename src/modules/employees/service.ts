import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../core/auth/session.js';
import { conflict, forbidden, notFound, validation } from '../../core/errors/errors.js';
import { encrypt } from '../../core/crypto/vault.js';
import type { Db } from '../notifications/service.js';
import { notifyRole, notifyUser } from '../notifications/service.js';
import { assertNoCircularReporting } from './hierarchy.js';
import { hashIdentifier } from './masking.js';
import { nextEmployeeNumber } from './numbering.js';
import { publishLifecycleEvent } from './events.js';
import { addDays, addMonths, parseJson } from './util.js';

// ---------------------------------------------------------------------------
// Organisation reference validation
// ---------------------------------------------------------------------------
export async function assertOrgRefs(
  db: Db,
  refs: { departmentId?: string | null; positionId?: string | null; gradeId?: string | null; locationId?: string | null },
): Promise<void> {
  if (refs.departmentId) {
    const d = await db.department.findUnique({ where: { id: refs.departmentId } });
    if (!d || !d.isActive) throw validation(`Department '${refs.departmentId}' does not exist or is inactive`);
  }
  if (refs.positionId) {
    const p = await db.position.findUnique({ where: { id: refs.positionId } });
    if (!p || !p.isActive) throw validation(`Position '${refs.positionId}' does not exist or is inactive`);
    if (refs.departmentId && p.departmentId !== refs.departmentId) {
      throw validation('Position does not belong to the selected department');
    }
  }
  if (refs.gradeId && !(await db.grade.findUnique({ where: { id: refs.gradeId } }))) {
    throw validation(`Grade '${refs.gradeId}' does not exist`);
  }
  if (refs.locationId && !(await db.location.findUnique({ where: { id: refs.locationId } }))) {
    throw validation(`Location '${refs.locationId}' does not exist`);
  }
}

// ---------------------------------------------------------------------------
// Onboarding template resolution
// ---------------------------------------------------------------------------
export async function resolveOnboardingTemplate(
  db: Db,
  ctx: { employmentCategoryCode: string; departmentId: string; locationId?: string | null; positionId?: string | null },
) {
  const templates = await db.onboardingTemplate.findMany({
    where: { status: 'ACTIVE' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { approvedAt: 'desc' },
  });
  let best: (typeof templates)[number] | null = null;
  let bestScore = -1;
  for (const t of templates) {
    const criteria: [string | null, string | null | undefined][] = [
      [t.employmentCategoryCode, ctx.employmentCategoryCode],
      [t.departmentId, ctx.departmentId],
      [t.locationId, ctx.locationId],
      [t.positionId, ctx.positionId],
    ];
    if (criteria.some(([want, have]) => want !== null && want !== have)) continue;
    const score = criteria.filter(([want]) => want !== null).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

const OWNER_ROLE: Record<string, string | null> = { HR: 'head_of_hr', ICT: 'ict_admin', MANAGER: null, EMPLOYEE: null };

// ---------------------------------------------------------------------------
// Employee creation (progressive wizard submits a validated payload)
// ---------------------------------------------------------------------------
export interface CreateEmployeeInput {
  employeeNumber?: string;
  userId?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth?: string;
  gender?: string;
  personalEmail?: string;
  workEmail: string;
  phoneNumber: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelationship?: string;
  nationalId?: string;
  kraPin?: string;
  nssfNumber?: string;
  shifNumber?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  employmentCategoryCode: string;
  startDate: string;
  endDate?: string;
  probationStartDate?: string;
  probationEndDate?: string;
  noticePeriodDays?: number;
  noticeTermsReference?: string;
  remunerationReference?: string;
  workScheduleReference?: string;
  contractDocumentId?: string;
  jobTitle: string;
  departmentId: string;
  positionId?: string;
  gradeId?: string;
  locationId?: string;
  managerId?: string;
  ictAccessProfile: string;
}

export async function createEmployee(prisma: PrismaClient, auth: AuthContext, input: CreateEmployeeInput) {
  const category = await prisma.employmentCategory.findUnique({ where: { code: input.employmentCategoryCode } });
  if (!category || category.status !== 'ACTIVE') {
    throw validation(
      `Employment category '${input.employmentCategoryCode}' is not ACTIVE. Categories must be confirmed and approved before use (Decision D-25).`,
    );
  }

  const startDate = new Date(input.startDate);
  const endDate = input.endDate ? new Date(input.endDate) : null;
  if (endDate && endDate <= startDate) throw validation('Contract end date must be after start date');

  // Probation — never assumed. Explicit contract dates, or an approved category default.
  let probationStartDate: Date | null = null;
  let probationEndDate: Date | null = null;
  if (category.probationApplies) {
    if (input.probationEndDate) {
      probationStartDate = input.probationStartDate ? new Date(input.probationStartDate) : startDate;
      probationEndDate = new Date(input.probationEndDate);
    } else if (category.defaultProbationMonths) {
      probationStartDate = input.probationStartDate ? new Date(input.probationStartDate) : startDate;
      probationEndDate = addMonths(probationStartDate, category.defaultProbationMonths);
    } else {
      throw validation(
        `Probation applies to category '${category.code}' but no probation end date was supplied from the contract and no approved default probation length exists (Decision D-18).`,
      );
    }
    if (probationEndDate <= probationStartDate) throw validation('Probation end date must be after probation start date');
    if (probationStartDate < startDate) throw validation('Probation cannot start before the employment start date');
    if (endDate && probationEndDate > endDate) throw validation('Probation cannot end after the contract end date');
  } else if (input.probationStartDate || input.probationEndDate) {
    throw validation(`Probation is configured as not applicable for category '${category.code}'`);
  }

  const noticePeriodDays = input.noticePeriodDays ?? category.defaultNoticePeriodDays ?? null;

  // Uniqueness and duplicate active employment checks
  if (await prisma.employee.findUnique({ where: { workEmail: input.workEmail.toLowerCase() } })) {
    throw conflict(`An employee with work email '${input.workEmail}' already exists`);
  }
  if (input.employeeNumber && (await prisma.employee.findUnique({ where: { employeeNumber: input.employeeNumber } }))) {
    throw conflict(`Employee reference '${input.employeeNumber}' is already in use`);
  }
  const nationalIdHash = input.nationalId ? hashIdentifier(input.nationalId) : null;
  if (nationalIdHash) {
    const dup = await prisma.employee.findUnique({ where: { nationalIdHash }, select: { employeeNumber: true, isActive: true } });
    if (dup) {
      throw conflict(
        `An employee record with this national ID already exists (${dup.employeeNumber}, ${dup.isActive ? 'active' : 'inactive'}). Duplicate employment records are not permitted.`,
      );
    }
  }
  let resolvedUserId: string | null = input.userId ?? null;
  if (resolvedUserId) {
    const user = await prisma.user.findUnique({ where: { id: resolvedUserId } });
    if (!user) throw validation('Linked user account does not exist');
    if (await prisma.employee.findUnique({ where: { userId: resolvedUserId } })) {
      throw conflict('The user account is already linked to another employee record');
    }
  } else {
    const matchingUser = await prisma.user.findUnique({ where: { email: input.workEmail.toLowerCase() } });
    if (matchingUser && !(await prisma.employee.findUnique({ where: { userId: matchingUser.id } }))) {
      resolvedUserId = matchingUser.id;
    }
  }

  await assertOrgRefs(prisma, input);
  let managerUserId: string | null = null;
  if (input.managerId) {
    const mgr = await prisma.employee.findUnique({ where: { id: input.managerId } });
    if (!mgr || !mgr.isActive) throw validation('Reporting manager must be an existing active employee');
    managerUserId = mgr.userId;
  }
  if (input.contractDocumentId && !(await prisma.documentRecord.findUnique({ where: { id: input.contractDocumentId } }))) {
    throw validation('Contract document reference does not exist');
  }

  const template = await resolveOnboardingTemplate(prisma, {
    employmentCategoryCode: category.code,
    departmentId: input.departmentId,
    locationId: input.locationId,
    positionId: input.positionId,
  });
  const probationForm = await prisma.probationFormTemplate.findFirst({ where: { status: 'ACTIVE' }, orderBy: { version: 'desc' } });

  const result = await prisma.$transaction(async (tx) => {
    const employeeNumber = input.employeeNumber ?? (await nextEmployeeNumber(tx));
    const employee = await tx.employee.create({
      data: {
        employeeNumber,
        userId: resolvedUserId,
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        preferredName: input.preferredName,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: input.gender,
        personalEmail: input.personalEmail,
        workEmail: input.workEmail.toLowerCase(),
        phoneNumber: input.phoneNumber,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        emergencyContactRelationship: input.emergencyContactRelationship,
        nextOfKinName: input.nextOfKinName,
        nextOfKinPhone: input.nextOfKinPhone,
        nextOfKinRelationship: input.nextOfKinRelationship,
        nationalIdEncrypted: encrypt(input.nationalId),
        nationalIdHash,
        kraPinEncrypted: encrypt(input.kraPin),
        nssfNumberEncrypted: encrypt(input.nssfNumber),
        shifNumberEncrypted: encrypt(input.shifNumber),
        bankNameEncrypted: encrypt(input.bankName),
        bankBranchEncrypted: encrypt(input.bankBranch),
        bankAccountNumberEncrypted: encrypt(input.bankAccountNumber),
        status: 'ONBOARDING',
        departmentId: input.departmentId,
        positionId: input.positionId,
        gradeId: input.gradeId,
        locationId: input.locationId,
        managerId: input.managerId,
        createdById: auth.userId,
      },
    });

    await tx.employmentAgreement.create({
      data: {
        employeeId: employee.id,
        version: 1,
        employmentCategoryCode: category.code,
        startDate,
        endDate,
        probationStartDate,
        probationEndDate,
        noticePeriodDays,
        noticeTermsReference: input.noticeTermsReference,
        remunerationReference: input.remunerationReference,
        workScheduleReference: input.workScheduleReference,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        positionId: input.positionId,
        gradeId: input.gradeId,
        locationId: input.locationId,
        documentRecordId: input.contractDocumentId,
        status: 'ACTIVE',
        effectiveFrom: startDate,
        changeReason: 'Initial appointment',
        changedById: auth.userId,
      },
    });

    await tx.reportingAssignmentHistory.create({
      data: {
        employeeId: employee.id,
        managerId: input.managerId,
        departmentId: input.departmentId,
        positionId: input.positionId,
        locationId: input.locationId,
        effectiveFrom: startDate,
        reason: 'Initial appointment',
        changedById: auth.userId,
      },
    });

    const ict = await tx.ictAccessRequest.create({
      data: {
        employeeId: employee.id,
        requestType: 'JOINER',
        accessProfile: input.ictAccessProfile,
        startDate,
        managerEmployeeId: input.managerId,
        roleTitle: input.jobTitle,
        status: 'PENDING',
        requestedById: auth.userId,
      },
    });

    let tasksCreated = 0;
    if (template) {
      for (const item of template.items) {
        await tx.onboardingTask.create({
          data: {
            employeeId: employee.id,
            templateId: template.id,
            templateItemId: item.id,
            taskTitle: item.title,
            description: item.description,
            ownerType: item.ownerType,
            assignedRoleKey: OWNER_ROLE[item.ownerType] ?? null,
            assignedUserId:
              item.ownerType === 'MANAGER'
                ? managerUserId
                : item.ownerType === 'EMPLOYEE'
                  ? resolvedUserId
                  : null,
            dueDate: item.dueDaysAfterStart !== null ? addDays(startDate, item.dueDaysAfterStart) : null,
            evidenceRequired: item.evidenceRequired,
            escalateAfterDaysOverdue: item.escalateAfterDaysOverdue,
            escalateToRoleKey: item.escalateToRoleKey,
            policyAcknowledgementRef: item.policyAcknowledgementRef,
          },
        });
        tasksCreated++;
      }
    }

    let probationRecordId: string | null = null;
    if (probationStartDate && probationEndDate) {
      const pr = await tx.probationRecord.create({
        data: {
          employeeId: employee.id,
          supervisorEmployeeId: input.managerId,
          formTemplateId: probationForm?.id,
          employmentCategoryCode: category.code,
          probationStartDate,
          probationEndDate,
          status: 'IN_PROGRESS',
          createdById: auth.userId,
        },
      });
      probationRecordId = pr.id;
    }

    await publishLifecycleEvent(tx, {
      employeeId: employee.id,
      eventType: 'EMPLOYEE_CREATED',
      effectiveDate: startDate,
      payload: { employeeNumber, employmentCategoryCode: category.code, departmentId: input.departmentId, managerId: input.managerId ?? null },
      sourceType: 'Employee',
      sourceId: employee.id,
      actorUserId: auth.userId,
    });

    await notifyRole(tx, 'ict_admin', {
      title: 'New ICT joiner request',
      message: `Joiner access request for ${input.firstName} ${input.lastName} (${employeeNumber}) starting ${startDate.toISOString().slice(0, 10)}.`,
      deepLink: `/ict-requests/${ict.id}`,
      idempotencyKey: `ict-joiner:${ict.id}`,
    });

    return { employee, ictRequestId: ict.id, tasksCreated, probationRecordId };
  }, { timeout: 20000 });

  const warnings: string[] = [];
  if (!template) warnings.push('No ACTIVE onboarding template matched this employee; no checklist tasks were generated. HR must activate a template or add tasks manually.');
  if (noticePeriodDays === null) warnings.push('Notice period not set: no contract value supplied and no approved category default (Decision D-20).');
  return { ...result, templateCode: template?.code ?? null, warnings };
}

// ---------------------------------------------------------------------------
// Change requests (history-preserving material and personal changes)
// ---------------------------------------------------------------------------
export const PERSONAL_FIELDS = [
  'firstName', 'middleName', 'lastName', 'preferredName', 'phoneNumber', 'personalEmail',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship',
  'nextOfKinName', 'nextOfKinPhone', 'nextOfKinRelationship', 'dateOfBirth', 'gender',
] as const;
export const TRANSFER_FIELDS = ['departmentId', 'positionId', 'managerId', 'locationId'] as const;
export const EMPLOYMENT_FIELDS = [
  'jobTitle', 'gradeId', 'endDate', 'noticePeriodDays', 'noticeTermsReference', 'remunerationReference',
  'employmentCategoryCode', 'workScheduleReference', 'documentRecordId',
] as const;

export type ChangeType = 'PERSONAL' | 'TRANSFER' | 'EMPLOYMENT';

const FIELDS_BY_TYPE: Record<ChangeType, readonly string[]> = {
  PERSONAL: PERSONAL_FIELDS,
  TRANSFER: TRANSFER_FIELDS,
  EMPLOYMENT: EMPLOYMENT_FIELDS,
};

async function materialChangesRequireApproval(db: Db): Promise<boolean> {
  const cfg = await db.policyConfiguration.findFirst({
    where: { code: 'EMPLOYEE_CHANGE_APPROVAL', status: 'ACTIVE', effectiveFrom: { lte: new Date() } },
    orderBy: { version: 'desc' },
  });
  const values = parseJson<Record<string, unknown>>(cfg?.values, {});
  // Safe default: approval IS required unless an approved configuration explicitly disables it.
  return values.materialChangesRequireApproval !== false;
}

async function validateChange(db: Db, employeeId: string, type: ChangeType, changes: Record<string, any>, effectiveDate: Date) {
  const allowed = FIELDS_BY_TYPE[type];
  const keys = Object.keys(changes);
  if (keys.length === 0) throw validation('No changes supplied');
  const illegal = keys.filter((k) => !allowed.includes(k));
  if (illegal.length) throw validation(`Fields not permitted for ${type} change: ${illegal.join(', ')}`);

  if (type === 'TRANSFER') {
    const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const departmentId = changes.departmentId ?? emp.departmentId;
    const positionId = 'positionId' in changes ? changes.positionId : emp.positionId;
    await assertOrgRefs(db, { departmentId, positionId, locationId: changes.locationId });
    if ('managerId' in changes) await assertNoCircularReporting(db, employeeId, changes.managerId);
    const open = await db.reportingAssignmentHistory.findFirst({ where: { employeeId, effectiveTo: null }, orderBy: { effectiveFrom: 'desc' } });
    if (open && effectiveDate <= open.effectiveFrom) {
      throw validation(
        `Effective date overlaps existing reporting history: must be after the current assignment start (${open.effectiveFrom.toISOString().slice(0, 10)}). Historical assignments cannot be rewritten.`,
      );
    }
  }
  if (type === 'EMPLOYMENT') {
    if (changes.gradeId) await assertOrgRefs(db, { gradeId: changes.gradeId });
    if (changes.employmentCategoryCode) {
      const cat = await db.employmentCategory.findUnique({ where: { code: changes.employmentCategoryCode } });
      if (!cat || cat.status !== 'ACTIVE') throw validation(`Employment category '${changes.employmentCategoryCode}' is not ACTIVE`);
    }
    const active = await db.employmentAgreement.findFirst({ where: { employeeId, status: 'ACTIVE' } });
    if (!active) throw validation('Employee has no active employment agreement to amend');
    if (effectiveDate <= active.effectiveFrom) {
      throw validation('Effective date must be after the current agreement version start; prior versions cannot be rewritten');
    }
    if (changes.endDate && new Date(changes.endDate) <= active.startDate) throw validation('Contract end date must be after start date');
  }
}

async function snapshot(db: Db, employeeId: string, type: ChangeType, keys: string[]) {
  const emp: any = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  if (type === 'EMPLOYMENT') {
    const agr: any = await db.employmentAgreement.findFirst({ where: { employeeId, status: 'ACTIVE' } });
    return Object.fromEntries(keys.map((k) => [k, agr?.[k] ?? null]));
  }
  return Object.fromEntries(keys.map((k) => [k, emp[k] ?? null]));
}

export async function submitChangeRequest(
  prisma: PrismaClient,
  auth: AuthContext,
  employeeId: string,
  input: { changeType: ChangeType; changes: Record<string, any>; effectiveDate?: string; reason: string },
  source: 'HR' | 'SELF_SERVICE',
) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw notFound('Employee', employeeId);
  if (!emp.isActive) throw conflict('Employee record is deactivated');

  const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
  await validateChange(prisma, employeeId, input.changeType, input.changes, effectiveDate);

  const pending = await prisma.employeeChangeRequest.findFirst({
    where: { employeeId, changeType: input.changeType, status: { in: ['PENDING', 'APPROVED_SCHEDULED'] } },
  });
  if (pending) throw conflict(`A ${input.changeType} change request is already pending for this employee (${pending.id})`);

  const previousValues = await snapshot(prisma, employeeId, input.changeType, Object.keys(input.changes));
  const cr = await prisma.employeeChangeRequest.create({
    data: {
      employeeId,
      changeType: input.changeType,
      source,
      requestedChanges: JSON.stringify(input.changes),
      previousValues: JSON.stringify(previousValues),
      effectiveDate,
      reason: input.reason,
      requestedById: auth.userId,
    },
  });

  const needsApproval =
    source === 'SELF_SERVICE' || (input.changeType !== 'PERSONAL' && (await materialChangesRequireApproval(prisma)));

  if (!needsApproval) {
    const applied = await prisma.$transaction(async (tx) => {
      await tx.employeeChangeRequest.update({
        where: { id: cr.id },
        data: { reviewComments: 'No approval required by configuration', reviewedAt: new Date() },
      });
      return finaliseApproved(tx, cr.id, auth.userId);
    });
    return { changeRequest: applied, approvalRequired: false };
  }

  await notifyRole(prisma, 'head_of_hr', {
    title: 'Employee change request awaiting review',
    message: `${input.changeType} change for ${emp.firstName} ${emp.lastName} (${emp.employeeNumber}) requires review.`,
    deepLink: `/change-requests/${cr.id}`,
    idempotencyKey: `cr-submitted:${cr.id}`,
  });
  return { changeRequest: cr, approvalRequired: true };
}

export async function reviewChangeRequest(
  prisma: PrismaClient,
  auth: AuthContext,
  id: string,
  decision: 'APPROVE' | 'REJECT',
  comments: string,
) {
  const cr = await prisma.employeeChangeRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!cr) throw notFound('EmployeeChangeRequest', id);
  if (cr.status !== 'PENDING') throw conflict(`Change request is ${cr.status}; only PENDING requests can be reviewed`);

  const needed = cr.changeType === 'PERSONAL' ? 'employees.update' : 'employees.lifecycle';
  if (!auth.permissions.has(needed)) throw forbidden(`Access denied: requires permission (${needed})`);
  if (cr.requestedById === auth.userId) throw forbidden('Self-approval violation: requester cannot review their own change request');
  if (cr.employee.userId === auth.userId) throw forbidden('Self-approval violation: you cannot approve changes to your own record');

  if (decision === 'REJECT') {
    const rejected = await prisma.employeeChangeRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: auth.userId, reviewedAt: new Date(), reviewComments: comments },
    });
    if (cr.source === 'SELF_SERVICE' && cr.employee.profileCompletionStatus === 'SUBMITTED') {
      await prisma.employee.update({ where: { id: cr.employeeId }, data: { profileCompletionStatus: 'RETURNED' } });
    }
    if (cr.employee.userId) {
      await notifyUser(prisma, cr.employee.userId, {
        title: 'Profile change returned',
        message: `Your ${cr.changeType.toLowerCase()} change request was not approved: ${comments}`,
        idempotencyKey: `cr-rejected:${cr.id}`,
      });
    }
    return rejected;
  }

  // Re-validate against current state at approval time
  await validateChange(prisma, cr.employeeId, cr.changeType as ChangeType, parseJson(cr.requestedChanges, {}), cr.effectiveDate);
  return prisma.$transaction(async (tx) => {
    await tx.employeeChangeRequest.update({
      where: { id },
      data: { reviewedById: auth.userId, reviewedAt: new Date(), reviewComments: comments },
    });
    return finaliseApproved(tx, id, auth.userId);
  });
}

/** Applies now if effective, otherwise schedules for the lifecycle job. */
async function finaliseApproved(tx: Db, id: string, actorUserId: string) {
  const cr = await tx.employeeChangeRequest.findUniqueOrThrow({ where: { id } });
  if (cr.effectiveDate > new Date()) {
    return tx.employeeChangeRequest.update({ where: { id }, data: { status: 'APPROVED_SCHEDULED' } });
  }
  await applyChangeRequest(tx, id, actorUserId);
  return tx.employeeChangeRequest.findUniqueOrThrow({ where: { id } });
}

export async function applyChangeRequest(tx: Db, id: string, actorUserId: string): Promise<void> {
  const cr = await tx.employeeChangeRequest.findUniqueOrThrow({ where: { id } });
  const changes = parseJson<Record<string, any>>(cr.requestedChanges, {});
  const emp = await tx.employee.findUniqueOrThrow({ where: { id: cr.employeeId } });
  const eff = cr.effectiveDate;

  if (cr.changeType === 'PERSONAL') {
    const data: Record<string, any> = { ...changes };
    if (data.dateOfBirth) data.dateOfBirth = new Date(data.dateOfBirth);
    if (cr.source === 'SELF_SERVICE') data.profileCompletionStatus = 'APPROVED';
    await tx.employee.update({ where: { id: emp.id }, data });
    await publishLifecycleEvent(tx, {
      employeeId: emp.id, eventType: 'PERSONAL_DETAILS_CHANGED', effectiveDate: eff,
      payload: { fieldsChanged: Object.keys(changes) }, sourceType: 'EmployeeChangeRequest', sourceId: cr.id, actorUserId, reason: cr.reason,
    });
  } else if (cr.changeType === 'TRANSFER') {
    // Re-check hierarchy at application time (scheduled changes may run later)
    if ('managerId' in changes) await assertNoCircularReporting(tx, emp.id, changes.managerId);
    const open = await tx.reportingAssignmentHistory.findFirst({ where: { employeeId: emp.id, effectiveTo: null }, orderBy: { effectiveFrom: 'desc' } });
    if (open) await tx.reportingAssignmentHistory.update({ where: { id: open.id }, data: { effectiveTo: eff } });
    const next = {
      departmentId: changes.departmentId ?? emp.departmentId,
      positionId: 'positionId' in changes ? changes.positionId : emp.positionId,
      managerId: 'managerId' in changes ? changes.managerId : emp.managerId,
      locationId: 'locationId' in changes ? changes.locationId : emp.locationId,
    };
    await tx.reportingAssignmentHistory.create({
      data: {
        employeeId: emp.id, ...next, departmentId: next.departmentId!, effectiveFrom: eff,
        reason: cr.reason, changedById: actorUserId, approvalReference: `EmployeeChangeRequest:${cr.id}`,
      },
    });
    await tx.employee.update({ where: { id: emp.id }, data: next });
    const onlyManager = Object.keys(changes).every((k) => k === 'managerId');
    await publishLifecycleEvent(tx, {
      employeeId: emp.id, eventType: onlyManager ? 'MANAGER_CHANGED' : 'TRANSFERRED', effectiveDate: eff,
      payload: { from: { departmentId: emp.departmentId, positionId: emp.positionId, managerId: emp.managerId, locationId: emp.locationId }, to: next },
      sourceType: 'EmployeeChangeRequest', sourceId: cr.id, actorUserId, reason: cr.reason,
    });
    // Probation supervisor follows the new manager for open probation records
    if ('managerId' in changes) {
      await tx.probationRecord.updateMany({ where: { employeeId: emp.id, decision: null }, data: { supervisorEmployeeId: changes.managerId } });
    }
    if (!onlyManager) {
      await tx.ictAccessRequest.create({
        data: {
          employeeId: emp.id, requestType: 'MOVER', accessProfile: 'TO_BE_CONFIRMED_BY_ICT', startDate: eff,
          managerEmployeeId: next.managerId, status: 'PENDING', requestedById: actorUserId,
          completionNotes: null,
        },
      });
    }
  } else if (cr.changeType === 'EMPLOYMENT') {
    const active = await tx.employmentAgreement.findFirstOrThrow({ where: { employeeId: emp.id, status: 'ACTIVE' } });
    await tx.employmentAgreement.update({ where: { id: active.id }, data: { status: 'SUPERSEDED', effectiveTo: eff } });
    const { id: _id, createdAt: _c, updatedAt: _u, ...base } = active;
    const data: any = { ...base, ...changes };
    if (data.endDate) data.endDate = new Date(data.endDate);
    await tx.employmentAgreement.create({
      data: {
        ...data, version: active.version + 1, status: 'ACTIVE', effectiveFrom: eff, effectiveTo: null,
        changeReason: cr.reason, changedById: actorUserId, approvalReference: `EmployeeChangeRequest:${cr.id}`,
      },
    });
    if (changes.gradeId) await tx.employee.update({ where: { id: emp.id }, data: { gradeId: changes.gradeId } });
    await publishLifecycleEvent(tx, {
      employeeId: emp.id, eventType: 'EMPLOYMENT_CHANGED', effectiveDate: eff,
      payload: { fieldsChanged: Object.keys(changes).filter((k) => k !== 'remunerationReference'), agreementVersion: active.version + 1 },
      sourceType: 'EmployeeChangeRequest', sourceId: cr.id, actorUserId, reason: cr.reason,
    });
  }

  await tx.employeeChangeRequest.update({ where: { id: cr.id }, data: { status: 'APPLIED', appliedAt: new Date() } });
}
