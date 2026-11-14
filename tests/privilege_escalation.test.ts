import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Privilege Escalation & Segregation of Duties Prevention', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('prevents an administrator from assigning roles to themselves (self-privilege-grant)', async () => {
    const { agent, user, csrfToken } = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');

    // ICT admin attempts to assign managing_partner role to themselves
    const res = await agent
      .post(`/api/v1/users/${user.id}/roles`)
      .set('x-csrf-token', csrfToken)
      .send({ roleKey: 'managing_partner' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Privilege escalation blocked: users cannot assign or modify their own roles');
  });

  it('prevents an administrator from deactivating their own account', async () => {
    const { agent, user, csrfToken } = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const res = await agent
      .patch(`/api/v1/users/${user.id}/deactivate`)
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('users cannot deactivate their own account');
  });

  it('enforces Maker-Checker: author CANNOT approve their own configuration proposal', async () => {
    // 1. Operations Director (who has config.approve permission) drafts and submits a configuration proposal
    const ops = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');

    const draftRes = await ops.agent
      .post('/api/v1/configuration')
      .set('x-csrf-token', ops.csrfToken)
      .send({
        code: 'PROBATION_PERIOD',
        title: 'Probation Period Policy',
        layer: 'ORGANISATION',
        values: { standardProbationMonths: 6, maxExtensionMonths: 3 },
        sourceReference: 'Performance Management Policy §6.3',
        owner: 'HR Department',
        effectiveFrom: new Date().toISOString(),
      });

    expect(draftRes.status).toBe(200);
    const configId = draftRes.body.data.id;

    // Submit proposal
    const submitRes = await ops.agent
      .post(`/api/v1/configuration/${configId}/submit`)
      .set('x-csrf-token', ops.csrfToken);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');

    // 2. Author (Operations Director) attempts to APPROVE their own submission -> MUST BE BLOCKED BY MAKER-CHECKER!
    const selfApproveRes = await ops.agent
      .post(`/api/v1/configuration/${configId}/approve`)
      .set('x-csrf-token', ops.csrfToken);

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.message).toContain('Maker-Checker violation');

    // 3. Independent checker (Managing Partner) approves -> SUCCEEDS!
    const mp = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const validApproveRes = await mp.agent
      .post(`/api/v1/configuration/${configId}/approve`)
      .set('x-csrf-token', mp.csrfToken);

    expect(validApproveRes.status).toBe(200);
    expect(validApproveRes.body.data.status).toBe('ACTIVE');
    expect(validApproveRes.body.data.approvedById).toBe(mp.user.id);
  });

  it('enforces workflow self-approval prevention: initiator cannot approve their own task', async () => {
    // 1. HR Lead starts a workflow instance
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const startRes = await hr.agent
      .post('/api/v1/workflows/start')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        definitionCode: 'CONFIG_APPROVAL',
        targetType: 'PolicyConfiguration',
        targetId: 'dummy-target-id',
      });

    expect(startRes.status).toBe(200);
    const taskId = startRes.body.data.task.id;

    // 2. HR Lead is in head_of_hr role (which matches stage 1 assignedRoleKey),
    // but because HR Lead initiated the workflow, self-approval MUST BE BLOCKED!
    const selfApproveRes = await hr.agent
      .post(`/api/v1/tasks/${taskId}/action`)
      .set('x-csrf-token', hr.csrfToken)
      .send({ action: 'APPROVE', comments: 'Attempting to self-approve' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.message).toContain('Self-approval blocked: workflow initiator cannot approve their own request');
  });
});
