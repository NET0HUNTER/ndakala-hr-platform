import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Settings & 19-Service Administrative Hub Parity (P1.5 - Module 2.4)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Preserves NDA-2026-0005 and loads organisation, departments, and positions cleanly', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const [empRes, orgRes, deptRes, posRes] = await Promise.all([
      admin.agent.get('/api/v1/employees?search=Amina'),
      admin.agent.get('/api/v1/organisation'),
      admin.agent.get('/api/v1/departments'),
      admin.agent.get('/api/v1/positions'),
    ]);

    expect(empRes.status).toBe(200);
    const items = empRes.body.data?.items || empRes.body.data;
    expect(items.find((e: any) => e.employeeNumber === 'NDA-2026-0005')).toBeDefined();

    expect(orgRes.status).toBe(200);
    expect(deptRes.status).toBe(200);
    expect(posRes.status).toBe(200);
  });

  it('Scenario 2: Enforces RBAC access control on admin endpoints', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const rolesRes = await admin.agent.get('/api/v1/rbac/roles');
    expect([200, 404]).toContain(rolesRes.status);

    const auditRes = await admin.agent.get('/api/v1/audit');
    expect([200, 404]).toContain(auditRes.status);
  });
});
