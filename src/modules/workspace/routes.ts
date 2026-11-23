import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { writeAudit } from '../../core/audit/audit.js';
import { forbidden, notFound, validation } from '../../core/errors/errors.js';
import { auditCtx } from '../employees/util.js';
import { getActorEmployeeId } from '../employees/access.js';

export function createWorkspaceRouter(deps: AppDeps): Router {
  const router = Router();

  // Helper to get actor employeeId or fallback to userId for non-employee admin accounts
  async function resolveActorEmpId(userId: string): Promise<string> {
    const empId = await getActorEmployeeId(deps.prisma, userId);
    return empId || userId;
  }

  function isHrOrAdmin(roles: string[], permissions: Set<string>): boolean {
    const rset = new Set(roles.map((r) => r.toLowerCase()));
    return (
      rset.has('system_admin') ||
      rset.has('managing_partner') ||
      rset.has('operations_director') ||
      rset.has('head_of_hr') ||
      rset.has('hr_lead') ||
      rset.has('hr_manager') ||
      rset.has('hr_officer') ||
      permissions.has('employees.view') ||
      permissions.has('config.manage') ||
      permissions.has('org.manage')
    );
  }

  // =========================================================================
  // 1. LIVE CHECK-IN / CHECK-OUT TIMER (AttendancePunch)
  // =========================================================================
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/attendance',
    auth: 'session',
    handler: async ({ auth }) => {
      const employeeId = await resolveActorEmpId(auth.userId);
      const today = new Date().toISOString().slice(0, 10);
      const punches = await deps.prisma.attendancePunch.findMany({
        where: { employeeId },
        orderBy: { clockInAt: 'desc' },
        take: 20,
      });

      const activePunch = punches.find((p) => !p.clockOutAt) || null;
      const todayCompletedSecs = punches
        .filter((p) => p.workDate === today && p.clockOutAt)
        .reduce((acc, p) => acc + (p.totalSecs || 0), 0);

      const liveSecs = activePunch
        ? Math.max(0, Math.floor((Date.now() - activePunch.clockInAt.getTime()) / 1000))
        : 0;

      return {
        checkedIn: Boolean(activePunch),
        activePunch,
        elapsedSeconds: todayCompletedSecs + liveSecs,
        punches,
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/attendance/clock-in',
    auth: 'session',
    body: z
      .object({
        notes: z.string().max(300).optional(),
        source: z.string().max(30).optional(),
      })
      .optional(),
    handler: async ({ auth, body, req }) => {
      const employeeId = await resolveActorEmpId(auth.userId);
      const existingOpen = await deps.prisma.attendancePunch.findFirst({
        where: { employeeId, clockOutAt: null },
        orderBy: { clockInAt: 'desc' },
      });

      if (existingOpen) {
        return {
          alreadyCheckedIn: true,
          punch: existingOpen,
        };
      }

      const workDate = new Date().toISOString().slice(0, 10);
      const punch = await deps.prisma.attendancePunch.create({
        data: {
          employeeId,
          workDate,
          notes: body?.notes || null,
          source: body?.source || 'WEB',
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ATTENDANCE_CLOCK_IN',
        targetType: 'AttendancePunch',
        targetId: punch.id,
        outcome: 'SUCCESS',
        after: { employeeId, workDate },
      });

      return { alreadyCheckedIn: false, punch };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/attendance/clock-out',
    auth: 'session',
    body: z
      .object({
        notes: z.string().max(300).optional(),
      })
      .optional(),
    handler: async ({ auth, body, req }) => {
      const employeeId = await resolveActorEmpId(auth.userId);
      const active = await deps.prisma.attendancePunch.findFirst({
        where: { employeeId, clockOutAt: null },
        orderBy: { clockInAt: 'desc' },
      });

      if (!active) {
        throw validation('No active check-in session found to check out.');
      }

      const now = new Date();
      const totalSecs = Math.max(1, Math.floor((now.getTime() - active.clockInAt.getTime()) / 1000));
      const updated = await deps.prisma.attendancePunch.update({
        where: { id: active.id },
        data: {
          clockOutAt: now,
          totalSecs,
          notes: body?.notes ? `${active.notes ? `${active.notes} | ` : ''}${body.notes}` : active.notes,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ATTENDANCE_CLOCK_OUT',
        targetType: 'AttendancePunch',
        targetId: updated.id,
        outcome: 'SUCCESS',
        after: { totalSecs },
      });

      return { punch: updated };
    },
  });

  // =========================================================================
  // 1B. ATTENDANCE SUMMARY (9 STATUTORY COLUMNS & MONTHLY AGGREGATIONS)
  // =========================================================================
  function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }

  function formatSecsToHHMM(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${pad2(h)}:${pad2(m)}`;
  }

  function formatTimeAMPM(date: Date): string {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${pad2(hours)}:${pad2(minutes)} ${ampm}`;
  }

  registerRoute(router, deps, {
    method: 'get',
    path: '/attendance/summary',
    auth: 'session',
    query: z
      .object({
        employeeId: z.string().uuid().optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        displayUnit: z.enum(['HOURS', 'DAYS']).default('HOURS'),
      })
      .optional(),
    handler: async ({ auth, query }) => {
      let targetEmpId = query?.employeeId;
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      if (!targetEmpId) {
        targetEmpId = myEmpId || auth.userId;
      } else if (targetEmpId !== myEmpId && !isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Access denied: cannot view another employee attendance summary.');
      }

      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
      const selectedMonth = query?.month || currentMonthStr;
      const [yearNum, monthNum] = selectedMonth.split('-').map(Number);

      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      const monthStartStr = `${selectedMonth}-01`;
      const monthEndStr = `${selectedMonth}-${pad2(daysInMonth)}`;

      const punches = await deps.prisma.attendancePunch.findMany({
        where: {
          employeeId: targetEmpId,
          workDate: { gte: monthStartStr, lte: monthEndStr },
        },
        orderBy: { clockInAt: 'asc' },
      });

      const monthStartDate = new Date(`${monthStartStr}T00:00:00.000Z`);
      const monthEndDate = new Date(`${monthEndStr}T23:59:59.999Z`);
      const leaves = await deps.prisma.leaveRequest.findMany({
        where: {
          employeeId: targetEmpId,
          status: 'APPROVED',
          startDate: { lte: monthEndDate },
          endDate: { gte: monthStartDate },
        },
        include: { leaveType: true },
      });

      const holidays = await deps.prisma.publicHoliday.findMany({
        where: {
          date: { gte: monthStartDate, lte: monthEndDate },
        },
      });

      const schedule = await deps.prisma.workSchedule.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      let restDays: string[] = ['Saturday', 'Sunday'];
      if (schedule && schedule.restDays) {
        try {
          restDays = JSON.parse(schedule.restDays);
        } catch {
          restDays = ['Saturday', 'Sunday'];
        }
      }
      const standardDailyHours = schedule?.dailyWorkingHours || 8.0;
      const standardDailySecs = standardDailyHours * 3600;

      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const daysData: any[] = [];
      let presentDays = 0;
      let absentDays = 0;
      let leaveDays = 0;
      let holidayDays = 0;
      let weekendDays = 0;
      let totalWorkedSecs = 0;
      let totalPayableSecs = 0;
      let totalOvertimeSecs = 0;

      const todayStr = now.toISOString().slice(0, 10);

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${selectedMonth}-${pad2(day)}`;
        const dayDate = new Date(yearNum, monthNum - 1, day);
        const dayOfWeek = dayDate.getDay();
        const dayName = DAY_NAMES[dayOfWeek];
        const formattedDate = `${pad2(day)}-${MONTH_NAMES[monthNum - 1]}-${yearNum} ${dayName.slice(0, 3)}`;

        const isWeekend = restDays.includes(dayName);
        const holiday = holidays.find((h) => h.date.toISOString().slice(0, 10) === dateStr);
        const leave = leaves.find((l) => {
          const lStart = l.startDate.toISOString().slice(0, 10);
          const lEnd = l.endDate.toISOString().slice(0, 10);
          return dateStr >= lStart && dateStr <= lEnd;
        });

        const dayPunches = punches.filter((p) => p.workDate === dateStr);

        let status = 'SCHEDULED';
        let firstIn = '—';
        let lastOut = '—';
        let dayWorkedSecs = 0;
        let dayPayableSecs = 0;
        let deviationSecs = 0;
        let regularization = 'NONE';

        if (dayPunches.length > 0) {
          status = 'PRESENT';
          presentDays++;
          firstIn = formatTimeAMPM(dayPunches[0].clockInAt);
          const lastPunch = dayPunches[dayPunches.length - 1];
          if (lastPunch.clockOutAt) {
            lastOut = formatTimeAMPM(lastPunch.clockOutAt);
          } else if (dateStr === todayStr) {
            lastOut = 'Running';
          }

          for (const p of dayPunches) {
            if (p.clockOutAt) {
              dayWorkedSecs += p.totalSecs || 0;
            } else if (dateStr === todayStr) {
              dayWorkedSecs += Math.max(0, Math.floor((Date.now() - p.clockInAt.getTime()) / 1000));
            }
            if (p.notes && p.notes.includes('Regularized')) {
              regularization = 'REGULARIZED';
            }
          }

          dayPayableSecs = Math.min(dayWorkedSecs, standardDailySecs);
          if (dayWorkedSecs >= standardDailySecs) {
            dayPayableSecs = standardDailySecs;
          }
          deviationSecs = dayWorkedSecs - standardDailySecs;
          if (deviationSecs > 0) {
            totalOvertimeSecs += deviationSecs;
          }
          totalWorkedSecs += dayWorkedSecs;
          totalPayableSecs += dayPayableSecs;
        } else if (holiday) {
          status = 'HOLIDAY';
          holidayDays++;
          dayPayableSecs = standardDailySecs;
          totalPayableSecs += dayPayableSecs;
        } else if (leave) {
          status = 'ON_LEAVE';
          leaveDays++;
          dayPayableSecs = standardDailySecs;
          totalPayableSecs += dayPayableSecs;
        } else if (isWeekend) {
          status = 'WEEKEND';
          weekendDays++;
        } else if (dateStr < todayStr) {
          status = 'ABSENT';
          absentDays++;
          deviationSecs = -standardDailySecs;
        } else {
          status = 'SCHEDULED';
        }

        const deviationStr =
          deviationSecs === 0
            ? '00:00'
            : (deviationSecs > 0 ? '+' : '-') + formatSecsToHHMM(Math.abs(deviationSecs));

        daysData.push({
          date: dateStr,
          formattedDate,
          dayName,
          firstIn,
          lastOut,
          firstInAt: dayPunches.length > 0 ? dayPunches[0].clockInAt.toISOString() : null,
          lastOutAt: dayPunches.length > 0 && dayPunches[dayPunches.length - 1].clockOutAt ? dayPunches[dayPunches.length - 1].clockOutAt!.toISOString() : null,
          totalHours: formatSecsToHHMM(dayWorkedSecs),
          payableHours: formatSecsToHHMM(dayPayableSecs),
          deviation: deviationStr,
          rawWorkedSecs: dayWorkedSecs,
          rawPayableSecs: dayPayableSecs,
          rawDeviationSecs: deviationSecs,
          status,
          shift: `${schedule?.name || 'General Advisory Shift'} (${schedule?.coreHoursStart || '08:30'} - ${schedule?.coreHoursEnd || '17:30'})`,
          regularization,
        });
      }

      return {
        month: selectedMonth,
        employeeId: targetEmpId,
        days: daysData,
        summary: {
          totalDays: daysInMonth,
          presentDays,
          absentDays,
          leaveDays,
          holidayDays,
          weekendDays,
          totalPayableHours: (totalPayableSecs / 3600).toFixed(1),
          totalWorkedHours: (totalWorkedSecs / 3600).toFixed(1),
          overtimeHours: (totalOvertimeSecs / 3600).toFixed(1),
        },
      };
    },
  });

  // Regularize Attendance Punch
  registerRoute(router, deps, {
    method: 'post',
    path: '/attendance/regularize',
    auth: 'session',
    body: z.object({
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(['MISSING_IN', 'MISSING_OUT', 'FULL_DAY']),
      clockInTime: z.string().optional(),
      clockOutTime: z.string().optional(),
      reason: z.string().min(2).max(100),
      notes: z.string().max(500).optional(),
      employeeId: z.string().uuid().optional(),
    }),
    handler: async ({ body, auth, req }) => {
      let targetEmpId = body.employeeId;
      const myEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      if (!targetEmpId) {
        targetEmpId = myEmpId || auth.userId;
      } else if (targetEmpId !== myEmpId && !isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Access denied: cannot submit regularization for another employee.');
      }

      let punch = await deps.prisma.attendancePunch.findFirst({
        where: { employeeId: targetEmpId, workDate: body.workDate },
        orderBy: { clockInAt: 'asc' },
      });

      const inTimeStr = body.clockInTime || '08:30';
      const outTimeStr = body.clockOutTime || '17:30';
      const parsedIn = new Date(`${body.workDate}T${inTimeStr}:00.000Z`);
      const parsedOut = new Date(`${body.workDate}T${outTimeStr}:00.000Z`);
      const diffSecs = Math.max(0, Math.floor((parsedOut.getTime() - parsedIn.getTime()) / 1000));

      if (punch) {
        punch = await deps.prisma.attendancePunch.update({
          where: { id: punch.id },
          data: {
            clockInAt: body.type === 'MISSING_OUT' ? punch.clockInAt : parsedIn,
            clockOutAt: body.type === 'MISSING_IN' ? punch.clockOutAt : parsedOut,
            totalSecs: diffSecs > 0 ? diffSecs : (punch.totalSecs || 28800),
            notes: `[Regularized: ${body.reason}] ${body.notes || ''}`.trim(),
          },
        });
      } else {
        punch = await deps.prisma.attendancePunch.create({
          data: {
            employeeId: targetEmpId,
            workDate: body.workDate,
            clockInAt: parsedIn,
            clockOutAt: parsedOut,
            totalSecs: diffSecs > 0 ? diffSecs : 28800,
            notes: `[Regularized: ${body.reason}] ${body.notes || ''}`.trim(),
            source: 'REGULARIZATION',
          },
        });
      }

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ATTENDANCE_REGULARIZED',
        targetType: 'AttendancePunch',
        targetId: punch.id,
        outcome: 'SUCCESS',
        after: { workDate: body.workDate, type: body.type, reason: body.reason },
      });

      return { success: true, punch };
    },
  });

  // Team Attendance Kanban Board
  registerRoute(router, deps, {
    method: 'get',
    path: '/attendance/team-kanban',
    auth: 'session',
    handler: async () => {
      const today = new Date().toISOString().slice(0, 10);

      const employees = await deps.prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
          user: { select: { email: true } },
        },
        orderBy: { firstName: 'asc' },
      });

      const todayPunches = await deps.prisma.attendancePunch.findMany({
        where: { workDate: today },
        orderBy: { clockInAt: 'desc' },
      });

      const todayStart = new Date(`${today}T00:00:00.000Z`);
      const todayEnd = new Date(`${today}T23:59:59.999Z`);
      const todayLeaves = await deps.prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: todayEnd },
          endDate: { gte: todayStart },
        },
        include: { leaveType: true },
      });

      const checkedIn: any[] = [];
      const onLeave: any[] = [];
      const notYetIn: any[] = [];

      for (const emp of employees) {
        const punch = todayPunches.find((p) => p.employeeId === emp.id);
        const leave = todayLeaves.find((l) => l.employeeId === emp.id);

        const empCard = {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName}`.trim(),
          employeeNumber: emp.employeeNumber,
          email: emp.user?.email || '',
          department: emp.department?.name || 'General Advisory',
          position: emp.position?.title || 'Team Member',
          avatarUrl: (emp as any).avatarUrl || null,
        };

        if (punch) {
          checkedIn.push({
            ...empCard,
            clockInAt: punch.clockInAt,
            clockOutAt: punch.clockOutAt,
            firstIn: formatTimeAMPM(punch.clockInAt),
            lastOut: punch.clockOutAt ? formatTimeAMPM(punch.clockOutAt) : 'Active',
            totalSecs: punch.totalSecs || 0,
            status: punch.clockOutAt ? 'Completed' : 'Active Clock-in',
          });
        } else if (leave) {
          onLeave.push({
            ...empCard,
            leaveType: leave.leaveType.name,
            reason: leave.reason,
            status: 'On Leave',
          });
        } else {
          notYetIn.push({
            ...empCard,
            status: 'Not Yet Checked In',
          });
        }
      }

      return {
        today,
        summary: {
          totalCount: employees.length,
          checkedInCount: checkedIn.length,
          notYetInCount: notYetIn.length,
          onLeaveCount: onLeave.length,
        },
        checkedIn,
        notYetIn,
        onLeave,
      };
    },
  });

  // =========================================================================
  // 2. WORKSPACE FEEDS & ANNOUNCEMENTS (WorkspaceFeed)
  // =========================================================================
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/feeds',
    auth: 'session',
    query: z
      .object({
        category: z.string().optional(),
        search: z.string().optional(),
      })
      .optional(),
    handler: async ({ query }) => {
      const where: any = {};
      if (query?.category && query.category !== 'ALL') {
        where.category = query.category;
      }
      if (query?.search) {
        where.OR = [
          { message: { contains: query.search } },
          { authorName: { contains: query.search } },
        ];
      }

      const items = await deps.prisma.workspaceFeed.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return { items };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/feeds',
    auth: 'session',
    body: z.object({
      category: z.enum(['ANNOUNCEMENT', 'STATUS', 'KUDOS']).default('STATUS'),
      message: z.string().min(2).max(2000),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      const feed = await deps.prisma.workspaceFeed.create({
        data: {
          authorId: auth.userId,
          authorName: auth.name || auth.email,
          category: body.category,
          message: body.message.trim(),
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_FEED_POSTED',
        targetType: 'WorkspaceFeed',
        targetId: feed.id,
        outcome: 'SUCCESS',
        after: { category: feed.category },
      });

      return feed;
    },
  });

  // =========================================================================
  // 3. APPROVAL DELEGATIONS (ApprovalDelegation)
  // =========================================================================
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/delegations',
    auth: 'session',
    handler: async ({ auth }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const adminView = isHrOrAdmin(auth.roles, auth.permissions);

      const items = await deps.prisma.approvalDelegation.findMany({
        where: adminView
          ? {}
          : {
              OR: [{ delegatorId: auth.userId }, { delegatorId: actorEmpId }],
            },
        orderBy: { createdAt: 'desc' },
      });

      return { items };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/delegations',
    auth: 'session',
    body: z.object({
      delegateName: z.string().min(2).max(120),
      delegateId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      delegationType: z.enum(['TEMPORARY', 'PERMANENT']).default('TEMPORARY'),
      notifyDelegator: z.boolean().default(true),
      reason: z.string().max(400).optional(),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      if (body.endDate < body.startDate) {
        throw validation('End date cannot be earlier than start date.');
      }

      const delegation = await deps.prisma.approvalDelegation.create({
        data: {
          delegatorId: auth.userId,
          delegateName: body.delegateName,
          delegateId: body.delegateId || null,
          startDate: body.startDate,
          endDate: body.endDate,
          delegationType: body.delegationType,
          notifyDelegator: body.notifyDelegator,
          reason: body.reason || null,
          isActive: true,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'APPROVAL_DELEGATION_CREATED',
        targetType: 'ApprovalDelegation',
        targetId: delegation.id,
        outcome: 'SUCCESS',
        after: { delegateName: body.delegateName, startDate: body.startDate, endDate: body.endDate },
      });

      return delegation;
    },
  });

  registerRoute(router, deps, {
    method: 'delete',
    path: '/workspace/delegations/:id',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ auth, params, req }) => {
      const existing = await deps.prisma.approvalDelegation.findUnique({ where: { id: params.id } });
      if (!existing) throw notFound('ApprovalDelegation', params.id);

      const adminView = isHrOrAdmin(auth.roles, auth.permissions);
      if (existing.delegatorId !== auth.userId && !adminView) {
        throw forbidden('Only the delegator or HR Admin can revoke this delegation.');
      }

      const updated = await deps.prisma.approvalDelegation.update({
        where: { id: params.id },
        data: { isActive: false },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'APPROVAL_DELEGATION_REVOKED',
        targetType: 'ApprovalDelegation',
        targetId: params.id,
        outcome: 'SUCCESS',
      });

      return updated;
    },
  });

  // =========================================================================
  // 4. WORKSPACE CUSTOM COLUMN VIEWS (CustomDataView - Directory, AddressProof, etc.)
  // =========================================================================
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/custom-views',
    auth: 'session',
    query: z
      .object({
        module: z.string().optional(),
      })
      .optional(),
    handler: async ({ auth, query }) => {
      const where: any = {
        OR: [{ createdById: auth.userId }, { viewPermission: { in: ['EVERYONE', 'ROLE'] } }],
      };
      if (query?.module) where.module = query.module;

      const views = await deps.prisma.customDataView.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return {
        items: views.map((v) => ({
          ...v,
          columns: JSON.parse(v.columnsJson || '[]'),
        })),
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/custom-views',
    auth: 'session',
    body: z.object({
      module: z.enum(['DIRECTORY', 'ADDRESS_PROOF', 'TIMETRACKER']),
      name: z.string().min(2).max(100),
      columns: z.array(z.string()).min(1),
      viewPermission: z.enum(['ONLY_ME', 'EVERYONE', 'ROLE']).default('ONLY_ME'),
      isDefault: z.boolean().default(false),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      if (body.isDefault) {
        await deps.prisma.customDataView.updateMany({
          where: { module: body.module, createdById: auth.userId },
          data: { isDefault: false },
        });
      }

      const view = await deps.prisma.customDataView.create({
        data: {
          module: body.module,
          name: body.name.trim(),
          columnsJson: JSON.stringify(body.columns),
          viewPermission: body.viewPermission,
          isDefault: body.isDefault,
          createdById: auth.userId,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'CUSTOM_VIEW_CREATED',
        targetType: 'CustomDataView',
        targetId: view.id,
        outcome: 'SUCCESS',
        after: { module: body.module, name: view.name },
      });

      return { ...view, columns: body.columns };
    },
  });

  registerRoute(router, deps, {
    method: 'delete',
    path: '/workspace/custom-views/:id',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ auth, params }) => {
      const existing = await deps.prisma.customDataView.findUnique({ where: { id: params.id } });
      if (!existing) throw notFound('CustomDataView', params.id);
      if (existing.createdById !== auth.userId && !isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Cannot delete another user’s custom view.');
      }
      await deps.prisma.customDataView.delete({ where: { id: params.id } });
      return { deleted: true, id: params.id };
    },
  });

  // =========================================================================
  // 5. WORKSPACE UI CONFIGURATION PERSISTENCE (Widgets, Payroll Wizard, Perf Builder)
  // =========================================================================
  const UI_CONFIG_SOURCES = ['NDAKALA_WORKSPACE_UX'];
  const UI_CONFIG_KEY_ENUM = z.enum([
    'WIDGETS',
    'PAYROLL_WIZARD',
    'PERF_SETTINGS',
    'PERF_MODULE_FIELDS',
    'OPERATIONS_MODULES',
    'ORG_POLICY_TOGGLES',
    'EMAIL_FROM_ADDRESSES',
    'ORG_LOGO_LABEL',
    'SETUP_WIZARD',
    'SAMPLE_DATA_INITIALIZED',
    'CANDIDATE_DRAFT',
    'WORKSPACE_FAVORITES',
    'HOME_TOUR_SEEN',
    'OKR_CONFIG',
    'ONBOARDING_CANDIDATES',
  ]);

  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/ui-config',
    auth: 'session',
    query: z
      .object({
        key: z.string().optional(),
      })
      .optional(),
    handler: async ({ auth, query }) => {
      const key = (query?.key || 'ALL').toUpperCase();
      const orgConfigs = await deps.prisma.policyConfiguration.findMany({
        where: {
          sourceReference: { in: UI_CONFIG_SOURCES },
          status: 'ACTIVE',
          ...(key !== 'ALL' ? { code: { in: [`UI_ORG_${key}`, `UI_USER_${auth.userId}_${key}`] } } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });

      const result: Record<string, any> = {};
      for (const cfg of orgConfigs) {
        if (cfg.code.startsWith('UI_ORG_')) {
          result[cfg.code.replace('UI_ORG_', '')] = JSON.parse(cfg.values);
        } else if (cfg.code.startsWith(`UI_USER_${auth.userId}_`)) {
          result[cfg.code.replace(`UI_USER_${auth.userId}_`, '')] = JSON.parse(cfg.values);
        }
      }
      return { configs: result };
    },
  });

  const handleSaveUiConfig = async ({ auth, body, req }: { auth: any; body: any; req: any }) => {
    if (body.scope === 'ORG') {
      const canManageOrgUi =
        isHrOrAdmin(auth.roles, auth.permissions) ||
        auth.permissions.has('payroll.config.manage') ||
        auth.permissions.has('performance.cycle.manage') ||
        auth.permissions.has('config.create');
      if (!canManageOrgUi) {
        throw forbidden('Saving organization-wide UI configuration requires HR, Payroll, Performance, or Admin privileges.');
      }
    }

    const code = body.scope === 'ORG' ? `UI_ORG_${body.key}` : `UI_USER_${auth.userId}_${body.key}`;
    const existing = await deps.prisma.policyConfiguration.findFirst({
      where: { code, sourceReference: { in: UI_CONFIG_SOURCES }, status: 'ACTIVE' },
    });

    const saved = existing
      ? await deps.prisma.policyConfiguration.update({
          where: { id: existing.id },
          data: {
            values: JSON.stringify(body.value),
            version: existing.version + 1,
            sourceReference: 'NDAKALA_WORKSPACE_UX',
          },
        })
      : await deps.prisma.policyConfiguration.create({
          data: {
            code,
            title: `Ndakala Workspace UX Config: ${body.key} (${body.scope})`,
            layer: 'ORGANISATION',
            status: 'ACTIVE',
            values: JSON.stringify(body.value),
            sourceReference: 'NDAKALA_WORKSPACE_UX',
            owner: auth.name || auth.email,
            effectiveFrom: new Date(),
            createdById: auth.userId,
          },
        });

    await writeAudit(deps.prisma, auditCtx(auth, req), {
      action: 'WORKSPACE_UI_CONFIG_SAVED',
      targetType: 'PolicyConfiguration',
      targetId: saved.id,
      outcome: 'SUCCESS',
      after: { key: body.key, scope: body.scope },
    });

    return { id: saved.id, key: body.key, scope: body.scope, value: body.value };
  };

  registerRoute(router, deps, {
    method: 'put',
    path: '/workspace/ui-config',
    auth: 'session',
    body: z.object({
      key: UI_CONFIG_KEY_ENUM,
      scope: z.enum(['USER', 'ORG']).default('USER'),
      value: z.record(z.any()),
    }),
    handler: handleSaveUiConfig,
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/ui-config',
    auth: 'session',
    body: z.object({
      key: UI_CONFIG_KEY_ENUM,
      scope: z.enum(['USER', 'ORG']).default('USER'),
      value: z.record(z.any()),
    }),
    handler: handleSaveUiConfig,
  });

  // =========================================================================
  // 6. HR LETTERS / ADDRESS PROOF (HrLetterRequest)
  // =========================================================================
  registerRoute(router, deps, {
    method: 'get',
    path: '/hr-letters/address-proof',
    auth: 'session',
    query: z
      .object({
        status: z.string().optional(),
        search: z.string().optional(),
      })
      .optional(),
    handler: async ({ auth, query }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const adminView = isHrOrAdmin(auth.roles, auth.permissions);

      const where: any = {};
      if (!adminView) where.employeeId = actorEmpId;
      if (query?.status && query.status !== 'ALL') where.status = query.status;
      if (query?.search) {
        where.OR = [
          { reason: { contains: query.search } },
          { otherReason: { contains: query.search } },
          { addressDetails: { contains: query.search } },
        ];
      }

      const letters = await deps.prisma.hrLetterRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const empIds = [...new Set(letters.map((l) => l.employeeId))];
      const employees = empIds.length
        ? await deps.prisma.employee.findMany({
            where: { id: { in: empIds } },
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, workEmail: true },
          })
        : [];
      const empMap = new Map(employees.map((e) => [e.id, e]));

      return {
        items: letters.map((l) => {
          const emp = empMap.get(l.employeeId);
          return {
            ...l,
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Staff Member',
            employeeNumber: emp?.employeeNumber || '',
          };
        }),
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/hr-letters/address-proof',
    auth: 'session',
    body: z.object({
      employeeId: z.string().optional(),
      reason: z.string().min(2).max(160),
      otherReason: z.string().max(300).optional(),
      changeInAddress: z.boolean().default(false),
      addressDetails: z.string().max(500).optional(),
      status: z.enum(['DRAFT', 'SUBMITTED']).default('SUBMITTED'),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const targetEmpId =
        body.employeeId && isHrOrAdmin(auth.roles, auth.permissions) ? body.employeeId : actorEmpId;

      const created = await deps.prisma.hrLetterRequest.create({
        data: {
          employeeId: targetEmpId,
          letterType: 'ADDRESS_PROOF',
          reason: body.reason,
          otherReason: body.otherReason || null,
          changeInAddress: body.changeInAddress,
          addressDetails: body.addressDetails || null,
          status: body.status,
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: body.status === 'DRAFT' ? 'HR_LETTER_DRAFT_SAVED' : 'HR_LETTER_SUBMITTED',
        targetType: 'HrLetterRequest',
        targetId: created.id,
        outcome: 'SUCCESS',
        after: { reason: created.reason, status: created.status },
      });

      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/hr-letters/address-proof/:id',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']),
      reason: z.string().min(2).max(160).optional(),
      otherReason: z.string().max(300).optional(),
      changeInAddress: z.boolean().optional(),
      addressDetails: z.string().max(500).optional(),
    }),
    handler: async ({ auth, params, body, req }) => {
      const existing = await deps.prisma.hrLetterRequest.findUnique({ where: { id: params.id } });
      if (!existing) throw notFound('HrLetterRequest', params.id);

      const adminView = isHrOrAdmin(auth.roles, auth.permissions);
      if ((body.status === 'APPROVED' || body.status === 'REJECTED') && !adminView) {
        throw forbidden('Only HR Officers/Managers or Admins can approve or reject HR letters.');
      }

      const actorEmpId = await resolveActorEmpId(auth.userId);
      if (!adminView && existing.employeeId !== actorEmpId) {
        throw forbidden('Cannot modify another employee’s HR letter request.');
      }

      const updated = await deps.prisma.hrLetterRequest.update({
        where: { id: params.id },
        data: {
          status: body.status,
          ...(body.reason !== undefined ? { reason: body.reason } : {}),
          ...(body.otherReason !== undefined ? { otherReason: body.otherReason } : {}),
          ...(body.changeInAddress !== undefined ? { changeInAddress: body.changeInAddress } : {}),
          ...(body.addressDetails !== undefined ? { addressDetails: body.addressDetails } : {}),
          ...(body.status === 'APPROVED' || body.status === 'REJECTED' ? { reviewedById: auth.userId } : {}),
        },
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `HR_LETTER_${body.status}`,
        targetType: 'HrLetterRequest',
        targetId: updated.id,
        outcome: 'SUCCESS',
      });

      return updated;
    },
  });

  // =========================================================================
  // 7. DEDICATED SERVICE COLLECTIONS (Shifts, Travel, Engagement Surveys, Action Tasks)
  // =========================================================================
  async function readCollection<T>(collectionCode: string): Promise<T[]> {
    const row = await deps.prisma.policyConfiguration.findFirst({
      where: { code: collectionCode, sourceReference: 'NDAKALA_WORKSPACE_DATA', status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.values);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function writeCollection<T>(collectionCode: string, title: string, items: T[], actorId: string, actorLabel: string) {
    const existing = await deps.prisma.policyConfiguration.findFirst({
      where: { code: collectionCode, sourceReference: 'NDAKALA_WORKSPACE_DATA', status: 'ACTIVE' },
    });
    if (existing) {
      return deps.prisma.policyConfiguration.update({
        where: { id: existing.id },
        data: { values: JSON.stringify(items), version: existing.version + 1 },
      });
    }
    return deps.prisma.policyConfiguration.create({
      data: {
        code: collectionCode,
        title,
        layer: 'ORGANISATION',
        status: 'ACTIVE',
        values: JSON.stringify(items),
        sourceReference: 'NDAKALA_WORKSPACE_DATA',
        owner: actorLabel,
        effectiveFrom: new Date(),
        createdById: actorId,
      },
    });
  }

  // ---- 7A. Shifts & Roster Schedules ----
  const SHIFTS_CODE = 'WS_SHIFTS_CATALOG';
  const DEFAULT_SHIFT = {
    id: 'shift-general',
    code: 'GEN-DAY',
    name: 'General Advisory Shift',
    startTime: '08:30',
    endTime: '17:30',
    breakMinutes: 60,
    gracePeriodMinutes: 15,
    department: 'All Departments',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    assignedEmployeeIds: [] as string[],
    isNightShift: false,
    isActive: true,
  };

  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/shifts',
    auth: 'session',
    handler: async () => {
      const stored = await readCollection<any>(SHIFTS_CODE);
      if (stored.length > 0) return { items: stored };
      return { items: [DEFAULT_SHIFT] };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/shifts',
    auth: 'session',
    body: z.object({
      name: z.string().min(2).max(120),
      code: z.string().min(2).max(40).optional(),
      startTime: z.string().min(4).max(10),
      endTime: z.string().min(4).max(10),
      breakMinutes: z.number().min(0).max(240).default(60),
      gracePeriodMinutes: z.number().min(0).max(120).default(15),
      department: z.string().min(1).max(100).default('All Departments'),
      workingDays: z.array(z.string()).default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
      assignedEmployeeIds: z.array(z.string()).default([]),
      isNightShift: z.boolean().default(false),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      if (!isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Only HR or Admin roles can configure work shifts.');
      }
      const existingRaw = await readCollection<any>(SHIFTS_CODE);
      const existing = existingRaw.length > 0 ? existingRaw : [DEFAULT_SHIFT];
      const created = {
        id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: (body.code || body.name.slice(0, 6)).toUpperCase().replace(/\s+/g, '-'),
        name: body.name,
        startTime: body.startTime,
        endTime: body.endTime,
        breakMinutes: body.breakMinutes,
        gracePeriodMinutes: body.gracePeriodMinutes,
        department: body.department,
        workingDays: body.workingDays,
        assignedEmployeeIds: body.assignedEmployeeIds,
        isNightShift: body.isNightShift,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      await writeCollection(SHIFTS_CODE, 'Work Shifts Roster Catalog', [created, ...existing], auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_SHIFT_CREATED',
        targetType: 'ShiftRoster',
        targetId: created.id,
        outcome: 'SUCCESS',
        after: created,
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/workspace/shifts/:id',
    auth: 'session',
    params: z.object({ id: z.string().min(2) }),
    body: z.object({
      name: z.string().min(2).max(120).optional(),
      startTime: z.string().min(4).max(10).optional(),
      endTime: z.string().min(4).max(10).optional(),
      breakMinutes: z.number().min(0).max(240).optional(),
      gracePeriodMinutes: z.number().min(0).max(120).optional(),
      department: z.string().min(1).max(100).optional(),
      workingDays: z.array(z.string()).optional(),
      assignedEmployeeIds: z.array(z.string()).optional(),
      isNightShift: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }),
    handler: async ({ auth, params, body, req }) => {
      if (!isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Only HR or Admin roles can update work shifts.');
      }
      const stored = await readCollection<any>(SHIFTS_CODE);
      const existing = stored.length > 0 ? stored : [DEFAULT_SHIFT];
      const idx = existing.findIndex((s) => s.id === params.id);
      if (idx === -1) throw notFound('ShiftRoster', params.id);
      const updated = { ...existing[idx], ...body, updatedAt: new Date().toISOString() };
      existing[idx] = updated;
      await writeCollection(SHIFTS_CODE, 'Work Shifts Roster Catalog', existing, auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_SHIFT_UPDATED',
        targetType: 'ShiftRoster',
        targetId: updated.id,
        outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'delete',
    path: '/workspace/shifts/:id',
    auth: 'session',
    params: z.object({ id: z.string().min(2) }),
    handler: async ({ auth, params, req }) => {
      if (!isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Only HR or Admin roles can remove work shifts.');
      }
      const existing = await readCollection<any>(SHIFTS_CODE);
      const target = existing.find((s) => s.id === params.id);
      if (!target) throw notFound('ShiftRoster', params.id);
      const filtered = existing.filter((s) => s.id !== params.id);
      await writeCollection(SHIFTS_CODE, 'Work Shifts Roster Catalog', filtered, auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_SHIFT_DELETED',
        targetType: 'ShiftRoster',
        targetId: params.id,
        outcome: 'SUCCESS',
      });
      return { deleted: true, id: params.id };
    },
  });

  // ---- 7B. Business Travel & Per Diem Requests ----
  const TRAVEL_CODE = 'WS_TRAVEL_REQUESTS';
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/travel-requests',
    auth: 'session',
    handler: async ({ auth }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const adminView = isHrOrAdmin(auth.roles, auth.permissions);
      const items = await readCollection<any>(TRAVEL_CODE);
      return {
        items: adminView ? items : items.filter((r) => r.employeeId === actorEmpId || r.createdById === auth.userId),
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/travel-requests',
    auth: 'session',
    body: z.object({
      employeeId: z.string().optional(),
      destination: z.string().min(2).max(140),
      purpose: z.string().min(5).max(300),
      departureDate: z.string().min(8).max(20),
      returnDate: z.string().min(8).max(20),
      transportMode: z.enum(['FLIGHT', 'RAIL_SGR', 'ROAD', 'LOCAL_TAXI']).default('FLIGHT'),
      perDiemDays: z.number().int().min(1).max(90).optional(),
      estimatedBudgetKes: z.number().min(0).default(0),
      notes: z.string().max(400).optional(),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const targetEmpId = body.employeeId && isHrOrAdmin(auth.roles, auth.permissions) ? body.employeeId : actorEmpId;
      const emp = await deps.prisma.employee.findFirst({ where: { id: targetEmpId }, select: { firstName: true, lastName: true } });
      const items = await readCollection<any>(TRAVEL_CODE);
      const created = {
        id: `trv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId: targetEmpId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : auth.name || auth.email,
        destination: body.destination,
        purpose: body.purpose,
        departureDate: body.departureDate,
        returnDate: body.returnDate,
        transportMode: body.transportMode,
        perDiemDays: body.perDiemDays || 1,
        estimatedBudgetKes: body.estimatedBudgetKes,
        reimbursementAmountKes: 0,
        notes: body.notes || '',
        status: 'SUBMITTED',
        createdById: auth.userId,
        createdAt: new Date().toISOString(),
      };
      await writeCollection(TRAVEL_CODE, 'Business Travel Requests', [created, ...items], auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TRAVEL_REQUEST_CREATED',
        targetType: 'TravelRequest',
        targetId: created.id,
        outcome: 'SUCCESS',
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/workspace/travel-requests/:id',
    auth: 'session',
    params: z.object({ id: z.string().min(2) }),
    body: z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED', 'REIMBURSED']),
      reimbursementAmountKes: z.number().min(0).optional(),
      approverComment: z.string().max(300).optional(),
    }),
    handler: async ({ auth, params, body, req }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const items = await readCollection<any>(TRAVEL_CODE);
      const idx = items.findIndex((r) => r.id === params.id);
      if (idx === -1) throw notFound('TravelRequest', params.id);
      const current = items[idx];

      if ((body.status === 'APPROVED' || body.status === 'REJECTED' || body.status === 'REIMBURSED') && !isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Only HR/Admin managers can approve, reject, or reimburse travel requests.');
      }
      if (body.status === 'CANCELLED' && !isHrOrAdmin(auth.roles, auth.permissions) && current.employeeId !== actorEmpId) {
        throw forbidden('Cannot cancel another employee’s travel request.');
      }

      if (body.status === 'REIMBURSED' && current.status !== 'APPROVED') {
        throw validation('Only APPROVED travel requests can be marked REIMBURSED.');
      }
      if ((body.status === 'APPROVED' || body.status === 'REJECTED' || body.status === 'CANCELLED') && current.status !== 'SUBMITTED' && current.status !== 'PENDING') {
        throw validation(`Cannot transition travel request from ${current.status} to ${body.status}.`);
      }

      const updated = {
        ...current,
        status: body.status,
        reimbursementAmountKes:
          body.status === 'REIMBURSED'
            ? (body.reimbursementAmountKes ?? current.estimatedBudgetKes ?? 0)
            : (body.reimbursementAmountKes ?? current.reimbursementAmountKes ?? 0),
        approverComment: body.approverComment || current.approverComment || '',
        reviewedById: auth.userId,
        reviewedAt: new Date().toISOString(),
      };
      items[idx] = updated;
      await writeCollection(TRAVEL_CODE, 'Business Travel Requests', items, auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `TRAVEL_REQUEST_${body.status}`,
        targetType: 'TravelRequest',
        targetId: updated.id,
        outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  // ---- 7C. Employee Engagement Pulse Surveys ----
  const SURVEYS_CODE = 'WS_ENGAGEMENT_SURVEYS';
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/surveys',
    auth: 'session',
    handler: async ({ auth }) => {
      const items = await readCollection<any>(SURVEYS_CODE);
      return {
        items: items.map((s) => {
          const responses = Array.isArray(s.responses) ? s.responses : [];
          const avgRating = responses.length
            ? Number((responses.reduce((acc: number, r: any) => acc + Number(r.overallRating || 0), 0) / responses.length).toFixed(1))
            : 0;
          return {
            id: s.id,
            title: s.title,
            description: s.description,
            anonymous: Boolean(s.anonymous),
            closingDate: s.closingDate,
            status: s.status || 'OPEN',
            responseCount: responses.length,
            avgRating,
            hasResponded: responses.some((r: any) => r.respondentUserId === auth.userId),
            recentComments: responses.slice(0, 5).map((r: any) => ({
              rating: r.overallRating,
              comment: r.comment,
              author: s.anonymous ? 'Anonymous Staff' : r.respondentName,
              submittedAt: r.submittedAt,
            })),
          };
        }),
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/surveys',
    auth: 'session',
    body: z.object({
      title: z.string().min(3).max(140),
      description: z.string().min(5).max(400),
      closingDate: z.string().min(8).max(20),
      anonymous: z.boolean().default(true),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      if (!isHrOrAdmin(auth.roles, auth.permissions)) {
        throw forbidden('Only HR or Admin roles can publish pulse surveys.');
      }
      const items = await readCollection<any>(SURVEYS_CODE);
      const created = {
        id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: body.title,
        description: body.description,
        closingDate: body.closingDate,
        anonymous: body.anonymous,
        status: 'OPEN',
        responses: [],
        createdById: auth.userId,
        createdAt: new Date().toISOString(),
      };
      await writeCollection(SURVEYS_CODE, 'Employee Engagement Surveys', [created, ...items], auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ENGAGEMENT_SURVEY_CREATED',
        targetType: 'EngagementSurvey',
        targetId: created.id,
        outcome: 'SUCCESS',
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/surveys/:id/respond',
    auth: 'session',
    params: z.object({ id: z.string().min(2) }),
    body: z.object({
      overallRating: z.number().int().min(1).max(5),
      comment: z.string().max(400).optional(),
    }),
    handler: async ({ auth, params, body, req }) => {
      const items = await readCollection<any>(SURVEYS_CODE);
      const idx = items.findIndex((s) => s.id === params.id);
      if (idx === -1) throw notFound('EngagementSurvey', params.id);
      const responses = Array.isArray(items[idx].responses) ? items[idx].responses : [];
      if (responses.some((r: any) => r.respondentUserId === auth.userId)) {
        throw validation('You have already submitted a response to this survey.');
      }
      responses.unshift({
        respondentUserId: auth.userId,
        respondentName: auth.name || auth.email,
        overallRating: body.overallRating,
        comment: body.comment || '',
        submittedAt: new Date().toISOString(),
      });
      items[idx].responses = responses;
      await writeCollection(SURVEYS_CODE, 'Employee Engagement Surveys', items, auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ENGAGEMENT_SURVEY_RESPONDED',
        targetType: 'EngagementSurvey',
        targetId: params.id,
        outcome: 'SUCCESS',
      });
      return { submitted: true, responseCount: responses.length };
    },
  });

  // ---- 7D. Personal & Team Action Tasks ----
  const PERSONAL_TASKS_CODE = 'WS_ACTION_TASKS';
  registerRoute(router, deps, {
    method: 'get',
    path: '/workspace/personal-tasks',
    auth: 'session',
    handler: async ({ auth }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const adminView = isHrOrAdmin(auth.roles, auth.permissions);
      const items = await readCollection<any>(PERSONAL_TASKS_CODE);
      return {
        items: adminView
          ? items
          : items.filter((t) => t.createdById === auth.userId || t.assigneeEmployeeId === actorEmpId),
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/workspace/personal-tasks',
    auth: 'session',
    body: z.object({
      title: z.string().min(2).max(160),
      dueDate: z.string().min(8).max(20),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
      assigneeEmployeeId: z.string().optional(),
      notes: z.string().max(400).optional(),
    }),
    successStatus: 201,
    handler: async ({ auth, body, req }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const targetEmpId = body.assigneeEmployeeId || actorEmpId;
      const emp = await deps.prisma.employee.findFirst({ where: { id: targetEmpId }, select: { firstName: true, lastName: true } });
      const items = await readCollection<any>(PERSONAL_TASKS_CODE);
      const created = {
        id: `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: body.title,
        dueDate: body.dueDate,
        priority: body.priority,
        assigneeEmployeeId: targetEmpId,
        assigneeName: emp ? `${emp.firstName} ${emp.lastName}` : auth.name || auth.email,
        notes: body.notes || '',
        status: 'TODO',
        createdById: auth.userId,
        createdAt: new Date().toISOString(),
      };
      await writeCollection(PERSONAL_TASKS_CODE, 'Personal & Action Tasks', [created, ...items], auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_TASK_CREATED',
        targetType: 'ActionTask',
        targetId: created.id,
        outcome: 'SUCCESS',
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/workspace/personal-tasks/:id',
    auth: 'session',
    params: z.object({ id: z.string().min(2) }),
    body: z.object({
      status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      title: z.string().min(2).max(160).optional(),
      dueDate: z.string().min(8).max(20).optional(),
      notes: z.string().max(400).optional(),
      assigneeEmployeeId: z.string().optional(),
    }),
    handler: async ({ auth, params, body, req }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const items = await readCollection<any>(PERSONAL_TASKS_CODE);
      const idx = items.findIndex((t) => t.id === params.id);
      if (idx === -1) throw notFound('ActionTask', params.id);
      if (!isHrOrAdmin(auth.roles, auth.permissions) && items[idx].createdById !== auth.userId && items[idx].assigneeEmployeeId !== actorEmpId) {
        throw forbidden('Cannot modify another employee’s task.');
      }
      let assigneeName = items[idx].assigneeName;
      if (body.assigneeEmployeeId && body.assigneeEmployeeId !== items[idx].assigneeEmployeeId) {
        const emp = await deps.prisma.employee.findFirst({ where: { id: body.assigneeEmployeeId }, select: { firstName: true, lastName: true } });
        if (emp) assigneeName = `${emp.firstName} ${emp.lastName}`;
      }
      const updated = { ...items[idx], ...body, assigneeName, updatedAt: new Date().toISOString() };
      items[idx] = updated;
      await writeCollection(PERSONAL_TASKS_CODE, 'Personal & Action Tasks', items, auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_TASK_UPDATED',
        targetType: 'ActionTask',
        targetId: updated.id,
        outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'delete',
    path: '/workspace/personal-tasks/:id',
    auth: 'session',
    params: z.object({ id: z.string().min(2) }),
    handler: async ({ auth, params, req }) => {
      const actorEmpId = await resolveActorEmpId(auth.userId);
      const items = await readCollection<any>(PERSONAL_TASKS_CODE);
      const item = items.find((t) => t.id === params.id);
      if (!item) throw notFound('ActionTask', params.id);
      if (!isHrOrAdmin(auth.roles, auth.permissions) && item.createdById !== auth.userId && item.assigneeEmployeeId !== actorEmpId) {
        throw forbidden('Cannot delete another employee’s task.');
      }
      await writeCollection(PERSONAL_TASKS_CODE, 'Personal & Action Tasks', items.filter((t) => t.id !== params.id), auth.userId, auth.email);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'WORKSPACE_TASK_DELETED',
        targetType: 'ActionTask',
        targetId: params.id,
        outcome: 'SUCCESS',
      });
      return { deleted: true, id: params.id };
    },
  });

  return router;
}
