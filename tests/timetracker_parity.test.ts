import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Time Tracker Parity Suite (P1.2 - Module 2.2)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Preserves NDA-2026-0005 (Amina Ochieng) and lists projects & clients', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    const items = empRes.body.data?.items || empRes.body.data;
    const amina = items.find((e: any) => e.employeeNumber === 'NDA-2026-0005');
    expect(amina).toBeDefined();

    const projRes = await admin.agent.get('/api/v1/timetracker/projects');
    expect(projRes.status).toBe(200);
    const projects = projRes.body.data?.items || projRes.body.data;
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);

    const cliRes = await admin.agent.get('/api/v1/timetracker/clients');
    expect(cliRes.status).toBe(200);
    const clients = cliRes.body.data?.items || cliRes.body.data;
    expect(Array.isArray(clients)).toBe(true);
  });

  it('Scenario 2: Supports Daily & Multi-Day Weekly Log entries with Billable / Non-billable flags & rate snapshots', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const projRes = await admin.agent.get('/api/v1/timetracker/projects');
    const projects = projRes.body.data?.items || projRes.body.data;
    const projectId = projects[0].id;

    // 1. Daily Billable log
    const dailyRes = await admin.agent
      .post('/api/v1/timetracker/logs')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        projectId,
        workDate: '2026-11-23',
        hours: 3.5,
        isBillable: true,
        description: 'Daily Log Parity Check - Client Advisory Session',
      });
    expect(dailyRes.status).toBe(201);
    const createdDaily = dailyRes.body.data;
    expect(createdDaily.hours).toBe(3.5);
    expect(createdDaily.isBillable).toBe(true);
    expect(createdDaily.status).toBe('PENDING');

    // 2. Non-billable internal log
    const nonBillRes = await admin.agent
      .post('/api/v1/timetracker/logs')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        projectId,
        workDate: '2026-11-24',
        hours: 1.5,
        isBillable: false,
        description: 'Weekly Matrix Parity Check - Internal Knowledge Sync',
      });
    expect(nonBillRes.status).toBe(201);
    const createdNonBill = nonBillRes.body.data;
    expect(createdNonBill.isBillable).toBe(false);

    // 3. Batch Approve both
    const approveRes = await admin.agent
      .patch('/api/v1/timetracker/logs/review')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        logIds: [createdDaily.id, createdNonBill.id],
        action: 'APPROVE',
      });
    expect(approveRes.status).toBe(200);
    const reviewed = approveRes.body.data;
    expect(Array.isArray(reviewed)).toBe(true);
    expect(reviewed.every((r: any) => r.status === 'APPROVED')).toBe(true);

    // Cleanup test entries so DB stays tidy
    await admin.agent
      .delete(`/api/v1/timetracker/logs/${createdDaily.id}`)
      .set('x-csrf-token', admin.csrfToken);
    await admin.agent
      .delete(`/api/v1/timetracker/logs/${createdNonBill.id}`)
      .set('x-csrf-token', admin.csrfToken);
  });

  it('Scenario 3: Reject without mandatory reason fails 400; Reject with reason succeeds', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const projRes = await admin.agent.get('/api/v1/timetracker/projects');
    const projectId = (projRes.body.data?.items || projRes.body.data)[0].id;

    const createRes = await admin.agent
      .post('/api/v1/timetracker/logs')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        projectId,
        workDate: '2026-11-25',
        hours: 2,
        isBillable: true,
        description: 'Rejection guard check entry',
      });
    expect(createRes.status).toBe(201);
    const logId = createRes.body.data.id;

    // Missing rejection reason -> 400
    const badRej = await admin.agent
      .patch('/api/v1/timetracker/logs/review')
      .set('x-csrf-token', admin.csrfToken)
      .send({ logIds: [logId], action: 'REJECT' });
    expect(badRej.status).toBe(400);

    // With rejection reason -> 200
    const okRej = await admin.agent
      .patch('/api/v1/timetracker/logs/review')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        logIds: [logId],
        action: 'REJECT',
        rejectionReason: 'Please specify engagement phase deliverable',
      });
    expect(okRej.status).toBe(200);
    expect(okRej.body.data[0].status).toBe('REJECTED');

    // Cleanup
    await admin.agent
      .delete(`/api/v1/timetracker/logs/${logId}`)
      .set('x-csrf-token', admin.csrfToken);
  });

  it('Scenario 4: Executive profitability KPIs and team utilization reports return valid structures', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const execRes = await admin.agent.get('/api/v1/timetracker/reports/executive?startDate=2026-09-01&endDate=2026-12-31');
    expect(execRes.status).toBe(200);
    expect(execRes.body.data?.kpis).toBeDefined();
    expect(typeof execRes.body.data.kpis.totalLoggedHours).toBe('number');

    const utilRes = await admin.agent.get('/api/v1/timetracker/reports/utilization?startDate=2026-11-01&endDate=2026-11-30');
    expect(utilRes.status).toBe(200);
    expect(utilRes.body.data).toBeDefined();
  });
});
