import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict, forbidden, validation } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import { startWorkflowInstance, processTaskAction, delegateWorkflowTask } from './engine.js';
import { reviewLeaveRequest } from '../leave/service.js';

export function createWorkflowRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. List Workflow Definitions
  registerRoute(router, deps, {
    method: 'get',
    path: '/workflows/definitions',
    auth: { permission: 'workflow.view' },
    handler: async ({ deps }) => {
      const defs = await deps.prisma.workflowDefinition.findMany({
        orderBy: { code: 'asc' },
      });
      return defs.map((d) => ({ ...d, stages: JSON.parse(d.stages) }));
    },
  });

  // 2. Create Workflow Definition
  registerRoute(router, deps, {
    method: 'post',
    path: '/workflows/definitions',
    auth: { permission: 'workflow.manage' },
    body: z.object({
      code: z.string().min(2).max(50).toUpperCase(),
      name: z.string().min(2).max(100),
      preventSelfApproval: z.boolean().default(true),
      requireSeparationOfDuties: z.boolean().default(true),
      stages: z.array(
        z.object({
          id: z.string(),
          title: z.string().min(2),
          stageType: z.enum([
            'ROLE_APPROVAL',
            'NAMED_APPROVER',
            'CONDITION',
            'DUE_DATE',
            'DELEGATION',
            'ESCALATION',
            'RETURN_FOR_EDIT',
            'REJECT',
            'COMPLETION',
          ]),
          assignedRoleKey: z.string().optional(),
          assignedUserId: z.string().uuid().optional(),
          canReturn: z.boolean().default(true),
          canReject: z.boolean().default(true),
          dueHours: z.number().int().positive().optional(),
        }),
      ),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const exists = await deps.prisma.workflowDefinition.findUnique({
        where: { code: body.code },
      });
      if (exists) throw conflict(`Workflow definition with code '${body.code}' already exists`);

      const def = await deps.prisma.workflowDefinition.create({
        data: {
          code: body.code,
          name: body.name,
          preventSelfApproval: body.preventSelfApproval,
          requireSeparationOfDuties: body.requireSeparationOfDuties,
          stages: JSON.stringify(body.stages),
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'WORKFLOW_DEFINITION_CREATE',
          targetType: 'WorkflowDefinition',
          targetId: def.id,
          outcome: 'SUCCESS',
          after: { code: def.code, stagesCount: body.stages.length },
        },
      );

      return { ...def, stages: JSON.parse(def.stages) };
    },
  });

  // 3. Start Workflow Instance
  registerRoute(router, deps, {
    method: 'post',
    path: '/workflows/start',
    auth: { permission: 'workflow.action' },
    body: z.object({
      definitionCode: z.string().toUpperCase(),
      targetType: z.string(),
      targetId: z.string(),
      deepLink: z.string().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const result = await startWorkflowInstance(
        deps.prisma,
        body.definitionCode,
        body.targetType,
        body.targetId,
        auth.userId,
        body.deepLink,
      );

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'WORKFLOW_STARTED',
          targetType: body.targetType,
          targetId: body.targetId,
          outcome: 'SUCCESS',
          after: { instanceId: result.instance.id, definitionCode: body.definitionCode },
        },
      );

      return result;
    },
  });

  // 4. Task Inbox: Get Pending Tasks for Current User
  registerRoute(router, deps, {
    method: 'get',
    path: '/tasks/inbox',
    auth: 'session',
    handler: async ({ auth, deps }) => {
      const tasks = await deps.prisma.workflowTask.findMany({
        where: {
          status: 'PENDING',
          OR: [
            { assignedUserId: auth.userId },
            { assignedRoleKey: { in: auth.roles } },
          ],
        },
        include: {
          instance: {
            select: {
              id: true,
              initiatorUserId: true,
              targetType: true,
              targetId: true,
              status: true,
              definition: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return tasks;
    },
  });

  // 5. Action Task (APPROVE, REJECT, RETURN)
  registerRoute(router, deps, {
    method: 'post',
    path: '/tasks/:id/action',
    auth: { permission: 'workflow.action' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      action: z.enum(['APPROVE', 'REJECT', 'RETURN']),
      comments: z.string().max(500).optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const result = await processTaskAction(
        deps.prisma,
        params.id,
        auth.userId,
        auth.roles,
        body.action,
        body.comments,
      );

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: `WORKFLOW_TASK_${body.action}`,
          targetType: 'WorkflowTask',
          targetId: params.id,
          outcome: 'SUCCESS',
          reason: body.comments,
        },
      );

      return result;
    },
  });

  // 6. Operations Approvals Hub: Unified Approvals Feed (#operations/approvals)
  registerRoute(router, deps, {
    method: 'get',
    path: '/operations/approvals',
    auth: 'session',
    query: z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'ALL']).default('PENDING'),
      employeeStatus: z.enum(['ACTIVE', 'ALL']).default('ACTIVE'),
      module: z.enum(['ALL', 'LEAVE', 'CONFIG', 'PROFILE']).default('ALL'),
      search: z.string().optional(),
    }),
    handler: async ({ query, auth, deps }) => {
      const isSuperAdmin = auth.roles.includes('managing_partner') || auth.roles.includes('head_of_hr') || auth.roles.includes('operations_director');
      const canApproveLeave = (auth.permissions && typeof auth.permissions.has === 'function' ? auth.permissions.has('leave.approve') : false) || isSuperAdmin;
      const canApproveConfig = (auth.permissions && typeof auth.permissions.has === 'function' ? auth.permissions.has('config.approve') : false) || isSuperAdmin;

      // 6a. Query Workflow Tasks
      const workflowTaskWhere: any = {};
      if (query.status !== 'ALL') {
        if (query.status === 'PENDING') workflowTaskWhere.status = 'PENDING';
        else if (query.status === 'APPROVED') workflowTaskWhere.status = 'COMPLETED';
        else if (query.status === 'REJECTED') workflowTaskWhere.status = 'REJECTED';
      }
      if (!isSuperAdmin) {
        workflowTaskWhere.OR = [
          { assignedUserId: auth.userId },
          { assignedRoleKey: { in: auth.roles } },
        ];
      }

      const tasks = await deps.prisma.workflowTask.findMany({
        where: workflowTaskWhere,
        include: {
          instance: {
            include: {
              definition: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Find user/employee info for workflow tasks
      const initiatorIds = Array.from(new Set(tasks.map((t) => t.instance.initiatorUserId)));
      const initiatorUsers = await deps.prisma.user.findMany({
        where: { id: { in: initiatorIds } },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
      const userMap = new Map(initiatorUsers.map((u) => [u.id, u]));

      const employees = await deps.prisma.employee.findMany({
        where: { userId: { in: initiatorIds } },
        select: {
          id: true,
          userId: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          status: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      });
      const empMap = new Map(employees.map((e) => [e.userId as string, e]));

      // 6b. Query Leave Requests
      const leaveWhere: any = {};
      if (query.status !== 'ALL') {
        if (query.status === 'PENDING') leaveWhere.status = 'PENDING_APPROVAL';
        else if (query.status === 'APPROVED') leaveWhere.status = 'APPROVED';
        else if (query.status === 'REJECTED') leaveWhere.status = 'REJECTED';
        else if (query.status === 'RETURNED') leaveWhere.status = 'RETURNED_FOR_EDIT';
      }
      if (query.employeeStatus === 'ACTIVE') {
        leaveWhere.employee = { status: 'ACTIVE' };
      }

      // If user is line manager or HR, show requests they have access to
      let leaveRequests: any[] = [];
      if (query.module === 'ALL' || query.module === 'LEAVE') {
        leaveRequests = await (deps.prisma.leaveRequest as any).findMany({
          where: leaveWhere,
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                firstName: true,
                lastName: true,
                workEmail: true,
                status: true,
                department: { select: { name: true } },
                position: { select: { title: true } },
              },
            },
            leaveType: {
              select: { id: true, code: true, name: true, category: true },
            },
          },
          orderBy: { submittedAt: 'desc' },
        });
      }

      const unifiedItems: any[] = [];

      // Map workflow tasks
      if (query.module === 'ALL' || query.module === 'CONFIG') {
        for (const t of tasks) {
          const initiator = userMap.get(t.instance.initiatorUserId);
          const emp = empMap.get(t.instance.initiatorUserId);

          if (query.employeeStatus === 'ACTIVE' && emp && emp.status !== 'ACTIVE') {
            continue;
          }

          const statusNormalized =
            t.status === 'PENDING' ? 'PENDING' : t.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

          const item = {
            id: t.id,
            source: 'WORKFLOW',
            requestId: `WF-${t.instance.definition.code}-${t.id.slice(0, 6).toUpperCase()}`,
            title: t.title || `${t.instance.definition.name}`,
            module: 'CONFIG',
            stageTitle: t.title,
            initiator: {
              id: initiator?.id || t.instance.initiatorUserId,
              employeeNumber: emp?.employeeNumber || 'SYS',
              firstName: emp?.firstName || initiator?.name?.split(' ')[0] || 'System',
              lastName: emp?.lastName || initiator?.name?.split(' ').slice(1).join(' ') || 'User',
              name: initiator?.name || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || initiator?.email || 'User',
              email: initiator?.email || '',
              departmentName: emp?.department?.name || 'Administration',
              designationName: (emp as any)?.position?.title || 'Authorized Officer',
            },
            submittedAt: t.createdAt.toISOString(),
            dueDate: t.dueDate ? t.dueDate.toISOString() : null,
            status: statusNormalized,
            details: {
              definitionName: t.instance.definition.name,
              definitionCode: t.instance.definition.code,
              targetType: t.instance.targetType,
              targetId: t.instance.targetId,
              description: t.description,
            },
            canApprove: canApproveConfig && t.status === 'PENDING',
          };

          if (query.search) {
            const s = query.search.toLowerCase();
            const matches =
              item.requestId.toLowerCase().includes(s) ||
              item.title.toLowerCase().includes(s) ||
              item.initiator.name.toLowerCase().includes(s) ||
              item.initiator.email.toLowerCase().includes(s);
            if (!matches) continue;
          }

          unifiedItems.push(item);
        }
      }

      // Map leave requests
      for (const lr of leaveRequests) {
        const statusNormalized =
          lr.status === 'PENDING_APPROVAL'
            ? 'PENDING'
            : lr.status === 'APPROVED'
            ? 'APPROVED'
            : lr.status === 'RETURNED_FOR_EDIT'
            ? 'RETURNED'
            : 'REJECTED';

        const item = {
          id: lr.id,
          source: 'LEAVE',
          requestId: lr.requestNumber,
          title: `Leave Application - ${lr.leaveType?.name || 'Leave'} (${lr.workingDaysDeducted} Day${lr.workingDaysDeducted === 1 ? '' : 's'})`,
          module: 'LEAVE',
          stageTitle: 'Line Manager & HR Review',
          initiator: {
            id: lr.employee?.id || lr.employeeId,
            employeeNumber: lr.employee?.employeeNumber || 'NDA',
            firstName: lr.employee?.firstName || 'Employee',
            lastName: lr.employee?.lastName || '',
            name: `${lr.employee?.firstName || ''} ${lr.employee?.lastName || ''}`.trim(),
            email: lr.employee?.workEmail || '',
            departmentName: lr.employee?.department?.name || 'Advisory',
            designationName: (lr.employee as any)?.position?.title || 'Associate',
          },
          submittedAt: lr.submittedAt.toISOString(),
          dueDate: new Date(lr.submittedAt.getTime() + 48 * 3600 * 1000).toISOString(),
          status: statusNormalized,
          details: {
            leaveTypeCode: lr.leaveType?.code,
            leaveTypeName: lr.leaveType?.name,
            startDate: lr.startDate.toISOString().split('T')[0],
            endDate: lr.endDate.toISOString().split('T')[0],
            calendarDays: lr.calendarDays,
            workingDaysDeducted: lr.workingDaysDeducted,
            reason: lr.reason || 'Not disclosed',
            isHalfDay: lr.isHalfDay,
            halfDayType: lr.halfDayType,
          },
          canApprove: canApproveLeave && lr.status === 'PENDING_APPROVAL',
        };

        if (query.search) {
          const s = query.search.toLowerCase();
          const matches =
            item.requestId.toLowerCase().includes(s) ||
            item.title.toLowerCase().includes(s) ||
            item.initiator.name.toLowerCase().includes(s) ||
            item.initiator.email.toLowerCase().includes(s);
          if (!matches) continue;
        }

        unifiedItems.push(item);
      }

      // Sort by submittedAt descending
      unifiedItems.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      // Calculate counts
      const pendingCount = unifiedItems.filter((i) => i.status === 'PENDING').length;
      const approvedCount = unifiedItems.filter((i) => i.status === 'APPROVED').length;
      const rejectedCount = unifiedItems.filter((i) => i.status === 'REJECTED').length;

      return {
        data: unifiedItems,
        counts: {
          pendingCount,
          approvedCount,
          rejectedCount,
          totalCount: unifiedItems.length,
        },
      };
    },
  });

  // 7. Operations Approvals Hub: Batch Process Approvals
  registerRoute(router, deps, {
    method: 'post',
    path: '/operations/approvals/batch',
    auth: 'session',
    body: z.object({
      itemIds: z.array(z.string().uuid()).min(1),
      action: z.enum(['APPROVE', 'REJECT', 'RETURN']),
      comments: z.string().max(500).optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const results: any[] = [];
      const successfulIds: string[] = [];
      const failedIds: string[] = [];

      for (const id of body.itemIds) {
        try {
          // Check if this is a Leave Request
          const leaveReq = await deps.prisma.leaveRequest.findUnique({
            where: { id },
          });

          if (leaveReq) {
            const leaveResult = await reviewLeaveRequest(deps.prisma, auth, {
              requestId: id,
              decision: body.action,
              comments: body.comments || `Batch ${body.action.toLowerCase()} via Operations Approvals Hub`,
            });
            results.push({ id, source: 'LEAVE', success: true, result: leaveResult });
            successfulIds.push(id);
            continue;
          }

          // Otherwise check if this is a Workflow Task
          const task = await deps.prisma.workflowTask.findUnique({
            where: { id },
          });

          if (task) {
            const taskResult = await processTaskAction(
              deps.prisma,
              id,
              auth.userId,
              auth.roles,
              body.action,
              body.comments,
            );
            results.push({ id, source: 'WORKFLOW', success: true, result: taskResult });
            successfulIds.push(id);
            continue;
          }

          failedIds.push(id);
          results.push({ id, success: false, error: 'Approval item not found' });
        } catch (err: any) {
          failedIds.push(id);
          results.push({ id, success: false, error: err.message || 'Execution error' });
        }
      }

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: `OPERATIONS_APPROVALS_BATCH_${body.action}`,
          targetType: 'ApprovalBatch',
          targetId: successfulIds.join(','),
          outcome: successfulIds.length > 0 ? ('SUCCESS' as const) : ('FAILURE' as const),
          after: { count: successfulIds.length, action: body.action },
        },
      );

      return {
        success: successfulIds.length > 0,
        processedCount: successfulIds.length,
        successfulIds,
        failedIds,
        results,
      };
    },
  });

  // 8. Operations Approvals Hub: Delegate Approval
  registerRoute(router, deps, {
    method: 'post',
    path: '/operations/approvals/:id/delegate',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      delegateUserId: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const task = await deps.prisma.workflowTask.findUnique({
        where: { id: params.id },
      });

      if (!task) {
        throw notFound('WorkflowTask', params.id);
      }

      const result = await delegateWorkflowTask(
        deps.prisma,
        params.id,
        auth.userId,
        auth.roles,
        body.delegateUserId,
        body.notes,
      );

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'OPERATIONS_APPROVAL_DELEGATED',
          targetType: 'WorkflowTask',
          targetId: params.id,
          outcome: 'SUCCESS',
          after: { delegateUserId: body.delegateUserId, notes: body.notes },
        },
      );

      return result;
    },
  });

  return router;
}
