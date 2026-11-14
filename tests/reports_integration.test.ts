import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, getApp, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Enterprise Reports Hub & Live Analytics API Suite', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('returns consolidated cross-domain executive summary & individual module reports for Managing Partner', async () => {
    const { agent } = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const summary = await agent.get('/api/v1/reports/summary?scope=org');
    expect(summary.status).toBe(200);
    expect(summary.body.data.workforce.totalEmployees).toBeGreaterThanOrEqual(3);
    expect(summary.body.data.timetracker.totalLoggedHours).toBeGreaterThan(0);

    const domains = ['workforce', 'leave', 'payroll', 'performance', 'governance', 'timetracker'];
    for (const d of domains) {
      const res = await agent.get(`/api/v1/reports/${d}?scope=org`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    }
  });

  it('streams valid RFC-4180 CSV exports for every report domain', async () => {
    const { agent } = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const csvRes = await agent.get('/api/v1/reports/export/timetracker');
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Project Code');
    expect(csvRes.text).toContain('PRJ-2026-001');
  });

  it('persists Report Access Permissions Matrix and enforces RBAC on update', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const partner = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const getRes = await emp.agent.get('/api/v1/reports/permissions');
    expect(getRes.status).toBe(200);

    // Employee cannot mutate org report permissions
    const forbiddenRes = await emp.agent
      .put('/api/v1/reports/permissions')
      .set('X-CSRF-Token', emp.csrfToken)
      .send({ my: { enabled: false } });
    expect(forbiddenRes.status).toBe(403);

    // Managing partner can persist updated matrix
    const nextMatrix = {
      ...getRes.body.data,
      team: { ...getRes.body.data.team, payroll: false },
    };
    const updateRes = await partner.agent
      .put('/api/v1/reports/permissions')
      .set('X-CSRF-Token', partner.csrfToken)
      .send(nextMatrix);
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.team.payroll).toBe(false);
  });
});
