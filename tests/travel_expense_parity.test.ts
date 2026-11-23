import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Travel & Expense Management Parity (P2.2 - Module 3.2)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Creates billable travel request, logs linked travel expense, approves and reimburses', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    // Verify NDA-2026-0005 preserved
    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    const amina = (empRes.body.data?.items || empRes.body.data).find(
      (e: any) => e.employeeNumber === 'NDA-2026-0005'
    );
    expect(amina).toBeDefined();

    // 1. Create Travel Request
    const trRes = await admin.agent
      .post('/api/v1/workspace/travel-requests')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        employeeId: amina.id,
        destination: 'Mombasa Port Authority HQ',
        purpose: 'Q4 Statutory & Governance Advisory Audit',
        departureDate: '2026-12-02',
        returnDate: '2026-12-04',
        transportMode: 'FLIGHT',
        perDiemDays: 3,
        estimatedBudgetKes: 54000,
        advanceRequestedKes: 20000,
        billableToClient: true,
        clientName: 'Kenya Ports Advisory',
      });
    expect(trRes.status).toBe(201);
    const tr = trRes.body.data;
    expect(tr.billableToClient).toBe(true);
    expect(tr.advanceRequestedKes).toBe(20000);

    // 2. Approve Travel Request
    const appTr = await admin.agent
      .patch(`/api/v1/workspace/travel-requests/${tr.id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ status: 'APPROVED' });
    expect(appTr.status).toBe(200);
    expect(appTr.body.data.status).toBe('APPROVED');

    // 3. Log Linked Travel Expense
    const expRes = await admin.agent
      .post('/api/v1/workspace/travel-expenses')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        employeeId: amina.id,
        travelRequestId: tr.id,
        category: 'HOTEL',
        expenseDate: '2026-12-03',
        amountKes: 28500,
        billableToClient: true,
        clientName: 'Kenya Ports Advisory',
        receiptRef: 'KRA-ETR-2026-88412',
        notes: '2 nights hotel accommodation Mombasa',
      });
    expect(expRes.status).toBe(201);
    const exp = expRes.body.data;
    expect(exp.amountKes).toBe(28500);
    expect(exp.status).toBe('SUBMITTED');

    // 4. Approve then Reimburse Expense
    const appExp = await admin.agent
      .patch(`/api/v1/workspace/travel-expenses/${exp.id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ status: 'APPROVED' });
    expect(appExp.status).toBe(200);

    const reimbExp = await admin.agent
      .patch(`/api/v1/workspace/travel-expenses/${exp.id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ status: 'REIMBURSED' });
    expect(reimbExp.status).toBe(200);
    expect(reimbExp.body.data.status).toBe('REIMBURSED');

    // 5. Verify GET ledger returns the expense
    const listExp = await admin.agent.get('/api/v1/workspace/travel-expenses');
    expect(listExp.status).toBe(200);
    expect(listExp.body.data.items.some((e: any) => e.id === exp.id)).toBe(true);
  });
});
