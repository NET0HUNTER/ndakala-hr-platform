import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import { startWorkflowInstance, processTaskAction } from './engine.js';

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

  return router;
}
