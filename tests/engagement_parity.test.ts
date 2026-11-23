import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Employee Engagement & eNPS Surveys Parity (P2.4 - Module 14)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Launches anonymous pulse survey, submits response, aggregates eNPS rating, and preserves NDA-2026-0005', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    expect(
      (empRes.body.data?.items || empRes.body.data).find((e: any) => e.employeeNumber === 'NDA-2026-0005')
    ).toBeDefined();

    // Launch pulse survey
    const createRes = await admin.agent
      .post('/api/v1/workspace/surveys')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        title: 'Q4 2026 Workplace Engagement & eNPS Pulse',
        description: 'Rate your overall satisfaction and likelihood to recommend Ndakala Advisory.',
        closingDate: '2026-12-31',
        anonymous: true,
      });
    expect(createRes.status).toBe(201);
    const survey = createRes.body.data;

    // Submit anonymous response
    const respRes = await admin.agent
      .post(`/api/v1/workspace/surveys/${survey.id}/respond`)
      .set('x-csrf-token', admin.csrfToken)
      .send({
        overallRating: 5,
        comment: 'Strong culture of mentorship and transparent statutory compliance.',
      });
    expect([200, 201]).toContain(respRes.status);

    // List surveys & verify aggregated rating
    const listRes = await admin.agent.get('/api/v1/workspace/surveys');
    expect(listRes.status).toBe(200);
    const found = listRes.body.data.items.find((s: any) => s.id === survey.id);
    expect(found).toBeDefined();
    expect(found.responseCount).toBeGreaterThanOrEqual(1);
    expect(found.avgRating).toBe(5);
  });
});
