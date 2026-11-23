import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Enterprise Reports Catalogue & Statutory Exports Parity (P2.5 - Module 16)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Loads Executive Summary, Workforce, Leave, Payroll, Performance, and Governance reports + CSV export while preserving NDA-2026-0005', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    expect(
      (empRes.body.data?.items || empRes.body.data).find((e: any) => e.employeeNumber === 'NDA-2026-0005')
    ).toBeDefined();

    const qs = 'scope=org&startDate=2026-09-01&endDate=2026-12-31';
    const [sumRes, wfRes, lvRes, payRes, perfRes, govRes, csvRes] = await Promise.all([
      admin.agent.get(`/api/v1/reports/summary?${qs}`),
      admin.agent.get(`/api/v1/reports/workforce?${qs}`),
      admin.agent.get(`/api/v1/reports/leave?${qs}`),
      admin.agent.get(`/api/v1/reports/payroll?${qs}`),
      admin.agent.get(`/api/v1/reports/performance?${qs}`),
      admin.agent.get(`/api/v1/reports/governance?${qs}`),
      admin.agent.get(`/api/v1/reports/export/workforce?${qs}`),
    ]);

    expect(sumRes.status).toBe(200);
    expect(wfRes.status).toBe(200);
    expect(lvRes.status).toBe(200);
    expect(payRes.status).toBe(200);
    expect(perfRes.status).toBe(200);
    expect(govRes.status).toBe(200);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
  });
});
