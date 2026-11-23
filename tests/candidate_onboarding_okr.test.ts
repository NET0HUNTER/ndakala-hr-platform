import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Candidate Onboarding Hub & OKR Configuration Parity', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Candidate list endpoint returns Zoho standard candidates with dynamic domain', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    const res = await hr.agent.get('/api/v1/onboarding/candidates');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);

    const sarah = res.body.data.find((c: any) => c.firstName === 'Sarah');
    expect(sarah).toBeDefined();
    expect(sarah.lastName).toBe('Sanders');
    expect(sarah.email).toBe('sarahsanders@zylker.com');
    expect(sarah.onboardingStatus).toBe('In Progress');
    expect(sarah.department).toBe('Advisory');

    const david = res.body.data.find((c: any) => c.firstName === 'David');
    expect(david).toBeDefined();
    expect(david.lastName).toBe('Rickman');
    expect(david.email).toBe('davidrickman@zylker.com');
  });

  it('Scenario 2: Add Candidate creates new candidate with auto-generated ID and persists in PolicyConfiguration', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    const postRes = await hr.agent
      .post('/api/v1/onboarding/candidates')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        firstName: 'Daniel',
        lastName: 'Wanyama',
        email: 'daniel.wanyama@example.com',
        department: 'Advisory',
        sourceOfHire: 'Direct',
        gender: 'Male',
        maritalStatus: 'Single',
        aboutMe: 'Experienced financial analyst and valuation specialist',
        citizenship: 'Kenyan',
        nickName: 'Dan',
        expertise: 'Valuations & M&A',
        joiningDate: '2026-12-01',
        title: 'Advisory Associate',
        currentSalary: 'KES 180,000',
      });

    expect(postRes.status).toBe(200);
    expect(postRes.body.data.candidateId).toMatch(/^CND-2026-\d{4}$/);
    expect(postRes.body.data.firstName).toBe('Daniel');
    expect(postRes.body.data.lastName).toBe('Wanyama');

    const listRes = await hr.agent.get('/api/v1/onboarding/candidates');
    expect(listRes.status).toBe(200);
    const found = listRes.body.data.find((c: any) => c.firstName === 'Daniel');
    expect(found).toBeDefined();
    expect(found.candidateId).toBe(postRes.body.data.candidateId);
  });

  it('Scenario 3: OKR Configuration persistence via workspace ui-config (Cycle start month, Deviation ranges, Location-based)', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const okrPayload = {
      startMonth: 'Apr',
      statusRanges: [
        { id: 'yet_to_start', name: 'Yet to Start', color: '#94a3b8', isRange: false, staticValue: '-' },
        { id: 'on_track', name: 'On Track', color: '#10b981', isRange: true, min: 1, max: 15 },
        { id: 'need_attention', name: 'Need Attention', color: '#f59e0b', isRange: true, min: 16, max: 50 },
        { id: 'at_risk', name: 'At Risk', color: '#f97316', isRange: true, min: 51, max: 80 },
        { id: 'off_track', name: 'Off Track', color: '#ef4444', isRange: true, min: 81, max: 100 },
        { id: 'completed', name: 'Completed', color: '#3b82f6', isRange: false, staticValue: '100%' },
      ],
      locationBasedOkrs: true,
      maxObjectives: 6,
      krCheckInFrequency: 'Weekly',
      allowCustomMetrics: true,
    };

    const putRes = await hr.agent
      .put('/api/v1/workspace/ui-config')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        key: 'OKR_CONFIG',
        scope: 'ORG',
        value: okrPayload,
      });
    expect(putRes.status).toBe(200);

    const getRes = await hr.agent.get('/api/v1/workspace/ui-config?key=OKR_CONFIG');
    expect(getRes.status).toBe(200);
    const saved = getRes.body.data.configs.OKR_CONFIG;
    expect(saved).toBeDefined();
    expect(saved.startMonth).toBe('Apr');
    expect(saved.locationBasedOkrs).toBe(true);
    expect(saved.statusRanges[1].max).toBe(15);
  });

  it('Scenario 4: Dynamic domain resolution without hardcoding', async () => {
    const partner = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    const orgRes = await partner.agent.get('/api/v1/organisation');
    expect(orgRes.status).toBe(200);
    expect(orgRes.body.data.email).toBeDefined();
    expect(orgRes.body.data.website).toBeDefined();

    const domain = orgRes.body.data.email.split('@')[1];
    expect(domain).toBeDefined();
  });

  it('Scenario 5: 7-Section Candidate Modal repeating grids (Education, Experience, Dependents) draft persistence', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const draftPayload = {
      firstName: 'Faith',
      lastName: 'Mutua',
      personalEmail: 'faith.mutua@example.com',
      workEmail: 'faith.mutua@ndakalaadvisory.co.ke',
      department: 'Advisory & Strategy Consulting',
      educationRows: [
        {
          school: 'University of Nairobi',
          degree: 'Bachelor of Economics',
          field: 'Economics & Statistics',
          completionDate: '2022-11-20',
          notes: 'First Class Honours',
        },
      ],
      experienceRows: [
        {
          occupation: 'Financial Analyst',
          company: 'Acme Advisory Kenya',
          summary: 'Led valuation models and equity research',
          duration: '2 Years',
          fromDate: '2023-01-10',
          toDate: '2025-01-15',
        },
      ],
      dependentRows: [
        {
          name: 'Lucas Mutua',
          relationship: 'Child',
          dob: '2024-05-12',
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    const putRes = await hr.agent
      .put('/api/v1/workspace/ui-config')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        key: 'CANDIDATE_DRAFT',
        scope: 'USER',
        value: draftPayload,
      });

    expect(putRes.status).toBe(200);

    const getRes = await hr.agent.get('/api/v1/workspace/ui-config?key=CANDIDATE_DRAFT');
    expect(getRes.status).toBe(200);
    const savedDraft = getRes.body.data.configs.CANDIDATE_DRAFT;
    expect(savedDraft).toBeDefined();
    expect(savedDraft.firstName).toBe('Faith');
    expect(savedDraft.educationRows.length).toBe(1);
    expect(savedDraft.educationRows[0].school).toBe('University of Nairobi');
    expect(savedDraft.experienceRows.length).toBe(1);
    expect(savedDraft.experienceRows[0].company).toBe('Acme Advisory Kenya');
    expect(savedDraft.dependentRows.length).toBe(1);
    expect(savedDraft.dependentRows[0].relationship).toBe('Child');
  });
});
