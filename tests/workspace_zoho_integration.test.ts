import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, getApp, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Module 21: Workspace & Zoho UX Persistence API Suite', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('persists live Web Check-In / Check-Out attendance timer sessions', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const clockInRes = await emp.agent
      .post('/api/v1/workspace/attendance/clock-in')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ notes: 'Morning shift check-in' });
    expect(clockInRes.status).toBe(200);
    expect(clockInRes.body.data.punch.clockOutAt).toBeNull();

    const statusRes = await emp.agent.get('/api/v1/workspace/attendance');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.checkedIn).toBe(true);

    const clockOutRes = await emp.agent
      .post('/api/v1/workspace/attendance/clock-out')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ notes: 'Shift end' });
    expect(clockOutRes.status).toBe(200);
    expect(clockOutRes.body.data.punch.clockOutAt).not.toBeNull();
    expect(clockOutRes.body.data.punch.totalSecs).toBeGreaterThanOrEqual(1);
  });

  it('creates and filters Workspace Feeds posts', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const postRes = await hr.agent
      .post('/api/v1/workspace/feeds')
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ category: 'ANNOUNCEMENT', message: 'Q4 Compliance townhall starts Friday' });
    expect(postRes.status).toBe(201);

    const listRes = await hr.agent.get('/api/v1/workspace/feeds?category=ANNOUNCEMENT&search=Compliance');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((f: any) => f.message.includes('Compliance'))).toBe(true);
  });

  it('manages Approval Delegations & Custom Column Views with RBAC enforcement', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const otherEmp = await loginClient(app, 'employee.two@ndakalaadvisory.co.ke');

    const delRes = await emp.agent
      .post('/api/v1/workspace/delegations')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({
        delegateName: 'Amina Hassan',
        startDate: '2026-11-15',
        endDate: '2026-11-22',
        delegationType: 'TEMPORARY',
        notifyDelegator: true,
      });
    expect(delRes.status).toBe(201);
    const delId = delRes.body.data.id;

    const forbiddenRevoke = await otherEmp.agent
      .delete(`/api/v1/workspace/delegations/${delId}`)
      .set('X-CSRF-Token', otherEmp.csrfToken);
    expect(forbiddenRevoke.status).toBe(403);

    const revokeRes = await emp.agent
      .delete(`/api/v1/workspace/delegations/${delId}`)
      .set('X-CSRF-Token', emp.csrfToken);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.isActive).toBe(false);

    // Custom Column View
    const viewRes = await emp.agent
      .post('/api/v1/workspace/custom-views')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({
        module: 'DIRECTORY',
        name: 'Audit Columns View',
        columns: ['employeeNumber', 'fullName', 'department', 'status'],
        viewPermission: 'ONLY_ME',
      });
    expect(viewRes.status).toBe(201);

    const listViews = await emp.agent.get('/api/v1/workspace/custom-views?module=DIRECTORY');
    expect(listViews.status).toBe(200);
    expect(listViews.body.data.items.some((v: any) => v.name === 'Audit Columns View')).toBe(true);
  });

  it('persists Zoho UI Configuration (USER vs ORG RBAC) and HR Address Proof letters', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    // Employee can save personal dashboard widget preferences
    const userCfg = await emp.agent
      .put('/api/v1/workspace/ui-config')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ key: 'WIDGETS', scope: 'USER', value: { welcome: true, holidays: false } });
    expect(userCfg.status).toBe(200);

    // Employee cannot overwrite ORG wizard configuration
    const blockedOrgCfg = await emp.agent
      .put('/api/v1/workspace/ui-config')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ key: 'PAYROLL_WIZARD', scope: 'ORG', value: { defaultCurrency: 'KES' } });
    expect(blockedOrgCfg.status).toBe(403);

    // HR Manager can persist ORG wizard config
    const okOrgCfg = await hr.agent
      .put('/api/v1/workspace/ui-config')
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ key: 'PAYROLL_WIZARD', scope: 'ORG', value: { defaultCurrency: 'KES', step: 3 } });
    expect(okOrgCfg.status).toBe(200);

    // HR Letter Address Proof flow: Save Draft -> Submit -> HR Approve
    const draftRes = await emp.agent
      .post('/api/v1/hr-letters/address-proof')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({
        reason: 'Bank Account Opening',
        changeInAddress: false,
        status: 'DRAFT',
      });
    expect(draftRes.status).toBe(201);
    const letterId = draftRes.body.data.id;

    // Employee cannot approve their own HR letter
    const selfApprove = await emp.agent
      .patch(`/api/v1/hr-letters/address-proof/${letterId}`)
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ status: 'APPROVED' });
    expect(selfApprove.status).toBe(403);

    // Employee submits draft, HR approves
    const submitRes = await emp.agent
      .patch(`/api/v1/hr-letters/address-proof/${letterId}`)
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ status: 'SUBMITTED' });
    expect(submitRes.status).toBe(200);

    const approveRes = await hr.agent
      .patch(`/api/v1/hr-letters/address-proof/${letterId}`)
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');
  });

  it('supports POST & PUT ui-config for all 11 workspace keys and returns { configs } map', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const keysToTest: Array<{ key: string; scope: 'ORG' | 'USER'; value: Record<string, any> }> = [
      { key: 'WIDGETS', scope: 'USER', value: { birthday: true, newhires: true } },
      { key: 'PAYROLL_WIZARD', scope: 'ORG', value: { enabled: true, homeCurrency: 'KES' } },
      { key: 'PERF_SETTINGS', scope: 'ORG', value: { continuousEnabled: true } },
      { key: 'OPERATIONS_MODULES', scope: 'ORG', value: { shifts: true, travel: true } },
      { key: 'ORG_POLICY_TOGGLES', scope: 'ORG', value: { allowProfileEdit: true } },
      { key: 'EMAIL_FROM_ADDRESSES', scope: 'ORG', value: { items: [{ id: 'e-1', address: 'hr@ndakalaadvisory.co.ke', displayName: 'Ndakala HR', verified: true }] } },
      { key: 'ORG_LOGO_LABEL', scope: 'ORG', value: { text: 'Ndakala People' } },
      { key: 'SETUP_WIZARD', scope: 'ORG', value: { completedSteps: ['org', 'holidays'] } },
      { key: 'CANDIDATE_DRAFT', scope: 'USER', value: { firstName: 'Amina', lastName: 'Hassan' } },
      { key: 'WORKSPACE_FAVORITES', scope: 'USER', value: { ids: ['emp-1'] } },
      { key: 'HOME_TOUR_SEEN', scope: 'USER', value: { seen: true, lastStep: 4 } },
    ];

    for (let i = 0; i < keysToTest.length; i++) {
      const entry = keysToTest[i];
      const req = i % 2 === 0
        ? hr.agent.post('/api/v1/workspace/ui-config')
        : hr.agent.put('/api/v1/workspace/ui-config');
      const res = await req.set('X-CSRF-Token', hr.csrfToken).send(entry);
      expect(res.status).toBe(200);
    }

    const allGetRes = await hr.agent.get('/api/v1/workspace/ui-config');
    expect(allGetRes.status).toBe(200);
    for (const entry of keysToTest) {
      expect(allGetRes.body.data.configs[entry.key]).toBeDefined();
    }
    expect(allGetRes.body.data.configs.EMAIL_FROM_ADDRESSES.items[0].address).toBe('hr@ndakalaadvisory.co.ke');
  });

  it('manages Work Shifts, Business Travel lifecycle + reimbursement, Pulse Surveys, and Personal Action Tasks with Zod, RBAC & Audit Logs', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const emp2 = await loginClient(app, 'employee.two@ndakalaadvisory.co.ke');
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    // 1. Shifts (HR-only mutations + Zod check + edit timings & employee assignment)
    const blockedShift = await emp.agent
      .post('/api/v1/workspace/shifts')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ name: 'Unauthorized Shift', startTime: '09:00', endTime: '18:00' });
    expect(blockedShift.status).toBe(403);

    const badShift = await hr.agent
      .post('/api/v1/workspace/shifts')
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ name: 'A', startTime: '09:00', endTime: '18:00' });
    expect(badShift.status).toBeGreaterThanOrEqual(400);

    const createdShift = await hr.agent
      .post('/api/v1/workspace/shifts')
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ name: 'Audit Late Shift', startTime: '10:00', endTime: '19:00', department: 'IT' });
    expect(createdShift.status).toBe(201);
    const shiftId = createdShift.body.data.id;

    const patchShift = await hr.agent
      .patch(`/api/v1/workspace/shifts/${shiftId}`)
      .set('X-CSRF-Token', hr.csrfToken)
      .send({
        startTime: '09:30',
        endTime: '18:30',
        breakMinutes: 45,
        assignedEmployeeIds: ['emp-test-1'],
        isActive: false,
      });
    expect(patchShift.status).toBe(200);
    expect(patchShift.body.data.isActive).toBe(false);
    expect(patchShift.body.data.startTime).toBe('09:30');
    expect(patchShift.body.data.assignedEmployeeIds).toContain('emp-test-1');

    const delShift = await hr.agent
      .delete(`/api/v1/workspace/shifts/${shiftId}`)
      .set('X-CSRF-Token', hr.csrfToken);
    expect(delShift.status).toBe(200);

    // 2. Travel Requests (Employee creates, cannot self-approve, cannot jump to REIMBURSED before APPROVED)
    const badTravel = await emp.agent
      .post('/api/v1/workspace/travel-requests')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ destination: 'X', purpose: 'bad', departureDate: '2026-11-24', returnDate: '2026-11-26' });
    expect(badTravel.status).toBeGreaterThanOrEqual(400);

    const trRes = await emp.agent
      .post('/api/v1/workspace/travel-requests')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({
        destination: 'Mombasa Port',
        purpose: 'Client cyber audit field visit',
        departureDate: '2026-11-24',
        returnDate: '2026-11-26',
        transportMode: 'FLIGHT',
        perDiemDays: 3,
        estimatedBudgetKes: 65000,
      });
    expect(trRes.status).toBe(201);
    const travelId = trRes.body.data.id;

    const selfTravelApprove = await emp.agent
      .patch(`/api/v1/workspace/travel-requests/${travelId}`)
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ status: 'APPROVED' });
    expect(selfTravelApprove.status).toBe(403);

    const prematureReimburse = await hr.agent
      .patch(`/api/v1/workspace/travel-requests/${travelId}`)
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ status: 'REIMBURSED', reimbursementAmountKes: 65000 });
    expect(prematureReimburse.status).toBeGreaterThanOrEqual(400);

    const hrTravelApprove = await hr.agent
      .patch(`/api/v1/workspace/travel-requests/${travelId}`)
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ status: 'APPROVED', approverComment: 'Approved within client engagement budget' });
    expect(hrTravelApprove.status).toBe(200);
    expect(hrTravelApprove.body.data.status).toBe('APPROVED');

    const hrTravelReimburse = await hr.agent
      .patch(`/api/v1/workspace/travel-requests/${travelId}`)
      .set('X-CSRF-Token', hr.csrfToken)
      .send({ status: 'REIMBURSED', reimbursementAmountKes: 64200 });
    expect(hrTravelReimburse.status).toBe(200);
    expect(hrTravelReimburse.body.data.status).toBe('REIMBURSED');
    expect(hrTravelReimburse.body.data.reimbursementAmountKes).toBe(64200);

    // 3. Employee Engagement Surveys (duplicate prevention + live aggregation)
    const srvRes = await hr.agent
      .post('/api/v1/workspace/surveys')
      .set('X-CSRF-Token', hr.csrfToken)
      .send({
        title: 'Q4 Hybrid Work Pulse',
        description: 'Share feedback on remote collaboration and IT tooling',
        closingDate: '2026-12-20',
        anonymous: true,
      });
    expect(srvRes.status).toBe(201);
    const surveyId = srvRes.body.data.id;

    const respondRes = await emp.agent
      .post(`/api/v1/workspace/surveys/${surveyId}/respond`)
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ overallRating: 5, comment: 'Great async collaboration tools!' });
    expect(respondRes.status).toBe(200);

    const duplicateRespond = await emp.agent
      .post(`/api/v1/workspace/surveys/${surveyId}/respond`)
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ overallRating: 4, comment: 'Duplicate attempt' });
    expect(duplicateRespond.status).toBeGreaterThanOrEqual(400);

    const listSrv = await emp.agent.get('/api/v1/workspace/surveys');
    const matchedSrv = listSrv.body.data.items.find((s: any) => s.id === surveyId);
    expect(matchedSrv.avgRating).toBe(5);
    expect(matchedSrv.responseCount).toBe(1);
    expect(matchedSrv.hasResponded).toBe(true);

    // 4. Personal Action Tasks + full field edit + cross-employee RBAC
    const taskRes = await emp.agent
      .post('/api/v1/workspace/personal-tasks')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ title: 'Prepare ISO 27001 evidence folder', dueDate: '2026-11-28', priority: 'HIGH' });
    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data.id;

    const forbiddenTaskDel = await emp2.agent
      .delete(`/api/v1/workspace/personal-tasks/${taskId}`)
      .set('X-CSRF-Token', emp2.csrfToken);
    expect(forbiddenTaskDel.status).toBe(403);

    const patchTask = await emp.agent
      .patch(`/api/v1/workspace/personal-tasks/${taskId}`)
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ status: 'DONE', priority: 'LOW', dueDate: '2026-12-05', notes: 'Completed evidence pack' });
    expect(patchTask.status).toBe(200);
    expect(patchTask.body.data.status).toBe('DONE');
    expect(patchTask.body.data.priority).toBe('LOW');
    expect(patchTask.body.data.dueDate).toBe('2026-12-05');

    const delTask = await emp.agent
      .delete(`/api/v1/workspace/personal-tasks/${taskId}`)
      .set('X-CSRF-Token', emp.csrfToken);
    expect(delTask.status).toBe(200);

    // Verify audit events logged cleanly
    const auditCheck = await prisma.auditLog.findMany({
      where: {
        action: { in: ['WORKSPACE_UI_CONFIG_SAVED', 'WORKSPACE_SHIFT_CREATED', 'TRAVEL_REQUEST_REIMBURSED', 'ENGAGEMENT_SURVEY_RESPONDED', 'WORKSPACE_TASK_UPDATED'] },
      },
    });
    expect(auditCheck.length).toBeGreaterThanOrEqual(5);
  });
});
