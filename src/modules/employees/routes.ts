import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict, forbidden, validation } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import {
  loadEmployeeForActor,
  resolveEmployeeAccess,
  canAccessDocument,
  getReportingLineIds,
  getActorEmployeeId,
} from './access.js';
import { projectEmployee, EMPLOYEE_LIST_SELECT } from './masking.js';
import { assertValidStatusTransition, TERMINAL_STATUSES } from './lifecycle.js';
import {
  createEmployee,
  submitChangeRequest,
  reviewChangeRequest,
  type ChangeType,
} from './service.js';
import { runLifecycleJobs } from './jobs.js';
import { publishLifecycleEvent } from './events.js';
import { generateSignedDownloadToken } from '../../core/storage/storage.js';
import { auditCtx, zDate, parseJson } from './util.js';

export function createEmployeesRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. Search / Filter / Paginate Employees
  registerRoute(router, deps, {
    method: 'get',
    path: '/employees',
    auth: { permission: ['employees.view', 'employees.view_team'], any: true },
    query: z
      .object({
        departmentId: z.string().uuid().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .optional(),
    handler: async ({ query, auth, deps }) => {
      const where: any = {};
      if (query?.departmentId) where.departmentId = query.departmentId;
      if (query?.status) where.status = query.status;

      if (query?.search) {
        where.OR = [
          { firstName: { contains: query.search } },
          { lastName: { contains: query.search } },
          { employeeNumber: { contains: query.search } },
          { workEmail: { contains: query.search } },
        ];
      }

      // If actor does NOT have directory-wide view, scope to their reporting line
      if (!auth.permissions.has('employees.view')) {
        const actorEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
        if (!actorEmpId) {
          return { total: 0, limit: query?.limit ?? 50, offset: query?.offset ?? 0, items: [] };
        }
        const reportIds = await getReportingLineIds(deps.prisma, actorEmpId);
        where.id = { in: Array.from(reportIds) };
      }

      const [employees, total] = await Promise.all([
        deps.prisma.employee.findMany({
          where,
          select: EMPLOYEE_LIST_SELECT,
          orderBy: { createdAt: 'desc' },
          take: query?.limit ?? 50,
          skip: query?.offset ?? 0,
        }),
        deps.prisma.employee.count({ where }),
      ]);

      return {
        total,
        limit: query?.limit ?? 50,
        offset: query?.offset ?? 0,
        items: employees,
      };
    },
  });

  // 2. Progressive Employee Creation (EMP-01, EMP-02, EMP-04, EMP-05)
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees',
    auth: { permission: 'employees.create' },
    successStatus: 201,
    body: z.object({
      employeeNumber: z.string().optional(),
      userId: z.string().uuid().optional(),
      firstName: z.string().min(2).max(50),
      middleName: z.string().max(50).optional(),
      lastName: z.string().min(2).max(50),
      preferredName: z.string().max(50).optional(),
      dateOfBirth: zDate.optional(),
      gender: z.string().max(20).optional(),
      personalEmail: z.string().email().optional(),
      workEmail: z.string().email(),
      phoneNumber: z.string().min(8).max(20),
      emergencyContactName: z.string().max(100).optional(),
      emergencyContactPhone: z.string().max(20).optional(),
      emergencyContactRelationship: z.string().max(50).optional(),
      nextOfKinName: z.string().max(100).optional(),
      nextOfKinPhone: z.string().max(20).optional(),
      nextOfKinRelationship: z.string().max(50).optional(),

      // Statutory & Banking details (AES-256-GCM Vault encrypted)
      nationalId: z.string().min(4).max(30).optional(),
      kraPin: z.string().min(5).max(30).optional(),
      nssfNumber: z.string().max(30).optional(),
      shifNumber: z.string().max(30).optional(),
      bankName: z.string().max(100).optional(),
      bankBranch: z.string().max(100).optional(),
      bankAccountNumber: z.string().max(50).optional(),

      // Employment Agreement parameters
      employmentCategoryCode: z.string().min(1),
      startDate: zDate,
      endDate: zDate.optional(),
      probationStartDate: zDate.optional(),
      probationEndDate: zDate.optional(),
      noticePeriodDays: z.number().int().min(0).max(365).optional(),
      noticeTermsReference: z.string().max(200).optional(),
      remunerationReference: z.string().max(100).optional(),
      workScheduleReference: z.string().max(100).optional(),
      contractDocumentId: z.string().uuid().optional(),
      jobTitle: z.string().min(2).max(100),

      // Organisation links
      departmentId: z.string().uuid(),
      positionId: z.string().uuid().optional(),
      gradeId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      managerId: z.string().uuid().optional(),

      // ICT Joiner Access Profile
      ictAccessProfile: z.string().default('STANDARD_OFFICE_365'),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const result = await createEmployee(deps.prisma, auth, body);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CREATE',
        targetType: 'Employee',
        targetId: result.employee.id,
        outcome: 'SUCCESS',
        after: {
          employeeNumber: result.employee.employeeNumber,
          workEmail: result.employee.workEmail,
          category: body.employmentCategoryCode,
        },
      });

      const access = await resolveEmployeeAccess(deps.prisma, auth, result.employee);
      return {
        ...result,
        employee: projectEmployee(result.employee, access),
      };
    },
  });

  // 3. Get Single Employee Profile (Field-Level Permissions & IDOR/BOLA Defense)
  registerRoute(router, deps, {
    method: 'get',
    path: '/employees/:id',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const { emp, access } = await loadEmployeeForActor(deps.prisma, auth, params.id);

      const fullRecord = await deps.prisma.employee.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          department: true,
          position: true,
          grade: true,
          location: true,
          manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          agreements: { orderBy: { version: 'desc' } },
          reportingHistory: { orderBy: { effectiveFrom: 'desc' } },
          documents: {
            include: {
              documentRecord: { select: { fileName: true, mimeType: true, fileSizeBytes: true, checksumSha256: true } },
            },
          },
          onboardingTasks: { orderBy: { dueDate: 'asc' } },
          probationRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
          changeRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });

      return projectEmployee(fullRecord, access);
    },
  });

  // 4. Update Employee Master Data / Self-Service Profile Completion
  registerRoute(router, deps, {
    method: 'patch',
    path: '/employees/:id',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      firstName: z.string().min(2).max(50).optional(),
      middleName: z.string().max(50).optional(),
      lastName: z.string().min(2).max(50).optional(),
      preferredName: z.string().max(50).optional(),
      phoneNumber: z.string().min(8).max(20).optional(),
      personalEmail: z.string().email().optional(),
      emergencyContactName: z.string().max(100).optional(),
      emergencyContactPhone: z.string().max(20).optional(),
      emergencyContactRelationship: z.string().max(50).optional(),
      nextOfKinName: z.string().max(100).optional(),
      nextOfKinPhone: z.string().max(20).optional(),
      nextOfKinRelationship: z.string().max(50).optional(),
      dateOfBirth: zDate.optional(),
      gender: z.string().max(20).optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const { emp, access } = await loadEmployeeForActor(deps.prisma, auth, params.id);

      // Self-service profile updates or HR updates
      if (!access.isSelf && !access.isHr) {
        throw forbidden('Access denied: only the employee or HR can update personal details');
      }

      const source = access.isSelf ? 'SELF_SERVICE' : 'HR';
      const result = await submitChangeRequest(
        deps.prisma,
        auth,
        params.id,
        {
          changeType: 'PERSONAL',
          changes: body,
          reason: access.isSelf ? 'Employee self-service profile update' : 'HR personal details update',
        },
        source,
      );

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_PERSONAL_UPDATE_SUBMITTED',
        targetType: 'Employee',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { changeRequestId: result.changeRequest.id, approvalRequired: result.approvalRequired },
      });

      return result;
    },
  });

  // 5. Submit Material Change Request (Transfer / Employment)
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/:id/changes',
    auth: { permission: 'employees.lifecycle' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      changeType: z.enum(['PERSONAL', 'TRANSFER', 'EMPLOYMENT']),
      changes: z.record(z.any()),
      effectiveDate: zDate.optional(),
      reason: z.string().min(5).max(500),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const result = await submitChangeRequest(
        deps.prisma,
        auth,
        params.id,
        {
          changeType: body.changeType as ChangeType,
          changes: body.changes,
          effectiveDate: body.effectiveDate,
          reason: body.reason,
        },
        'HR',
      );

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `EMPLOYEE_${body.changeType}_CHANGE_REQUESTED`,
        targetType: 'EmployeeChangeRequest',
        targetId: result.changeRequest.id,
        outcome: 'SUCCESS',
        after: { employeeId: params.id, reason: body.reason },
      });

      return result;
    },
  });

  // 6. Review Change Request (Maker-Checker / Self-Approval Prevention)
  registerRoute(router, deps, {
    method: 'post',
    path: '/change-requests/:id/review',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      decision: z.enum(['APPROVE', 'REJECT']),
      comments: z.string().min(3).max(500),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const reviewed = await reviewChangeRequest(
        deps.prisma,
        auth,
        params.id,
        body.decision,
        body.comments,
      );

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `CHANGE_REQUEST_${body.decision}D`,
        targetType: 'EmployeeChangeRequest',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { decision: body.decision, comments: body.comments },
      });

      return reviewed;
    },
  });

  // 7. Employment Status Transition
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/:id/status',
    auth: { permission: 'employees.lifecycle' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      newStatus: z.string(),
      reason: z.string().min(5).max(500),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const emp = await deps.prisma.employee.findUnique({ where: { id: params.id } });
      if (!emp) throw notFound('Employee', params.id);

      assertValidStatusTransition(emp.status, body.newStatus);

      const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(body.newStatus);
      const updated = await deps.prisma.employee.update({
        where: { id: params.id },
        data: {
          status: body.newStatus,
          isActive: !isTerminal,
          deactivatedAt: isTerminal ? new Date() : emp.deactivatedAt,
          deactivationReason: isTerminal ? body.reason : emp.deactivationReason,
        },
      });

      await publishLifecycleEvent(deps.prisma, {
        employeeId: emp.id,
        eventType: isTerminal ? 'EMPLOYEE_DEACTIVATED' : 'STATUS_CHANGED',
        effectiveDate: new Date(),
        payload: { previousStatus: emp.status, newStatus: body.newStatus },
        sourceType: 'Employee',
        sourceId: emp.id,
        actorUserId: auth.userId,
        reason: body.reason,
      });

      // If terminated/resigned, track Leaver ICT request
      if (isTerminal) {
        await deps.prisma.ictAccessRequest.create({
          data: {
            employeeId: emp.id,
            requestType: 'LEAVER',
            accessProfile: 'DEACTIVATE_ALL',
            startDate: new Date(),
            status: 'PENDING',
            requestedById: auth.userId,
          },
        });
      }

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_STATUS_TRANSITION',
        targetType: 'Employee',
        targetId: params.id,
        outcome: 'SUCCESS',
        before: { status: emp.status },
        after: { status: body.newStatus, reason: body.reason },
      });

      const access = await resolveEmployeeAccess(deps.prisma, auth, updated);
      return projectEmployee(updated, access);
    },
  });

  // 8. Attach Document to Employee Register
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/:id/documents',
    auth: { permission: 'employees.update' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      documentRecordId: z.string().uuid(),
      documentType: z.enum([
        'CONTRACT',
        'JOB_DESCRIPTION',
        'ID_EVIDENCE',
        'STATUTORY_FORM',
        'QUALIFICATION',
        'MEDICAL',
        'PROBATION_FORM',
        'ONBOARDING_EVIDENCE',
        'OTHER',
      ]),
      visibility: z
        .enum(['HR_EMPLOYEE_MANAGER', 'HR_AND_EMPLOYEE', 'CONFIDENTIAL', 'HR_ONLY', 'MEDICAL_RESTRICTED'])
        .default('HR_AND_EMPLOYEE'),
      issueDate: zDate.optional(),
      expiryDate: zDate.optional(),
      reminderDaysBefore: z.number().int().min(1).max(180).optional(),
      notes: z.string().max(500).optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const emp = await deps.prisma.employee.findUnique({ where: { id: params.id } });
      if (!emp) throw notFound('Employee', params.id);

      const docRecord = await deps.prisma.documentRecord.findUnique({
        where: { id: body.documentRecordId },
      });
      if (!docRecord) throw notFound('DocumentRecord', body.documentRecordId);

      // Force MEDICAL_RESTRICTED visibility for medical docs
      const visibility = body.documentType === 'MEDICAL' ? 'MEDICAL_RESTRICTED' : body.visibility;

      const empDoc = await deps.prisma.employeeDocument.create({
        data: {
          employeeId: params.id,
          documentRecordId: body.documentRecordId,
          documentType: body.documentType,
          visibility,
          issueDate: body.issueDate ? new Date(body.issueDate) : null,
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
          reminderDaysBefore: body.reminderDaysBefore,
          uploadedById: auth.userId,
          notes: body.notes,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_DOCUMENT_ATTACHED',
        targetType: 'EmployeeDocument',
        targetId: empDoc.id,
        outcome: 'SUCCESS',
        after: { employeeId: params.id, documentType: body.documentType, visibility },
      });

      return empDoc;
    },
  });

  // 9. Request Download Token for an Employee Document
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/:id/documents/:docId/token',
    auth: 'session',
    params: z.object({ id: z.string().uuid(), docId: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const { emp, access } = await loadEmployeeForActor(deps.prisma, auth, params.id);

      const empDoc = await deps.prisma.employeeDocument.findFirst({
        where: { id: params.docId, employeeId: params.id },
        include: { documentRecord: true },
      });
      if (!empDoc || empDoc.status !== 'ACTIVE') throw notFound('EmployeeDocument', params.docId);

      if (!canAccessDocument(access, empDoc.visibility)) {
        throw forbidden('Access denied: insufficient permission to view or download this document');
      }

      const downloadToken = generateSignedDownloadToken(empDoc.documentRecordId, 300);
      return {
        documentId: empDoc.documentRecordId,
        fileName: empDoc.documentRecord.fileName,
        downloadToken,
        expiresInSeconds: 300,
        downloadUrl: `/api/v1/documents/download?token=${downloadToken}`,
      };
    },
  });

  // 10. List My Assigned Onboarding Tasks + Update / Complete Onboarding Task
  registerRoute(router, deps, {
    method: 'get',
    path: '/onboarding-tasks/mine',
    auth: 'session',
    handler: async ({ auth, deps }) => {
      const emp = await deps.prisma.employee.findFirst({
        where: { OR: [{ userId: auth.userId }, { workEmail: auth.email.toLowerCase() }] },
        select: { id: true },
      });

      const orFilters: any[] = [{ assignedUserId: auth.userId }];
      if (auth.roles.length > 0) {
        orFilters.push({ assignedRoleKey: { in: auth.roles } });
      }
      if (emp) {
        orFilters.push({ ownerType: 'EMPLOYEE', employeeId: emp.id });
        orFilters.push({ ownerType: 'MANAGER', employee: { managerId: emp.id } });
      }

      return deps.prisma.onboardingTask.findMany({
        where: { OR: orFilters },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              workEmail: true,
              status: true,
              onboardingCompletedAt: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      });
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/onboarding-tasks/:taskId',
    auth: 'session',
    params: z.object({ taskId: z.string().uuid() }),
    body: z.object({
      status: z.enum(['IN_PROGRESS', 'COMPLETED', 'WAIVED']),
      completionNotes: z.string().max(500).optional(),
      evidenceDocumentId: z.string().uuid().optional(),
      waiverReason: z.string().max(500).optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const task = await deps.prisma.onboardingTask.findUnique({
        where: { id: params.taskId },
        include: {
          employee: {
            include: {
              manager: { select: { userId: true } },
            },
          },
        },
      });
      if (!task) throw notFound('OnboardingTask', params.taskId);

      // Access checks: task owner, employee/manager relationship, or HR
      const isHR = auth.permissions.has('onboarding.manage') || auth.permissions.has('employees.update');
      const isAssigned = task.assignedUserId === auth.userId;
      const isRoleAssigned = task.assignedRoleKey && auth.roles.includes(task.assignedRoleKey);
      const isSelfEmployeeTask = task.ownerType === 'EMPLOYEE' && task.employee.userId === auth.userId;
      const isLineManagerTask = task.ownerType === 'MANAGER' && task.employee.manager?.userId === auth.userId;

      if (!isHR && !isAssigned && !isRoleAssigned && !isSelfEmployeeTask && !isLineManagerTask) {
        throw forbidden('Access denied: you are not assigned to complete this onboarding task');
      }

      if (body.status === 'COMPLETED' && task.evidenceRequired && !body.evidenceDocumentId) {
        throw validation(`Evidence document is strictly required to complete task '${task.taskTitle}'`);
      }

      if (body.status === 'WAIVED') {
        if (!isHR) throw forbidden('Only HR can waive onboarding checklist tasks');
        if (!body.waiverReason) throw validation('A documented waiver reason is mandatory to waive a task');
      }

      const updated = await deps.prisma.onboardingTask.update({
        where: { id: params.taskId },
        data: {
          status: body.status,
          completedAt: body.status === 'COMPLETED' ? new Date() : task.completedAt,
          completedById: body.status === 'COMPLETED' ? auth.userId : task.completedById,
          completionNotes: body.completionNotes,
          evidenceDocumentId: body.evidenceDocumentId,
          waiverReason: body.waiverReason,
        },
      });

      // If all onboarding tasks are done, update employee onboarding completion
      const remaining = await deps.prisma.onboardingTask.count({
        where: { employeeId: task.employeeId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      });

      if (remaining === 0) {
        await deps.prisma.employee.update({
          where: { id: task.employeeId },
          data: { onboardingCompletedAt: new Date(), onboardingCompletedById: auth.userId },
        });

        await publishLifecycleEvent(deps.prisma, {
          employeeId: task.employeeId,
          eventType: 'ONBOARDING_COMPLETED',
          effectiveDate: new Date(),
          payload: { completedBy: auth.userId },
          sourceType: 'OnboardingTask',
          sourceId: task.id,
          actorUserId: auth.userId,
        });
      }

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `ONBOARDING_TASK_${body.status}`,
        targetType: 'OnboardingTask',
        targetId: params.taskId,
        outcome: 'SUCCESS',
        after: { title: task.taskTitle, status: body.status },
      });

      return updated;
    },
  });

  // 11. ICT Access Requests List & Fulfillment
  registerRoute(router, deps, {
    method: 'get',
    path: '/ict-requests',
    auth: { permission: ['ict.access.fulfil', 'onboarding.manage'], any: true },
    handler: async ({ deps }) => {
      return deps.prisma.ictAccessRequest.findMany({
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, workEmail: true },
          },
        },
        orderBy: { requestedAt: 'desc' },
      });
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/ict-requests/:id',
    auth: { permission: 'ict.access.fulfil' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      status: z.enum(['IN_PROGRESS', 'COMPLETED', 'REJECTED']),
      completionNotes: z.string().min(3).max(500),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const ictReq = await deps.prisma.ictAccessRequest.findUnique({ where: { id: params.id } });
      if (!ictReq) throw notFound('IctAccessRequest', params.id);

      const now = new Date();
      let syncedOnboardingTasks = 0;

      const updated = await deps.prisma.$transaction(async (tx) => {
        const reqUpdated = await tx.ictAccessRequest.update({
          where: { id: params.id },
          data: {
            status: body.status,
            completionNotes: body.completionNotes,
            completedById: body.status === 'COMPLETED' ? auth.userId : ictReq.completedById,
            completedAt: body.status === 'COMPLETED' ? now : ictReq.completedAt,
          },
        });

        if (body.status === 'COMPLETED' && ictReq.requestType === 'JOINER') {
          const openIctTasks = await tx.onboardingTask.findMany({
            where: {
              employeeId: ictReq.employeeId,
              ownerType: 'ICT',
              status: { in: ['PENDING', 'IN_PROGRESS'] },
            },
          });

          for (const ictTask of openIctTasks) {
            await tx.onboardingTask.update({
              where: { id: ictTask.id },
              data: {
                status: 'COMPLETED',
                completedAt: now,
                completedById: auth.userId,
                completionNotes: body.completionNotes,
              },
            });
            syncedOnboardingTasks++;
          }

          if (openIctTasks.length > 0) {
            const remaining = await tx.onboardingTask.count({
              where: { employeeId: ictReq.employeeId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
            });
            if (remaining === 0) {
              await tx.employee.update({
                where: { id: ictReq.employeeId },
                data: { onboardingCompletedAt: now, onboardingCompletedById: auth.userId },
              });
              await publishLifecycleEvent(tx, {
                employeeId: ictReq.employeeId,
                eventType: 'ONBOARDING_COMPLETED',
                effectiveDate: now,
                payload: { completedBy: auth.userId, trigger: 'ICT_REQUEST_COMPLETED' },
                sourceType: 'IctAccessRequest',
                sourceId: ictReq.id,
                actorUserId: auth.userId,
              });
            }
          }
        }

        return reqUpdated;
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `ICT_REQUEST_${body.status}`,
        targetType: 'IctAccessRequest',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: {
          requestType: ictReq.requestType,
          status: body.status,
          notes: body.completionNotes,
          syncedOnboardingTasks,
        },
      });

      return { ...updated, syncedOnboardingTasks };
    },
  });

  // 12. Probation Objectives Assignment
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/probation/:id/objectives',
    auth: { permission: 'probation.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      objectives: z
        .array(
          z.object({
            objective: z.string().min(5).max(300),
            expectedOutput: z.string().min(5).max(300),
          }),
        )
        .min(1)
        .max(10),
      supportRequired: z.string().max(500).optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const prob = await deps.prisma.probationRecord.findUnique({
        where: { id: params.id },
        include: { employee: true },
      });
      if (!prob) throw notFound('ProbationRecord', params.id);

      const updated = await deps.prisma.probationRecord.update({
        where: { id: params.id },
        data: {
          objectives: JSON.stringify(body.objectives),
          supportRequired: body.supportRequired,
          objectivesSetById: auth.userId,
          objectivesSetAt: new Date(),
          status: 'OBJECTIVES_SET',
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'PROBATION_OBJECTIVES_ASSIGNED',
        targetType: 'ProbationRecord',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { objectivesCount: body.objectives.length },
      });

      return updated;
    },
  });

  // 13. Probation Evaluation (6 Ndakala Values + Objectives Assessment)
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/probation/:id/evaluate',
    auth: { permission: 'probation.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      sixValuesAssessment: z.array(
        z.object({
          valueName: z.enum([
            'Customer First',
            'Credibility & Trust',
            'Competitive & Results Oriented',
            'Inquisitive & Innovative',
            'Collaborative',
            'Simple & Agile',
          ]),
          rating: z.enum(['Excellent', 'Very Good', 'Good', 'Needs Improvement', 'Unacceptable']),
          evidenceComments: z.string().min(5),
        }),
      ),
      objectives: z.array(
        z.object({
          objective: z.string(),
          expectedOutput: z.string(),
          achievementStatus: z.string(),
        }),
      ),
      supervisorComments: z.string().min(5),
      employeeComments: z.string().optional(),
      hrComments: z.string().optional(),
      recommendation: z.enum(['CONFIRM', 'EXTEND', 'TERMINATE']),
      recommendationReason: z.string().min(5),
      proposedExtensionEnd: zDate.optional(),
      policyReviewNotes: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const prob = await deps.prisma.probationRecord.findUnique({ where: { id: params.id } });
      if (!prob) throw notFound('ProbationRecord', params.id);

      // Flag policy review if EXTEND or TERMINATE
      const policyReviewRequired = body.recommendation === 'EXTEND' || body.recommendation === 'TERMINATE';

      const updated = await deps.prisma.probationRecord.update({
        where: { id: params.id },
        data: {
          status: 'ASSESSED',
          valuesAssessment: JSON.stringify(body.sixValuesAssessment),
          objectives: JSON.stringify(body.objectives),
          supervisorComments: body.supervisorComments,
          employeeComments: body.employeeComments,
          hrComments: body.hrComments,
          recommendation: body.recommendation,
          recommendationReason: body.recommendationReason,
          proposedExtensionEnd: body.proposedExtensionEnd ? new Date(body.proposedExtensionEnd) : null,
          recommendedById: auth.userId,
          recommendedAt: new Date(),
          policyReviewRequired,
          policyReviewNotes: body.policyReviewNotes,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'PROBATION_EVALUATION_SUBMITTED',
        targetType: 'ProbationRecord',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { recommendation: body.recommendation, policyReviewRequired },
      });

      return updated;
    },
  });

  // 14. Probation Human Decision (Confirmation / Extension / Termination)
  registerRoute(router, deps, {
    method: 'post',
    path: '/employees/probation/:id/decision',
    auth: { permission: 'probation.decide' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      decision: z.enum(['CONFIRMED', 'EXTENDED', 'TERMINATION_APPROVED']),
      decisionReason: z.string().min(5).max(500),
      extendedEndDate: zDate.optional(),
      supportingDocumentId: z.string().uuid().optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const prob = await deps.prisma.probationRecord.findUnique({
        where: { id: params.id },
        include: { employee: true },
      });
      if (!prob) throw notFound('ProbationRecord', params.id);

      if (prob.status !== 'ASSESSED') {
        throw validation('Probation evaluation must be completed and assessed before recording a final decision');
      }

      if (body.decision === 'EXTENDED' && !body.extendedEndDate) {
        throw validation('An extended end date is required when extending probation');
      }

      const now = new Date();
      let nextStatus = 'ACTIVE';
      let eventType: any = 'PROBATION_CONFIRMED';

      if (body.decision === 'CONFIRMED') {
        nextStatus = 'ACTIVE';
        eventType = 'PROBATION_CONFIRMED';
      } else if (body.decision === 'EXTENDED') {
        nextStatus = 'PROBATION';
        eventType = 'PROBATION_EXTENDED';
      } else if (body.decision === 'TERMINATION_APPROVED') {
        nextStatus = 'TERMINATED';
        eventType = 'PROBATION_TERMINATION_APPROVED';
      }

      const updated = await deps.prisma.$transaction(async (tx) => {
        const pr = await tx.probationRecord.update({
          where: { id: params.id },
          data: {
            status: 'DECIDED',
            decision: body.decision,
            decisionById: auth.userId,
            decisionAt: now,
            decisionReason: body.decisionReason,
            extendedEndDate: body.extendedEndDate ? new Date(body.extendedEndDate) : null,
            supportingDocumentId: body.supportingDocumentId,
          },
        });

        await tx.employee.update({
          where: { id: prob.employeeId },
          data: {
            status: nextStatus,
            isActive: body.decision !== 'TERMINATION_APPROVED',
            deactivatedAt: body.decision === 'TERMINATION_APPROVED' ? now : null,
            deactivationReason: body.decision === 'TERMINATION_APPROVED' ? body.decisionReason : null,
          },
        });

        // Update active employment agreement probation dates
        const activeAgr = await tx.employmentAgreement.findFirst({
          where: { employeeId: prob.employeeId, status: 'ACTIVE' },
        });
        if (activeAgr && body.decision === 'EXTENDED' && body.extendedEndDate) {
          await tx.employmentAgreement.update({
            where: { id: activeAgr.id },
            data: { probationExtendedEndDate: new Date(body.extendedEndDate) },
          });
        }

        await publishLifecycleEvent(tx, {
          employeeId: prob.employeeId,
          eventType,
          effectiveDate: now,
          payload: { decision: body.decision, reason: body.decisionReason },
          sourceType: 'ProbationRecord',
          sourceId: prob.id,
          actorUserId: auth.userId,
        });

        return pr;
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `PROBATION_DECISION_${body.decision}`,
        targetType: 'ProbationRecord',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { decision: body.decision, nextStatus },
      });

      return updated;
    },
  });

  // 15. Lifecycle Jobs Runner (Trigger Background Expiry Scans, Reminders, Escalations)
  registerRoute(router, deps, {
    method: 'post',
    path: '/lifecycle-jobs/run',
    auth: { permission: 'jobs.run' },
    body: z
      .object({
        asOf: zDate.optional(),
      })
      .optional(),
    handler: async ({ body, auth, req, deps }) => {
      const asOf = body?.asOf ? new Date(body.asOf) : new Date();
      const results = await runLifecycleJobs(deps.prisma, asOf);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LIFECYCLE_JOBS_RUN',
        targetType: 'System',
        outcome: 'SUCCESS',
        after: results,
      });

      return results;
    },
  });

  return router;
}
