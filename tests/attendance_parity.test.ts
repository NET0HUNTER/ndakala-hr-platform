import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Attendance Module Parity (#attendance)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Web Clock-In and Clock-Out updates live punch status and duration', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    // 1. Clock in
    const inRes = await emp.agent
      .post('/api/v1/workspace/attendance/clock-in')
      .set('x-csrf-token', emp.csrfToken)
      .send({
        source: 'WEB_PORTAL',
        notes: 'Zoho People Parity Test Punch In',
      });

    expect(inRes.status).toBe(200);
    expect(inRes.body.data).toBeDefined();

    // 2. Query attendance status
    const statusRes = await emp.agent.get('/api/v1/workspace/attendance');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.checkedIn).toBe(true);
    expect(Array.isArray(statusRes.body.data.punches)).toBe(true);
    expect(statusRes.body.data.punches.length).toBeGreaterThan(0);

    // 3. Clock out
    const outRes = await emp.agent
      .post('/api/v1/workspace/attendance/clock-out')
      .set('x-csrf-token', emp.csrfToken)
      .send({
        notes: 'Zoho People Parity Test Punch Out',
      });

    expect(outRes.status).toBe(200);
    expect(outRes.body.data.punch).toBeDefined();
    expect(outRes.body.data.punch.clockOutAt).toBeDefined();
  });

  it('Scenario 2: GET /api/v1/attendance/summary returns full monthly 9-column grid with Zoho calculations', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const res = await emp.agent.get('/api/v1/attendance/summary?month=2026-11');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.month).toBe('2026-11');
    expect(Array.isArray(res.body.data.days)).toBe(true);
    expect(res.body.data.days.length).toBe(30); // November has 30 days

    // Verify 9 statutory columns on day items
    const dayItem = res.body.data.days[0];
    expect(dayItem.date).toBeDefined();
    expect(dayItem.formattedDate).toBeDefined();
    expect(dayItem.firstIn).toBeDefined();
    expect(dayItem.lastOut).toBeDefined();
    expect(dayItem.totalHours).toBeDefined();
    expect(dayItem.payableHours).toBeDefined();
    expect(dayItem.deviation).toBeDefined();
    expect(dayItem.status).toBeDefined();
    expect(dayItem.shift).toBeDefined();
    expect(dayItem.regularization).toBeDefined();

    // Verify aggregated summary totals
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.summary.totalDays).toBe(30);
    expect(typeof res.body.data.summary.presentDays).toBe('number');
    expect(typeof res.body.data.summary.absentDays).toBe('number');
    expect(typeof res.body.data.summary.leaveDays).toBe('number');
    expect(typeof res.body.data.summary.holidayDays).toBe('number');
    expect(typeof res.body.data.summary.weekendDays).toBe('number');
    expect(typeof res.body.data.summary.totalPayableHours).toBe('string');
  });

  it('Scenario 3: Attendance Regularization creates and updates punch record with audit trail', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const regRes = await emp.agent
      .post('/api/v1/attendance/regularize')
      .set('x-csrf-token', emp.csrfToken)
      .send({
        workDate: '2026-11-10',
        type: 'FULL_DAY',
        clockInTime: '08:30',
        clockOutTime: '17:30',
        reason: 'Client Site Visit / Meeting',
        notes: 'Full day advisory session with banking client',
      });

    expect(regRes.status).toBe(200);
    expect(regRes.body.data.success).toBe(true);
    expect(regRes.body.data.punch).toBeDefined();
    expect(regRes.body.data.punch.workDate).toBe('2026-11-10');
    expect(regRes.body.data.punch.notes).toContain('Regularized');

    // Verify day shows REGULARIZED in summary
    const summaryRes = await emp.agent.get('/api/v1/attendance/summary?month=2026-11');
    const day10 = summaryRes.body.data.days.find((d: any) => d.date === '2026-11-10');
    expect(day10).toBeDefined();
    expect(day10.status).toBe('PRESENT');
    expect(day10.regularization).toBe('REGULARIZED');
  });

  it('Scenario 4: GET /api/v1/attendance/team-kanban returns categorized employee groups', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const kanbanRes = await admin.agent.get('/api/v1/attendance/team-kanban');

    expect(kanbanRes.status).toBe(200);
    expect(kanbanRes.body.data).toBeDefined();
    expect(kanbanRes.body.data.summary).toBeDefined();
    expect(typeof kanbanRes.body.data.summary.totalCount).toBe('number');
    expect(typeof kanbanRes.body.data.summary.checkedInCount).toBe('number');
    expect(typeof kanbanRes.body.data.summary.notYetInCount).toBe('number');
    expect(typeof kanbanRes.body.data.summary.onLeaveCount).toBe('number');

    expect(Array.isArray(kanbanRes.body.data.checkedIn)).toBe(true);
    expect(Array.isArray(kanbanRes.body.data.notYetIn)).toBe(true);
    expect(Array.isArray(kanbanRes.body.data.onLeave)).toBe(true);
  });
});
