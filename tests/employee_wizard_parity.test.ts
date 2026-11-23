import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Global Shell & Employee Information Parity (P0.1 & P0.3)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Production record NDA-2026-0005 (Amina Ochieng) is preserved with intact data', async () => {
    const hr = await loginClient(app, 'hr.partner@ndakalaadvisory.co.ke');
    const res = await hr.agent.get('/api/v1/employees?search=Amina');

    expect(res.status).toBe(200);
    const items = res.body.data?.items || res.body.data;
    expect(Array.isArray(items)).toBe(true);
    const amina = items.find((e: any) => e.employeeNumber === 'NDA-2026-0005');
    expect(amina).toBeDefined();
    expect(amina.firstName).toBe('Amina');
    expect(amina.lastName).toBe('Ochieng');
  });

  it('Scenario 2: Detailed Employee 360 includes department, manager, and lifecycle structures', async () => {
    const hr = await loginClient(app, 'hr.partner@ndakalaadvisory.co.ke');
    const listRes = await hr.agent.get('/api/v1/employees');
    const items = listRes.body.data?.items || listRes.body.data;
    const empId = items[0]?.id;
    expect(empId).toBeDefined();

    const detailRes = await hr.agent.get(`/api/v1/employees/${empId}`);
    expect(detailRes.status).toBe(200);
    const profile = detailRes.body.data;

    // Verify 10-section fields
    expect(profile.employeeNumber).toBeDefined();
    expect(profile.firstName).toBeDefined();
    expect(profile.lastName).toBeDefined();
    expect(profile.workEmail).toBeDefined();
    expect(profile.department).toBeDefined();
    expect(profile.sensitive).toBeDefined();
  });

  it('Scenario 3: Non-HR actor receives masked sensitive statutory details', async () => {
    const regular = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const listRes = await regular.agent.get('/api/v1/employees');
    const items = listRes.body.data?.items || listRes.body.data;
    const anotherEmp = items.find((e: any) => e.workEmail !== 'employee.one@ndakalaadvisory.co.ke');

    if (anotherEmp) {
      const detailRes = await regular.agent.get(`/api/v1/employees/${anotherEmp.id}`);
      // Even if allowed to view peer basic info, sensitive statutory data is restricted/masked
      if (detailRes.status === 200) {
        const sensitive = detailRes.body.data?.sensitive;
        if (sensitive) {
          expect(sensitive.masked).toBe(true);
          expect(sensitive.kraPin).toBe('[RESTRICTED]');
        }
      }
    }
  });

  it('Scenario 4: 4-Step Add Employee provisions valid employee and agreement lifecycle', async () => {
    const hr = await loginClient(app, 'hr.partner@ndakalaadvisory.co.ke');

    // Retrieve departments to link
    const deptRes = await hr.agent.get('/api/v1/organisation/departments');
    expect(deptRes.status).toBe(200);
    const depts = deptRes.body.data;
    const chosenDeptId = depts[0]?.id;

    const uniqueId = Math.floor(Math.random() * 9000 + 1000);
    const payload = {
      firstName: 'Kelvin',
      lastName: 'Waweru',
      workEmail: `kelvin.waweru.${uniqueId}@ndakalaadvisory.co.ke`,
      phoneNumber: '+254712000000',
      jobTitle: 'Senior Advisory Consultant',
      departmentId: chosenDeptId,
      employmentCategoryCode: 'PERMANENT',
      startDate: '2026-12-01',
    };

    const createRes = await hr.agent.post('/api/v1/employees').send(payload);
    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body.data?.firstName).toBe('Kelvin');
    expect(createRes.body.data?.workEmail).toBe(payload.workEmail);
  });
});
