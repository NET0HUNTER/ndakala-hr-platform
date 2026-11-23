import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Home Hub Multi-Space & Interactive Org Chart Parity (#home)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Employee reporting hierarchy is properly structured with manager relations', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const res = await admin.agent.get('/api/v1/employees');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Verify root leader (e.g. Managing Partner) has no manager or is self
    const root = res.body.data.find((e: any) => !e.managerId);
    expect(root).toBeDefined();

    // Verify subordinates have valid managerId matching an active employee
    const subordinates = res.body.data.filter((e: any) => e.managerId);
    expect(subordinates.length).toBeGreaterThan(0);
    for (const sub of subordinates) {
      const managerExists = res.body.data.some((m: any) => m.id === sub.managerId);
      expect(managerExists).toBe(true);
    }
  });

  it('Scenario 2: Firm announcements can be published and retrieved across workspaces', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    // 1. Post announcement
    const postRes = await admin.agent
      .post('/api/v1/workspace/feeds')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        category: 'ANNOUNCEMENT',
        message: 'Zoho People Parity: Q4 All-Hands Advisory Strategy Session scheduled.',
      });

    expect(postRes.status).toBe(200);
    expect(postRes.body.data).toBeDefined();

    // 2. Query feeds as employee
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const getRes = await emp.agent.get('/api/v1/workspace/feeds');

    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.data.items)).toBe(true);
    const found = getRes.body.data.items.some(
      (f: any) => f.message.includes('Q4 All-Hands Advisory Strategy Session')
    );
    expect(found).toBe(true);
  });

  it('Scenario 3: Organization details and structure metadata are accessible', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const orgRes = await emp.agent.get('/api/v1/organisation');

    expect(orgRes.status).toBe(200);
    expect(orgRes.body.data).toBeDefined();
    expect(orgRes.body.data.legalName).toBeDefined();
    expect(orgRes.body.data.departments).toBeDefined();
    expect(Array.isArray(orgRes.body.data.departments)).toBe(true);
  });

  it('Scenario 4: Departments and positions provide full hierarchy context', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const deptsRes = await emp.agent.get('/api/v1/departments');
    expect(deptsRes.status).toBe(200);
    expect(Array.isArray(deptsRes.body.data)).toBe(true);

    const positionsRes = await emp.agent.get('/api/v1/positions');
    expect(positionsRes.status).toBe(200);
    expect(Array.isArray(positionsRes.body.data)).toBe(true);
  });
});
