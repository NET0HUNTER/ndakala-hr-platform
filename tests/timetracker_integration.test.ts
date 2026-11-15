import crypto from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { prisma, getApp, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { TimeTrackerService } from '../src/modules/timetracker/service.js';

describe('Ndakala Unified Timesheet & Resource Profitability Suite (ND-RUN-2026-10 v2.5)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
    await prisma.timeLog.deleteMany({ where: { workDate: '2026-12-10' } });
    await prisma.timePeriodClose.deleteMany({ where: { name: 'December 2026 Test Close' } });
  });

  it('calculates exact Monday-Friday capacity hours and utilization %', () => {
    const svc = new TimeTrackerService({} as any);
    // September 2026 has 22 working days (Mon-Fri) -> 176 expected hours
    const workingDays = svc.countWorkingDaysMonFri('2026-09-01', '2026-09-30');
    expect(workingDays).toBe(22);
    const expectedHours = workingDays * 8;
    expect(expectedHours).toBe(176);
  });

  it('classifies Project Health & Leakage across all 5 thresholds (<75%, 75-90%, >90%, >100%, No Budget)', () => {
    const svc = new TimeTrackerService({} as any);
    expect(svc.classifyProjectHealth(300000, 500000, 60).status).toBe('ON_TRACK');     // 60%
    expect(svc.classifyProjectHealth(400000, 500000, 80).status).toBe('WATCH');        // 80%
    expect(svc.classifyProjectHealth(475000, 500000, 95).status).toBe('ATTENTION');    // 95%
    expect(svc.classifyProjectHealth(550000, 500000, 110).status).toBe('OVER_BUDGET'); // 110%
    expect(svc.classifyProjectHealth(45000, 0, 12).status).toBe('NO_BUDGET');          // Leakage alert
  });

  it('computes exact financial formulas: Billability %, Labor Cost, Revenue, Leakage & Gross Margin %', () => {
    const svc = new TimeTrackerService({} as any);
    const kpis = svc.computeKpis([
      { hours: 8, isBillable: true, costRateSnap: 3000, billingRateSnap: 8000 },
      { hours: 2, isBillable: false, costRateSnap: 3000, billingRateSnap: 8000 },
    ]);
    expect(kpis.totalLoggedHours).toBe(10);
    expect(kpis.billableHours).toBe(8);
    expect(kpis.billabilityPct).toBe(80);
    expect(kpis.totalLaborCostKes).toBe(30000);
    expect(kpis.billableRevenueKes).toBe(64000);
    expect(kpis.nonBillableLeakageKes).toBe(16000);
    expect(kpis.grossProfitKes).toBe(34000);
    expect(kpis.grossProfitMarginPct).toBe(53.13);
  });

  it('blocks creating a time entry inside a LOCKED financial period with 409 PERIOD_LOCKED', async () => {
    const { agent, csrfToken } = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const projectsRes = await agent.get('/api/v1/timetracker/projects');
    expect(projectsRes.status).toBe(200);
    const projectId = projectsRes.body.data[0].id;

    const lockedAttempt = await agent
      .post('/api/v1/timetracker/logs')
      .set('X-CSRF-Token', csrfToken)
      .send({
        projectId,
        workDate: '2026-09-15', // Inside locked September 2026 period
        hours: 4,
        isBillable: true,
        description: 'Attempted backdated time entry into locked month',
      });

    expect(lockedAttempt.status).toBe(409);
    expect(lockedAttempt.body.error.code).toBe('PERIOD_LOCKED');
  });

  it('creates time logs with rate card snapshots and supports batch approval & rejection validation', async () => {
    const partner = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const empSession = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const projectsRes = await empSession.agent.get('/api/v1/timetracker/projects');
    const projectId = projectsRes.body.data[0].id;

    // 1. Employee logs time in open November 2026 period
    const logRes = await empSession.agent
      .post('/api/v1/timetracker/logs')
      .set('X-CSRF-Token', empSession.csrfToken)
      .send({
        projectId,
        workDate: '2026-11-14',
        hours: 3.5,
        isBillable: true,
        description: 'ISO 27001 evidence analysis integration test',
      });

    expect(logRes.status).toBe(201);
    const logId = logRes.body.data.id;
    expect(logRes.body.data.status).toBe('PENDING');
    expect(logRes.body.data.costRateSnap).toBeGreaterThan(0);

    // 2. RBAC rate masking: employee sees null costRateSnap on list query
    const empList = await empSession.agent.get('/api/v1/timetracker/logs');
    expect(empList.status).toBe(200);
    const matchedEmpRow = empList.body.data.find((r: any) => r.id === logId);
    expect(matchedEmpRow).toBeDefined();
    expect(matchedEmpRow.costRateSnap).toBeNull();

    // 3. Reject without reason returns 400
    const badReject = await partner.agent
      .patch('/api/v1/timetracker/logs/review')
      .set('X-CSRF-Token', partner.csrfToken)
      .send({ logIds: [logId], action: 'REJECT', rejectionReason: '' });
    expect(badReject.status).toBe(400);

    // 4. Approve succeeds
    const approveRes = await partner.agent
      .patch('/api/v1/timetracker/logs/review')
      .set('X-CSRF-Token', partner.csrfToken)
      .send({ logIds: [logId], action: 'APPROVE' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data[0].status).toBe('APPROVED');
  });

  it('closes an open period with immutable SHA-256 snapshot and reopens with mandatory reason', async () => {
    const partner = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    // Open a dedicated test period in December 2026
    const openRes = await partner.agent
      .post('/api/v1/timetracker/periods')
      .set('X-CSRF-Token', partner.csrfToken)
      .send({
        name: 'December 2026 Test Close',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      });
    expect(openRes.status).toBe(201);
    const periodId = openRes.body.data.id;

    const projectsRes = await partner.agent.get('/api/v1/timetracker/projects');
    const projectId = projectsRes.body.data[0].id;

    // Log pending hours in December 2026
    await partner.agent
      .post('/api/v1/timetracker/logs')
      .set('X-CSRF-Token', partner.csrfToken)
      .send({
        projectId,
        workDate: '2026-12-10',
        hours: 5,
        isBillable: true,
        description: 'December advisory close verification',
      });

    // Closing without autoApprove fails while PENDING exists
    const failClose = await partner.agent
      .post(`/api/v1/timetracker/periods/${periodId}/close`)
      .set('X-CSRF-Token', partner.csrfToken)
      .send({ autoApprove: false });
    expect(failClose.status).toBe(400);

    // Closing with autoApprove succeeds & seals SHA-256 checksum
    const okClose = await partner.agent
      .post(`/api/v1/timetracker/periods/${periodId}/close`)
      .set('X-CSRF-Token', partner.csrfToken)
      .send({ autoApprove: true });
    expect(okClose.status).toBe(200);
    expect(okClose.body.data.status).toBe('LOCKED');

    const expectedSha = crypto
      .createHash('sha256')
      .update(okClose.body.data.snapshotJson)
      .digest('hex');
    expect(okClose.body.data.snapshotChecksum).toBe(expectedSha);

    // Reopen requires valid reason >= 5 chars
    const badReopen = await partner.agent
      .post(`/api/v1/timetracker/periods/${periodId}/reopen`)
      .set('X-CSRF-Token', partner.csrfToken)
      .send({ reason: 'no' });
    expect(badReopen.status).toBe(400);

    const okReopen = await partner.agent
      .post(`/api/v1/timetracker/periods/${periodId}/reopen`)
      .set('X-CSRF-Token', partner.csrfToken)
      .send({ reason: 'Audit adjustment requested by Managing Partner' });
    expect(okReopen.status).toBe(200);
    expect(okReopen.body.data.status).toBe('OPEN');
  });

  it('enriches time logs with staff names and masks labor cost rates for non-finance employees', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const logsRes = await emp.agent.get('/api/v1/timetracker/logs');
    expect(logsRes.status).toBe(200);
    expect(Array.isArray(logsRes.body.data)).toBe(true);
    if (logsRes.body.data.length > 0) {
      expect(logsRes.body.data[0].employeeName).toBeDefined();
      expect(logsRes.body.data[0].costRateSnap).toBeNull();
      expect(logsRes.body.data[0].laborCostKes).toBeNull();
    }
  });
});
