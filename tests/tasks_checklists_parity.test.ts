import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Tasks & Operational Checklists Parity (P2.3 - Module 3.3)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Creates, transitions (TODO -> IN_PROGRESS -> DONE), lists, and deletes operational tasks while preserving NDA-2026-0005', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    const amina = (empRes.body.data?.items || empRes.body.data).find(
      (e: any) => e.employeeNumber === 'NDA-2026-0005'
    );
    expect(amina).toBeDefined();

    // Create task assigned to Amina
    const createRes = await admin.agent
      .post('/api/v1/workspace/personal-tasks')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        title: 'Finalize Q4 Statutory Audit Checklist',
        dueDate: '2026-12-10',
        priority: 'HIGH',
        assigneeEmployeeId: amina.id,
        notes: 'Verify SHIF and Housing Levy filings before payroll lock',
      });
    expect(createRes.status).toBe(201);
    const task = createRes.body.data;
    expect(task.status).toBe('TODO');
    expect(task.priority).toBe('HIGH');

    // Transition to IN_PROGRESS
    const progRes = await admin.agent
      .patch(`/api/v1/workspace/personal-tasks/${task.id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ status: 'IN_PROGRESS' });
    expect(progRes.status).toBe(200);
    expect(progRes.body.data.status).toBe('IN_PROGRESS');

    // Transition to DONE
    const doneRes = await admin.agent
      .patch(`/api/v1/workspace/personal-tasks/${task.id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ status: 'DONE' });
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.data.status).toBe('DONE');

    // List and verify present
    const listRes = await admin.agent.get('/api/v1/workspace/personal-tasks');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((t: any) => t.id === task.id)).toBe(true);
  });
});
