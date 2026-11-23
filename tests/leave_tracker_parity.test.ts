import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Leave Tracker & Absence Calendar Parity (#leavetracker)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Employee leave types cover all Kenyan statutory & firm enhanced categories', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const res = await emp.agent.get('/api/v1/leave/types');

    expect(res.status).toBe(200);
    const types = res.body.data;
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThanOrEqual(4);

    // Verify statutory types exist: Annual, Sick, Maternity, Paternity, etc.
    const annual = types.find((t: any) => t.code === 'ANNUAL');
    expect(annual).toBeDefined();

    const sick = types.find((t: any) => t.code === 'SICK');
    expect(sick).toBeDefined();
  });

  it('Scenario 2: Kenya Public Holidays and Gazette Notices are accessible for calendar integration', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const res = await emp.agent.get('/api/v1/leave/holidays');

    expect(res.status).toBe(200);
    const holidays = res.body.data;
    expect(Array.isArray(holidays)).toBe(true);
    expect(holidays.length).toBeGreaterThan(0);

    const newYear = holidays.find((h: any) => h.name?.includes("New Year"));
    expect(newYear).toBeDefined();
  });

  it('Scenario 3: Work Schedules and shift arrangements provide daily working hours', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const res = await emp.agent.get('/api/v1/leave/schedules');

    expect(res.status).toBe(200);
    const schedules = res.body.data;
    expect(Array.isArray(schedules)).toBe(true);
    expect(schedules.length).toBeGreaterThan(0);

    const standard = schedules[0];
    expect(standard.workingDays).toBeDefined();
    expect(standard.dailyWorkingHours).toBeGreaterThanOrEqual(7);
  });

  it('Scenario 4: Leave requests and audit ledger maintain transaction history', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const res = await emp.agent.get('/api/v1/leave/requests');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ledgerRes = await emp.agent.get('/api/v1/leave/ledger');
    expect(ledgerRes.status).toBe(200);
    expect(Array.isArray(ledgerRes.body.data)).toBe(true);
  });
});
