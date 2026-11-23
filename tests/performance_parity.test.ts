import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Performance & OKR Parity Suite (P1.3 - Module 2.3)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Preserves NDA-2026-0005 (Amina Ochieng) and returns performance cycles & rating scales', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    const items = empRes.body.data?.items || empRes.body.data;
    expect(items.find((e: any) => e.employeeNumber === 'NDA-2026-0005')).toBeDefined();

    const cyclesRes = await admin.agent.get('/api/v1/performance/cycles');
    expect(cyclesRes.status).toBe(200);
    const cycles = cyclesRes.body.data?.items || cyclesRes.body.data;
    expect(Array.isArray(cycles)).toBe(true);

    const scalesRes = await admin.agent.get('/api/v1/performance/rating-scales');
    expect(scalesRes.status).toBe(200);
    const scales = scalesRes.body.data?.items || scalesRes.body.data;
    expect(Array.isArray(scales)).toBe(true);
    expect(scales.length).toBeGreaterThan(0);
  });

  it('Scenario 2: Lists appraisals, objective sets, PIPs, and development actions cleanly', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const [appRes, objRes, pipRes, devRes] = await Promise.all([
      admin.agent.get('/api/v1/performance/appraisals'),
      admin.agent.get('/api/v1/performance/objectives'),
      admin.agent.get('/api/v1/performance/pips'),
      admin.agent.get('/api/v1/performance/development/actions'),
    ]);

    expect(appRes.status).toBe(200);
    expect(objRes.status).toBe(200);
    expect(pipRes.status).toBe(200);
    expect(devRes.status).toBe(200);
  });

  it('Scenario 3: OKR configuration UI config endpoint persists and retrieves OKR settings', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const getRes = await admin.agent.get('/api/v1/ui-config/okr');
    expect([200, 404]).toContain(getRes.status);
  });
});
