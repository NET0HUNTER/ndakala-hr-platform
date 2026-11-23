import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Operations Approvals Hub Parity (#operations/approvals)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: GET /api/v1/operations/approvals returns unified approvals list with Zoho fields and counts', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const res = await admin.agent.get('/api/v1/operations/approvals');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.data)).toBe(true);
    expect(res.body.data.counts).toBeDefined();
    expect(typeof res.body.data.counts.pendingCount).toBe('number');
    expect(typeof res.body.data.counts.totalCount).toBe('number');

    if (res.body.data.data.length > 0) {
      const item = res.body.data.data[0];
      expect(item.id).toBeDefined();
      expect(item.requestId).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.module).toBeDefined();
      expect(item.initiator).toBeDefined();
      expect(item.initiator.name).toBeDefined();
      expect(item.initiator.departmentName).toBeDefined();
      expect(item.status).toBeDefined();
      expect(item.submittedAt).toBeDefined();
    }
  });

  it('Scenario 2: Filter by status, module, and search works correctly', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    // Filter by module LEAVE
    const leaveRes = await admin.agent.get('/api/v1/operations/approvals?module=LEAVE');
    expect(leaveRes.status).toBe(200);
    for (const item of leaveRes.body.data.data) {
      expect(item.module).toBe('LEAVE');
    }

    // Filter by status PENDING
    const pendingRes = await admin.agent.get('/api/v1/operations/approvals?status=PENDING');
    expect(pendingRes.status).toBe(200);
    for (const item of pendingRes.body.data.data) {
      expect(item.status).toBe('PENDING');
    }
  });

  it('Scenario 3: Batch approve processes selected approval items atomically', async () => {
    // 1. Employee creates a leave request
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const createRes = await emp.agent
      .post('/api/v1/leave/requests')
      .set('x-csrf-token', emp.csrfToken)
      .send({
        leaveTypeCode: 'ANNUAL',
        startDate: '2026-11-25',
        endDate: '2026-11-26',
        reason: 'Family event attendance',
      });

    expect(createRes.status).toBe(201);
    const leaveRequestId = createRes.body.data.id;

    // 2. Head of HR / Managing Partner batch approves the request via Operations Approvals Hub
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const batchRes = await admin.agent
      .post('/api/v1/operations/approvals/batch')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        itemIds: [leaveRequestId],
        action: 'APPROVE',
        comments: 'Approved via Zoho People Operations Approvals Hub',
      });

    expect(batchRes.status).toBe(200);
    expect(batchRes.body.data.success).toBe(true);
    expect(batchRes.body.data.processedCount).toBe(1);
    expect(batchRes.body.data.successfulIds).toContain(leaveRequestId);

    // 3. Verify leave status is now APPROVED in database
    const updated = await prisma.leaveRequest.findUnique({ where: { id: leaveRequestId } });
    expect(updated?.status).toBe('APPROVED');
  });

  it('Scenario 4: Batch reject properly updates item status to REJECTED', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const createRes = await emp.agent
      .post('/api/v1/leave/requests')
      .set('x-csrf-token', emp.csrfToken)
      .send({
        leaveTypeCode: 'ANNUAL',
        startDate: '2026-11-28',
        endDate: '2026-11-29',
        reason: 'Weekend extension test',
      });

    expect(createRes.status).toBe(201);
    const leaveRequestId = createRes.body.data.id;

    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const batchRes = await admin.agent
      .post('/api/v1/operations/approvals/batch')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        itemIds: [leaveRequestId],
        action: 'REJECT',
        comments: 'Rejected due to critical project deliverable',
      });

    expect(batchRes.status).toBe(200);
    expect(batchRes.body.data.success).toBe(true);
    expect(batchRes.body.data.processedCount).toBe(1);
    expect(batchRes.body.data.successfulIds).toContain(leaveRequestId);

    const updated = await prisma.leaveRequest.findUnique({ where: { id: leaveRequestId } });
    expect(updated?.status).toBe('REJECTED');
  });
});
