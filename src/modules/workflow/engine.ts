import { PrismaClient } from '@prisma/client';
import { notFound, forbidden, conflict, validation } from '../../core/errors/errors.js';
import { assertNotSelfApproval } from '../../core/permissions/rbac.js';

export type StageType =
  | 'ROLE_APPROVAL'
  | 'NAMED_APPROVER'
  | 'CONDITION'
  | 'DUE_DATE'
  | 'DELEGATION'
  | 'ESCALATION'
  | 'RETURN_FOR_EDIT'
  | 'REJECT'
  | 'COMPLETION';

export interface StageDefinition {
  id: string;
  title: string;
  stageType: StageType;
  assignedRoleKey?: string;
  assignedUserId?: string;
  canReturn?: boolean;
  canReject?: boolean;
  dueHours?: number;
}

export async function startWorkflowInstance(
  prisma: PrismaClient,
  definitionCode: string,
  targetType: string,
  targetId: string,
  initiatorUserId: string,
  deepLink = '',
) {
  const definition = await prisma.workflowDefinition.findUnique({
    where: { code: definitionCode },
  });

  if (!definition || !definition.isActive) {
    throw notFound('Active WorkflowDefinition', definitionCode);
  }

  const stages: StageDefinition[] = JSON.parse(definition.stages);
  if (!stages.length) {
    throw validation('Workflow definition has no stages configured');
  }

  const firstStage = stages[0];
  const dueDate = firstStage.dueHours
    ? new Date(Date.now() + firstStage.dueHours * 3600 * 1000)
    : null;

  const instance = await prisma.workflowInstance.create({
    data: {
      definitionId: definition.id,
      definitionVersion: definition.version,
      targetType,
      targetId,
      initiatorUserId,
      currentStageIndex: 0,
      status: 'IN_PROGRESS',
      history: JSON.stringify([
        {
          timestamp: new Date().toISOString(),
          action: 'WORKFLOW_STARTED',
          actorUserId: initiatorUserId,
          stageIndex: 0,
          stageTitle: firstStage.title,
        },
      ]),
    },
  });

  const task = await prisma.workflowTask.create({
    data: {
      instanceId: instance.id,
      title: firstStage.title,
      description: `Pending approval at stage: ${firstStage.title}`,
      targetType,
      targetId,
      stageIndex: 0,
      assignedRoleKey: firstStage.assignedRoleKey ?? null,
      assignedUserId: firstStage.assignedUserId ?? null,
      dueDate,
      status: 'PENDING',
      deepLink: deepLink || `/${targetType.toLowerCase()}s/${targetId}`,
    },
  });

  return { instance, task };
}

export async function processTaskAction(
  prisma: PrismaClient,
  taskId: string,
  actorUserId: string,
  actorRoles: string[],
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  comments?: string,
) {
  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    include: {
      instance: {
        include: { definition: true },
      },
    },
  });

  if (!task) throw notFound('WorkflowTask', taskId);
  if (task.status !== 'PENDING') throw conflict(`Task is already completed with status: ${task.status}`);

  const instance = task.instance;
  if (instance.status !== 'IN_PROGRESS') {
    throw conflict(`Workflow instance is no longer active (status: ${instance.status})`);
  }

  // 1. Authorization check: actor must match assigned user OR hold assigned role
  let isAuthorized = false;
  if (task.assignedUserId && task.assignedUserId === actorUserId) {
    isAuthorized = true;
  }
  if (task.assignedRoleKey && actorRoles.includes(task.assignedRoleKey)) {
    isAuthorized = true;
  }
  if (!isAuthorized) {
    throw forbidden(
      `Not authorized to act on this task. Requires role '${task.assignedRoleKey}' or user assignment.`,
    );
  }

  // 2. Strict Self-Approval Prevention Check:
  // If the definition specifies preventSelfApproval, initiator CANNOT approve their own request!
  if (instance.definition.preventSelfApproval && action === 'APPROVE') {
    assertNotSelfApproval(instance.initiatorUserId, actorUserId);
  }

  const stages: StageDefinition[] = JSON.parse(instance.definition.stages);
  const currentStage = stages[task.stageIndex];
  const now = new Date();
  const history = JSON.parse(instance.history);

  history.push({
    timestamp: now.toISOString(),
    action: `TASK_${action}`,
    actorUserId,
    stageIndex: task.stageIndex,
    stageTitle: task.title,
    comments: comments ?? null,
  });

  if (action === 'REJECT') {
    // Complete task as REJECTED and fail workflow instance
    await prisma.workflowTask.update({
      where: { id: task.id },
      data: {
        status: 'REJECTED',
        completedById: actorUserId,
        completedAt: now,
        decision: 'REJECTED',
        comments,
      },
    });

    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        status: 'REJECTED',
        history: JSON.stringify(history),
      },
    });

    return { status: 'REJECTED', taskCompleted: true };
  }

  if (action === 'RETURN') {
    if (currentStage && currentStage.canReturn === false) {
      throw validation('Return for edit is disabled for this workflow stage');
    }

    await prisma.workflowTask.update({
      where: { id: task.id },
      data: {
        status: 'REJECTED',
        completedById: actorUserId,
        completedAt: now,
        decision: 'RETURNED_FOR_EDIT',
        comments,
      },
    });

    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        status: 'RETURNED_FOR_EDIT',
        history: JSON.stringify(history),
      },
    });

    // Create edit task for original initiator
    await prisma.workflowTask.create({
      data: {
        instanceId: instance.id,
        title: 'Correction Required',
        description: `Your submission was returned for edit: ${comments || 'No comment provided'}`,
        targetType: instance.targetType,
        targetId: instance.targetId,
        stageIndex: task.stageIndex,
        assignedUserId: instance.initiatorUserId,
        status: 'PENDING',
        deepLink: task.deepLink,
      },
    });

    return { status: 'RETURNED_FOR_EDIT', taskCompleted: true };
  }

  // Action == APPROVE
  await prisma.workflowTask.update({
    where: { id: task.id },
    data: {
      status: 'COMPLETED',
      completedById: actorUserId,
      completedAt: now,
      decision: 'APPROVED',
      comments,
    },
  });

  const nextStageIndex = task.stageIndex + 1;
  if (nextStageIndex < stages.length) {
    const nextStage = stages[nextStageIndex];
    const dueDate = nextStage.dueHours
      ? new Date(Date.now() + nextStage.dueHours * 3600 * 1000)
      : null;

    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        currentStageIndex: nextStageIndex,
        history: JSON.stringify(history),
      },
    });

    await prisma.workflowTask.create({
      data: {
        instanceId: instance.id,
        title: nextStage.title,
        description: `Pending approval at stage: ${nextStage.title}`,
        targetType: instance.targetType,
        targetId: instance.targetId,
        stageIndex: nextStageIndex,
        assignedRoleKey: nextStage.assignedRoleKey ?? null,
        assignedUserId: nextStage.assignedUserId ?? null,
        dueDate,
        status: 'PENDING',
        deepLink: task.deepLink,
      },
    });

    return { status: 'IN_PROGRESS', nextStageIndex, taskCompleted: true };
  } else {
    // All stages complete -> APPROVED
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        status: 'APPROVED',
        history: JSON.stringify(history),
      },
    });

    return { status: 'APPROVED', completed: true, taskCompleted: true };
  }
}

export async function delegateWorkflowTask(
  prisma: PrismaClient,
  taskId: string,
  actorUserId: string,
  actorRoles: string[],
  delegateUserId: string,
  notes?: string,
) {
  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    include: {
      instance: {
        include: { definition: true },
      },
    },
  });

  if (!task) throw notFound('WorkflowTask', taskId);
  if (task.status !== 'PENDING') throw conflict(`Task is already completed with status: ${task.status}`);

  const delegateUser = await prisma.user.findUnique({ where: { id: delegateUserId } });
  if (!delegateUser) throw notFound('User', delegateUserId);

  let isAuthorized = false;
  if (task.assignedUserId && task.assignedUserId === actorUserId) isAuthorized = true;
  if (task.assignedRoleKey && actorRoles.includes(task.assignedRoleKey)) isAuthorized = true;
  if (actorRoles.includes('managing_partner') || actorRoles.includes('head_of_hr')) isAuthorized = true;
  if (!isAuthorized) {
    throw forbidden('Not authorized to delegate this approval task.');
  }

  const now = new Date();
  const history = JSON.parse(task.instance.history || '[]');
  history.push({
    timestamp: now.toISOString(),
    action: 'TASK_DELEGATED',
    actorUserId,
    stageIndex: task.stageIndex,
    stageTitle: task.title,
    delegatedToUserId: delegateUserId,
    comments: notes || null,
  });

  const updatedTask = await prisma.workflowTask.update({
    where: { id: task.id },
    data: {
      assignedUserId: delegateUserId,
      description: `Delegated to ${delegateUser.name || delegateUser.email}: ${notes || 'Reassigned by approver'}`,
    },
  });

  await prisma.workflowInstance.update({
    where: { id: task.instanceId },
    data: { history: JSON.stringify(history) },
  });

  return { status: 'DELEGATED', task: updatedTask, delegateUserId };
}
