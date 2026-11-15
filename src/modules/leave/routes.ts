import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict, forbidden, validation } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import { auditCtx, zDate, parseJson } from '../employees/util.js';
import { getActorEmployeeId, getReportingLineIds } from '../employees/access.js';
import { calculateWorkingDays } from './calculator.js';
import {
  postLedgerEntry,
  reverseLedgerEntry,
  reconcileLeaveBalances,
} from './ledger.js';
import {
  submitLeaveRequest,
  reviewLeaveRequest,
  withdrawLeaveRequest,
  cancelApprovedLeave,
  resubmitLeaveRequest,
  resolveWorkSchedule,
} from './service.js';
import { recordAbsence, runMonthlyAccrualJob } from './absence.service.js';
import {
  validateUploadFile,
  storeFile,
  generateSignedDownloadToken,
} from '../../core/storage/storage.js';
import { notifyUser } from '../notifications/service.js';

export function createLeaveRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. List Leave Types
  registerRoute(router, deps, {
    method: 'get',
    path: '/leave/types',
    auth: 'session',
    query: z.object({ includeInactive: z.enum(['true', 'false']).optional() }).optional(),
    handler: async ({ query, auth, deps }) => {
      const canSeeDrafts =
        query?.includeInactive === 'true' &&
        (auth.permissions.has('leave.config') ||
          auth.permissions.has('config.approve') ||
          auth.permissions.has('leave.view_all'));
      return deps.prisma.leaveType.findMany({
        where: canSeeDrafts ? {} : { isActive: true },
        orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      });
    },
  });

  // 2. Draft New Leave Type (Maker-Checker)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/types',
    auth: { permission: 'leave.config' },
    successStatus: 201,
    body: z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/),
      name: z.string().min(2).max(100),
      description: z.string().max(500).optional(),
      category: z.enum(['STATUTORY', 'COMPANY_ENHANCED', 'OPERATIONAL']).default('COMPANY_ENHANCED'),
      isPaid: z.boolean().default(true),
      requiresEvidence: z.boolean().default(false),
      evidenceType: z.string().max(50).optional(),
      minServiceMonthsRequired: z.number().int().min(0).max(60).optional(),
      noticeDaysRequired: z.number().int().min(0).max(90).optional(),
      handoverRequired: z.boolean().default(true),
      maxConsecutiveDays: z.number().int().min(1).max(365).optional(),
      allowHalfDay: z.boolean().default(true),
      negativeBalancePolicy: z.enum(['PROHIBITED', 'ALLOWED_WITH_LIMIT']).default('PROHIBITED'),
      maxNegativeBalanceDays: z.number().min(0).max(30).default(0),
      accrualMethod: z.enum(['MONTHLY_ACCRUAL', 'ANNUAL_FRONTLOAD', 'SERVICE_TIERED', 'NONE']).default('MONTHLY_ACCRUAL'),
      statutoryFloorDays: z.number().min(0).max(365).optional(),
      defaultEntitlementDays: z.number().min(0).max(365).optional(),
      allowCarryForward: z.boolean().default(false),
      maxCarryForwardDays: z.number().min(0).max(60).optional(),
      carryForwardExpiryMonths: z.number().int().min(1).max(24).optional(),
      allowEncashment: z.boolean().default(false),
      decisionReference: z.string().max(100).optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      // Check statutory guardrail: configured entitlement cannot fall below statutory floor!
      if (body.statutoryFloorDays && body.defaultEntitlementDays) {
        if (body.defaultEntitlementDays < body.statutoryFloorDays) {
          throw validation(
            `Statutory floor violation: Configured entitlement (${body.defaultEntitlementDays} days) cannot be lower than the Kenya statutory floor (${body.statutoryFloorDays} days).`,
          );
        }
      }

      const existing = await deps.prisma.leaveType.findUnique({ where: { code: body.code } });
      if (existing) throw conflict(`Leave type with code '${body.code}' already exists`);

      const created = await deps.prisma.leaveType.create({
        data: {
          ...body,
          isActive: false, // Draft until approved
          createdById: auth.userId,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_TYPE_DRAFTED',
        targetType: 'LeaveType',
        targetId: created.id,
        outcome: 'SUCCESS',
        after: created,
      });

      return created;
    },
  });

  // 3. Activate Leave Type (Maker-Checker enforced)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/types/:id/activate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const lt = await deps.prisma.leaveType.findUnique({ where: { id: params.id } });
      if (!lt) throw notFound('LeaveType', params.id);

      if (lt.createdById === auth.userId) {
        throw forbidden('Maker-Checker violation: The author of a leave type cannot activate it.');
      }

      const updated = await deps.prisma.leaveType.update({
        where: { id: params.id },
        data: {
          isActive: true,
          approvedById: auth.userId,
          approvedAt: new Date(),
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_TYPE_ACTIVATED',
        targetType: 'LeaveType',
        targetId: lt.id,
        outcome: 'SUCCESS',
        before: { isActive: lt.isActive },
        after: { isActive: true },
      });

      return updated;
    },
  });

  // 4. Public Holidays List & Setup
  registerRoute(router, deps, {
    method: 'get',
    path: '/leave/holidays',
    auth: 'session',
    query: z.object({ year: z.coerce.number().int().optional() }).optional(),
    handler: async ({ query, deps }) => {
      const where: any = {};
      if (query?.year) where.year = query.year;
      return deps.prisma.publicHoliday.findMany({
        where,
        orderBy: { date: 'asc' },
      });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/holidays',
    auth: { permission: 'leave.manage' },
    successStatus: 201,
    body: z.object({
      name: z.string().min(2).max(100),
      date: zDate,
      isHalfDay: z.boolean().default(false),
      locationId: z.string().uuid().optional(),
      sourceReference: z.string().min(3).max(200),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const holidayDate = new Date(body.date);
      holidayDate.setHours(0, 0, 0, 0);

      const holiday = await deps.prisma.publicHoliday.create({
        data: {
          name: body.name,
          date: holidayDate,
          year: holidayDate.getFullYear(),
          isHalfDay: body.isHalfDay,
          locationId: body.locationId,
          sourceReference: body.sourceReference,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'PUBLIC_HOLIDAY_CREATED',
        targetType: 'PublicHoliday',
        targetId: holiday.id,
        outcome: 'SUCCESS',
        after: holiday,
      });

      return holiday;
    },
  });

  // 5. Work Schedules & Assignment
  registerRoute(router, deps, {
    method: 'get',
    path: '/leave/schedules',
    auth: 'session',
    handler: async ({ deps }) => {
      const schedules = await deps.prisma.workSchedule.findMany({ where: { isActive: true } });
      return schedules.map((s) => ({
        ...s,
        workingDays: parseJson<string[]>(s.workingDays, []),
        restDays: parseJson<string[]>(s.restDays, []),
      }));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/schedules',
    auth: { permission: 'leave.config' },
    successStatus: 201,
    body: z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/),
      name: z.string().min(2).max(100),
      workingDays: z.array(z.string()).min(1),
      restDays: z.array(z.string()).min(1),
      dailyWorkingHours: z.number().min(1).max(24).default(8.0),
      flexitimeWindowStart: z.string().optional(),
      flexitimeWindowEnd: z.string().optional(),
      coreHoursStart: z.string().optional(),
      coreHoursEnd: z.string().optional(),
      breakMinutes: z.number().int().default(60),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const existing = await deps.prisma.workSchedule.findUnique({ where: { code: body.code } });
      if (existing) throw conflict(`Work schedule '${body.code}' already exists`);

      const schedule = await deps.prisma.workSchedule.create({
        data: {
          code: body.code,
          name: body.name,
          workingDays: JSON.stringify(body.workingDays),
          restDays: JSON.stringify(body.restDays),
          dailyWorkingHours: body.dailyWorkingHours,
          flexitimeWindowStart: body.flexitimeWindowStart,
          flexitimeWindowEnd: body.flexitimeWindowEnd,
          coreHoursStart: body.coreHoursStart,
          coreHoursEnd: body.coreHoursEnd,
          breakMinutes: body.breakMinutes,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORK_SCHEDULE_CREATED',
        targetType: 'WorkSchedule',
        targetId: schedule.id,
        outcome: 'SUCCESS',
        after: schedule,
      });

      return schedule;
    },
  });

  // 6. Preview Working Days Calculation (Pre-submission calculation breakdown)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/calculate',
    auth: 'session',
    body: z.object({
      employeeId: z.string().uuid().optional(),
      startDate: zDate,
      endDate: zDate,
      isHalfDay: z.boolean().default(false),
      halfDayType: z.enum(['MORNING', 'AFTERNOON']).nullable().optional(),
    }),
    handler: async ({ body, auth, deps }) => {
      let targetEmpId = body.employeeId;
      let locationId: string | null = null;
      if (!targetEmpId) {
        const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
        if (myEmpId) targetEmpId = myEmpId;
      }

      if (targetEmpId) {
        const employee = await deps.prisma.employee.findUnique({ where: { id: targetEmpId } });
        if (!employee) throw notFound('Employee', targetEmpId);
        locationId = employee.locationId;
      }

      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);

      const schedule = await resolveWorkSchedule(deps.prisma, targetEmpId, startDate);
      const holidays = await deps.prisma.publicHoliday.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          ...(locationId ? { OR: [{ locationId: null }, { locationId }] } : { locationId: null }),
        },
      });

      return calculateWorkingDays(
        startDate,
        endDate,
        schedule,
        holidays.map((h) => ({ date: h.date, name: h.name, isHalfDay: h.isHalfDay })),
        body.isHalfDay,
        body.halfDayType,
      );
    },
  });

  // 7. Get Leave Balances
  registerRoute(router, deps, {
    method: 'get',
    path: '/leave/balances',
    auth: 'session',
    query: z
      .object({
        employeeId: z.string().uuid().optional(),
        leaveYear: z.coerce.number().int().default(new Date().getFullYear()),
      })
      .optional(),
    handler: async ({ query, auth, deps }) => {
      let targetEmpId = query?.employeeId;
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);

      if (!targetEmpId) {
        if (!myEmpId) return [];
        targetEmpId = myEmpId;
      } else {
        // Scoping check: is self, has leave.view_all, or is in reporting line
        const isSelf = myEmpId === targetEmpId;
        const hasAll = auth.permissions.has('leave.view_all');
        let isTeam = false;
        if (!isSelf && !hasAll && myEmpId && auth.permissions.has('leave.view_team')) {
          const team = await getReportingLineIds(deps.prisma, myEmpId);
          isTeam = team.has(targetEmpId);
        }

        if (!isSelf && !hasAll && !isTeam) {
          throw forbidden('Access denied: you cannot inspect another employee leave balance');
        }
      }

      const year = query?.leaveYear ?? new Date().getFullYear();
      return deps.prisma.leaveBalance.findMany({
        where: { employeeId: targetEmpId, leaveYear: year },
        include: {
          leaveType: {
            select: {
              code: true,
              name: true,
              category: true,
              isPaid: true,
              negativeBalancePolicy: true,
              maxNegativeBalanceDays: true,
            },
          },
        },
      });
    },
  });

  // 8. Get Authoritative Leave Ledger Entries
  registerRoute(router, deps, {
    method: 'get',
    path: '/leave/ledger',
    auth: 'session',
    query: z
      .object({
        employeeId: z.string().uuid().optional(),
        leaveTypeId: z.string().uuid().optional(),
        leaveYear: z.coerce.number().int().default(new Date().getFullYear()),
      })
      .optional(),
    handler: async ({ query, auth, deps }) => {
      let targetEmpId = query?.employeeId;
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);

      if (!targetEmpId) {
        if (!myEmpId) return [];
        targetEmpId = myEmpId;
      } else {
        const isSelf = myEmpId === targetEmpId;
        const hasAll = auth.permissions.has('leave.view_all');
        if (!isSelf && !hasAll) {
          throw forbidden('Access denied: insufficient permission to inspect the authoritative leave ledger');
        }
      }

      const where: any = {
        employeeId: targetEmpId,
        leaveYear: query?.leaveYear ?? new Date().getFullYear(),
      };
      if (query?.leaveTypeId) where.leaveTypeId = query.leaveTypeId;

      return deps.prisma.leaveLedgerEntry.findMany({
        where,
        include: { leaveType: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
    },
  });

  // 9a. Upload Supporting Evidence for Leave Request (Sick/Maternity/Paternity/Study)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/evidence',
    auth: { permission: 'leave.request' },
    successStatus: 201,
    body: z.object({
      employeeId: z.string().uuid().optional(),
      fileName: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(120),
      evidenceType: z.string().max(50).optional(),
      fileBase64: z.string().min(1),
      notes: z.string().max(500).optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      let targetEmpId = body.employeeId;
      if (!targetEmpId) {
        if (myEmpId) {
          targetEmpId = myEmpId;
        } else {
          const fallbackEmp = await deps.prisma.employee.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          if (!fallbackEmp) throw validation('No active employee record associated with workspace');
          targetEmpId = fallbackEmp.id;
        }
      } else if (targetEmpId !== myEmpId && !auth.permissions.has('leave.manage')) {
        throw forbidden('Access denied: cannot upload leave evidence for another employee');
      }

      const buffer = Buffer.from(body.fileBase64, 'base64');
      validateUploadFile(body.fileName, body.mimeType, buffer.length);
      const { storageKey, storagePath, checksumSha256 } = storeFile(buffer, body.fileName);

      const isMedical = String(body.evidenceType || '').toUpperCase() === 'MEDICAL';
      const documentType = isMedical ? 'MEDICAL' : 'OTHER';
      const visibility = isMedical ? 'MEDICAL_RESTRICTED' : 'HR_EMPLOYEE_MANAGER';
      const securityClassification = isMedical ? 'RESTRICTED' : 'CONFIDENTIAL';

      const docRecord = await deps.prisma.documentRecord.create({
        data: {
          fileName: body.fileName,
          mimeType: body.mimeType,
          fileSizeBytes: buffer.length,
          storageKey,
          storagePath,
          checksumSha256,
          category: 'COMPLIANCE',
          securityClassification,
          uploadedById: auth.userId,
        },
      });

      const empDoc = await deps.prisma.employeeDocument.create({
        data: {
          employeeId: targetEmpId,
          documentRecordId: docRecord.id,
          documentType,
          visibility,
          uploadedById: auth.userId,
          notes: body.notes || `Leave evidence (${body.evidenceType || 'SUPPORTING'})`,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_EVIDENCE_UPLOADED',
        targetType: 'DocumentRecord',
        targetId: docRecord.id,
        outcome: 'SUCCESS',
        after: {
          employeeId: targetEmpId,
          employeeDocumentId: empDoc.id,
          fileName: docRecord.fileName,
          documentType,
          visibility,
        },
      });

      return {
        documentRecordId: docRecord.id,
        employeeDocumentId: empDoc.id,
        fileName: docRecord.fileName,
        mimeType: docRecord.mimeType,
        fileSizeBytes: docRecord.fileSizeBytes,
        documentType,
        visibility,
      };
    },
  });

  // 9. Submit Leave Request
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/requests',
    auth: { permission: 'leave.request' },
    successStatus: 201,
    body: z.object({
      employeeId: z.string().uuid().optional(),
      leaveTypeCode: z.string(),
      startDate: zDate,
      endDate: zDate,
      isHalfDay: z.boolean().default(false),
      halfDayType: z.enum(['MORNING', 'AFTERNOON']).nullable().optional(),
      handoverEmployeeId: z.string().uuid().nullable().optional(),
      handoverNotes: z.string().max(500).optional(),
      handoverCompleted: z.boolean().default(false),
      reason: z.string().max(500).optional(),
      evidenceDocumentId: z.string().uuid().optional(),
      isRetrospective: z.boolean().default(false),
      retrospectiveReason: z.string().max(500).optional(),
      replaceOverlapping: z.boolean().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      let targetEmpId = body.employeeId;
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);

      if (!targetEmpId) {
        if (myEmpId) {
          targetEmpId = myEmpId;
        } else {
          const fallbackEmp = await deps.prisma.employee.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          if (!fallbackEmp) throw validation('No active employee record associated with workspace');
          targetEmpId = fallbackEmp.id;
        }
      } else {
        // HR can submit on behalf of an employee
        if (targetEmpId !== myEmpId && !auth.permissions.has('leave.manage')) {
          throw forbidden('Access denied: you cannot submit leave requests for another employee');
        }
      }

      const result = await submitLeaveRequest(deps.prisma, auth, targetEmpId, body);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_REQUEST_SUBMITTED',
        targetType: 'LeaveRequest',
        targetId: result.request.id,
        outcome: 'SUCCESS',
        after: {
          requestNumber: result.request.requestNumber,
          netWorkingDays: result.calculation.netWorkingDays,
          startDate: body.startDate,
          endDate: body.endDate,
        },
      });

      return result;
    },
  });

  // 10. List Leave Requests (with Team Calendar privacy masking)
  registerRoute(router, deps, {
    method: 'get',
    path: '/leave/requests',
    auth: 'session',
    query: z
      .object({
        employeeId: z.string().uuid().optional(),
        status: z.string().optional(),
        teamOnly: z.enum(['true', 'false']).optional(),
      })
      .optional(),
    handler: async ({ query, auth, deps }) => {
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      const isHR = auth.permissions.has('leave.view_all');
      const isManager = auth.permissions.has('leave.view_team');

      const where: any = {};
      if (query?.status) where.status = query.status;

      if (query?.employeeId) {
        // Specific employee requested
        if (query.employeeId !== myEmpId && !isHR) {
          if (!isManager || !myEmpId) throw forbidden('Access denied: cannot view this employee requests');
          const reports = await getReportingLineIds(deps.prisma, myEmpId);
          if (!reports.has(query.employeeId)) throw forbidden('Access denied: employee not in reporting line');
        }
        where.employeeId = query.employeeId;
      } else if (query?.teamOnly === 'true' && isManager && myEmpId) {
        // Team calendar (direct/indirect reports)
        const reports = await getReportingLineIds(deps.prisma, myEmpId);
        where.employeeId = { in: Array.from(reports) };
      } else if (!isHR && isManager && myEmpId) {
        // Manager workspace: own requests + reporting line requests
        const reports = await getReportingLineIds(deps.prisma, myEmpId);
        where.employeeId = { in: [myEmpId, ...Array.from(reports)] };
      } else if (!isHR) {
        // Standard employee view: only own requests
        if (!myEmpId) return [];
        where.employeeId = myEmpId;
      }

      const requests = await deps.prisma.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: { id: true, userId: true, firstName: true, lastName: true, employeeNumber: true, workEmail: true },
          },
          leaveType: {
            select: { code: true, name: true, category: true, isPaid: true, requiresEvidence: true, evidenceType: true },
          },
          handoverEmployee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { startDate: 'desc' },
      });

      const evidenceIds = Array.from(
        new Set(requests.map((r) => r.evidenceDocumentId).filter((id): id is string => Boolean(id))),
      );
      const evidenceDocs =
        evidenceIds.length > 0
          ? await deps.prisma.documentRecord.findMany({
              where: { id: { in: evidenceIds } },
              select: { id: true, fileName: true, mimeType: true, fileSizeBytes: true },
            })
          : [];
      const docMap = new Map(evidenceDocs.map((d) => [d.id, d]));

      // Privacy Filter: hide confidential reasons & medical filenames where restricted
      return requests.map((r) => {
        const isSelf = r.employeeId === myEmpId;
        const canSeeDoc =
          Boolean(r.evidenceDocumentId) &&
          (isSelf ||
            isHR ||
            (r.leaveType?.evidenceType !== 'MEDICAL' && isManager));
        const evDoc = canSeeDoc && r.evidenceDocumentId ? docMap.get(r.evidenceDocumentId) : null;
        return {
          ...r,
          reason: isSelf || isHR ? r.reason : undefined,
          evidenceFileName: evDoc?.fileName ?? null,
        };
      });
    },
  });

  // 11. Review Leave Request (Approve / Reject / Return)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/requests/:id/review',
    auth: { permission: 'leave.approve' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      decision: z.enum(['APPROVE', 'REJECT', 'RETURN']),
      comments: z.string().min(3).max(500),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const result = await reviewLeaveRequest(deps.prisma, auth, {
        requestId: params.id,
        decision: body.decision,
        comments: body.comments,
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `LEAVE_REQUEST_${body.decision}D`,
        targetType: 'LeaveRequest',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { decision: body.decision, comments: body.comments },
      });

      return result;
    },
  });

  // 12. Withdraw Leave Request (Applicant)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/requests/:id/withdraw',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const result = await withdrawLeaveRequest(deps.prisma, auth, params.id);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_REQUEST_WITHDRAWN',
        targetType: 'LeaveRequest',
        targetId: params.id,
        outcome: 'SUCCESS',
      });

      return result;
    },
  });

  // 13. Cancel Approved Leave Request (Requires Reversal Posting)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/requests/:id/cancel',
    auth: { permission: 'leave.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      reason: z.string().min(5).max(500),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const result = await cancelApprovedLeave(deps.prisma, auth, params.id, body.reason);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_REQUEST_CANCELLED',
        targetType: 'LeaveRequest',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { reason: body.reason, reversalEntryId: result.reversalEntry.id },
      });

      return result;
    },
  });

  // 13b. Resubmit Returned Leave Request (Applicant or HR)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/requests/:id/resubmit',
    auth: { permission: 'leave.request' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      startDate: zDate.optional(),
      endDate: zDate.optional(),
      isHalfDay: z.boolean().optional(),
      halfDayType: z.enum(['MORNING', 'AFTERNOON']).nullable().optional(),
      handoverEmployeeId: z.string().uuid().nullable().optional(),
      handoverNotes: z.string().max(500).optional(),
      reason: z.string().max(500).optional(),
      evidenceDocumentId: z.string().uuid().nullable().optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const result = await resubmitLeaveRequest(deps.prisma, auth, {
        requestId: params.id,
        ...body,
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_REQUEST_RESUBMITTED',
        targetType: 'LeaveRequest',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: { netWorkingDays: result.calculation.netWorkingDays },
      });

      return result;
    },
  });

  // 13c. Signed Download Token for Leave Request Evidence
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/requests/:id/evidence-token',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const leaveReq = await deps.prisma.leaveRequest.findUnique({
        where: { id: params.id },
        include: { employee: true, leaveType: true },
      });
      if (!leaveReq || !leaveReq.evidenceDocumentId) {
        throw notFound('LeaveRequestEvidence', params.id);
      }

      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      const isSelf = leaveReq.employee.userId === auth.userId || leaveReq.employeeId === myEmpId;
      const hasAll = auth.permissions.has('leave.view_all');
      const hasMedical = auth.permissions.has('employees.view_medical');
      let isManager = false;
      if (myEmpId && auth.permissions.has('leave.view_team')) {
        const team = await getReportingLineIds(deps.prisma, myEmpId);
        isManager = team.has(leaveReq.employeeId);
      }

      const isMedicalEvidence = leaveReq.leaveType.evidenceType === 'MEDICAL';
      const allowed = isMedicalEvidence
        ? isSelf || hasMedical || hasAll
        : isSelf || hasAll || isManager;

      if (!allowed) {
        throw forbidden('Access denied: insufficient permission to download this leave evidence');
      }

      const doc = await deps.prisma.documentRecord.findUnique({
        where: { id: leaveReq.evidenceDocumentId },
      });
      if (!doc || doc.isArchived) throw notFound('DocumentRecord', leaveReq.evidenceDocumentId);

      const downloadToken = generateSignedDownloadToken(doc.id, 300);
      return {
        documentId: doc.id,
        fileName: doc.fileName,
        downloadToken,
        expiresInSeconds: 300,
        downloadUrl: `/api/v1/documents/download?token=${downloadToken}`,
      };
    },
  });

  // 14. Manual Ledger Adjustment (Correction / Reversal)
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/adjustments',
    auth: { permission: 'leave.manage' },
    body: z.object({
      employeeId: z.string().uuid(),
      leaveTypeId: z.string().uuid(),
      leaveYear: z.number().int().default(new Date().getFullYear()),
      amountDays: z.number().refine((val) => val !== 0, 'Adjustment amount cannot be zero'),
      reason: z.string().min(5).max(500),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const result = await deps.prisma.$transaction(async (tx) => {
        return postLedgerEntry(tx, {
          employeeId: body.employeeId,
          leaveTypeId: body.leaveTypeId,
          leaveYear: body.leaveYear,
          entryType: 'ADJUSTMENT',
          amountDays: body.amountDays,
          sourceType: 'MANUAL_ADJUSTMENT',
          notes: body.reason,
          actorUserId: auth.userId,
        });
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_LEDGER_ADJUSTMENT_POSTED',
        targetType: 'LeaveLedgerEntry',
        targetId: result.entry.id,
        outcome: 'SUCCESS',
        after: { amountDays: body.amountDays, reason: body.reason },
      });

      return result;
    },
  });

  // 15. Ledger Balance Reconciliation Report
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/reconcile',
    auth: { permission: 'leave.manage' },
    body: z.object({
      employeeId: z.string().uuid(),
      leaveYear: z.number().int().default(new Date().getFullYear()),
      leaveTypeId: z.string().uuid().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const results = await reconcileLeaveBalances(
        deps.prisma,
        body.employeeId,
        body.leaveYear,
        body.leaveTypeId,
      );

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'LEAVE_BALANCES_RECONCILED',
        targetType: 'LeaveBalance',
        outcome: 'SUCCESS',
        after: { reconciliationsCount: results.length, allReconciled: results.every((r) => r.isReconciled) },
      });

      return results;
    },
  });

  // 16. Monthly Accrual Job Trigger
  registerRoute(router, deps, {
    method: 'post',
    path: '/leave/accrual-job',
    auth: { permission: ['jobs.run', 'leave.manage'], any: true },
    body: z.object({ asOf: zDate.optional() }).optional(),
    handler: async ({ body, auth, req, deps }) => {
      const asOf = body?.asOf ? new Date(body.asOf) : new Date();
      const result = await runMonthlyAccrualJob(deps.prisma, asOf);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'MONTHLY_LEAVE_ACCRUAL_JOB_RUN',
        targetType: 'LeaveLedgerEntry',
        outcome: 'SUCCESS',
        after: result,
      });

      return result;
    },
  });

  // 17. Record Unexpected Absence (D-11)
  registerRoute(router, deps, {
    method: 'post',
    path: '/absences',
    auth: { permission: 'absence.record' },
    successStatus: 201,
    body: z.object({
      employeeId: z.string().uuid(),
      startDate: zDate,
      endDate: zDate.optional(),
      reasonCategory: z.enum(['SICKNESS', 'FAMILY_EMERGENCY', 'UNNOTIFIED', 'MEDICAL_APPOINTMENT', 'OTHER']),
      contactChannel: z.enum(['PHONE', 'EMAIL', 'SMS', 'WHATSAPP', 'RELATIVE']),
      notes: z.string().max(500).optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const absence = await recordAbsence(deps.prisma, auth, body);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'UNEXPECTED_ABSENCE_RECORDED',
        targetType: 'AbsenceRecord',
        targetId: absence.id,
        outcome: 'SUCCESS',
        after: { employeeId: body.employeeId, category: body.reasonCategory },
      });

      return absence;
    },
  });

  // 18. List Absences
  registerRoute(router, deps, {
    method: 'get',
    path: '/absences',
    auth: 'session',
    query: z.object({ employeeId: z.string().uuid().optional() }).optional(),
    handler: async ({ query, auth, deps }) => {
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      const isHR = auth.permissions.has('absence.manage');
      const isManager = auth.permissions.has('leave.view_team');

      const where: any = {};
      if (query?.employeeId) {
        if (query.employeeId !== myEmpId && !isHR) {
          if (!isManager || !myEmpId) {
            throw forbidden('Access denied: cannot view another employee absence records');
          }
          const team = await getReportingLineIds(deps.prisma, myEmpId);
          if (!team.has(query.employeeId)) {
            throw forbidden('Access denied: cannot view another employee absence records');
          }
        }
        where.employeeId = query.employeeId;
      } else if (!isHR && isManager && myEmpId) {
        const team = await getReportingLineIds(deps.prisma, myEmpId);
        where.employeeId = { in: [myEmpId, ...Array.from(team)] };
      } else if (!isHR) {
        if (!myEmpId) return [];
        where.employeeId = myEmpId;
      }

      return deps.prisma.absenceRecord.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
        },
        orderBy: { startDate: 'desc' },
      });
    },
  });

  // 19. Review / Excuse / Flag Unexpected Absence
  registerRoute(router, deps, {
    method: 'post',
    path: '/absences/:id/review',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      status: z.enum(['EXCUSED', 'INVESTIGATION_REQUIRED', 'RETROSPECTIVE_LEAVE_REQUESTED']),
      notes: z.string().max(500).optional(),
      linkedLeaveRequestId: z.string().uuid().optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const absence = await deps.prisma.absenceRecord.findUnique({
        where: { id: params.id },
        include: { employee: { select: { id: true, userId: true, firstName: true, lastName: true } } },
      });
      if (!absence) throw notFound('AbsenceRecord', params.id);

      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      const isHR = auth.permissions.has('absence.manage');
      let isManager = false;
      if (!isHR && myEmpId && auth.permissions.has('leave.view_team')) {
        const team = await getReportingLineIds(deps.prisma, myEmpId);
        isManager = team.has(absence.employeeId);
      }
      if (!isHR && !isManager) {
        throw forbidden('Access denied: only HR or the reporting line manager can review absence records');
      }

      const updated = await deps.prisma.absenceRecord.update({
        where: { id: params.id },
        data: {
          status: body.status,
          ...(body.notes ? { notes: body.notes } : {}),
          ...(body.linkedLeaveRequestId ? { linkedLeaveRequestId: body.linkedLeaveRequestId } : {}),
        },
      });

      if (absence.employee.userId) {
        await notifyUser(deps.prisma, absence.employee.userId, {
          title: 'Absence Record Reviewed',
          message: `Your absence from ${absence.startDate.toISOString().slice(0, 10)} was updated to ${body.status}.`,
          deepLink: `/absences/${absence.id}`,
          idempotencyKey: `absence-review:${absence.id}:${body.status}`,
        });
      }

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ABSENCE_REVIEWED',
        targetType: 'AbsenceRecord',
        targetId: absence.id,
        outcome: 'SUCCESS',
        before: { status: absence.status },
        after: { status: body.status, notes: body.notes, linkedLeaveRequestId: body.linkedLeaveRequestId },
      });

      return updated;
    },
  });

  return router;
}
