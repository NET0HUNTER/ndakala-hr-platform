import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { resolveEffectiveConfiguration, PolicyRule } from '../src/modules/configuration/precedence.js';

describe('Configuration Framework & Statutory Precedence (ORG-04, NFR-02)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('correctly resolves configuration precedence: Statutory -> Organisation -> Location -> Department -> Exception', () => {
    const rules: PolicyRule[] = [
      {
        id: '1',
        code: 'ANNUAL_LEAVE',
        title: 'Statutory Employment Act 2007 Baseline',
        layer: 'STATUTORY',
        version: 1,
        status: 'ACTIVE',
        values: { annualLeaveDays: 21, annualLeaveDaysMin: 21 },
        effectiveFrom: new Date('2020-01-01'),
      },
      {
        id: '2',
        code: 'ANNUAL_LEAVE',
        title: 'Ndakala Standard Organisation Policy',
        layer: 'ORGANISATION',
        version: 1,
        status: 'ACTIVE',
        values: { annualLeaveDays: 21, carryForwardLimit: 12 },
        effectiveFrom: new Date('2024-01-01'),
      },
      {
        id: '3',
        code: 'ANNUAL_LEAVE',
        title: 'Mombasa Regional Office Policy',
        layer: 'LOCATION',
        locationId: 'loc-mombasa',
        version: 1,
        status: 'ACTIVE',
        values: { carryForwardLimit: 15 },
        effectiveFrom: new Date('2024-01-01'),
      },
      {
        id: '4',
        code: 'ANNUAL_LEAVE',
        title: 'Individual Senior Partner Exception',
        layer: 'EXCEPTION',
        targetEmployeeId: 'emp-partner-1',
        version: 1,
        status: 'ACTIVE',
        values: { annualLeaveDays: 30 },
        effectiveFrom: new Date('2024-01-01'),
      },
    ];

    // Case 1: Standard Employee in Nairobi
    const resStandard = resolveEffectiveConfiguration(rules, {
      locationId: 'loc-nairobi',
    });
    expect(resStandard.effectiveValues.annualLeaveDays).toBe(21);
    expect(resStandard.effectiveValues.carryForwardLimit).toBe(12);

    // Case 2: Employee in Mombasa location gets location override for carryForwardLimit
    const resMombasa = resolveEffectiveConfiguration(rules, {
      locationId: 'loc-mombasa',
    });
    expect(resMombasa.effectiveValues.annualLeaveDays).toBe(21);
    expect(resMombasa.effectiveValues.carryForwardLimit).toBe(15);

    // Case 3: Senior Partner gets individual approved exception override
    const resPartner = resolveEffectiveConfiguration(rules, {
      targetEmployeeId: 'emp-partner-1',
      locationId: 'loc-mombasa',
    });
    expect(resPartner.effectiveValues.annualLeaveDays).toBe(30);
    expect(resPartner.effectiveValues.carryForwardLimit).toBe(15);
  });

  it('rejects any configuration that attempts to weaken statutory minimum floor', () => {
    const rulesWithIllegalReduction: PolicyRule[] = [
      {
        id: '1',
        code: 'ANNUAL_LEAVE',
        title: 'Kenya Employment Act 2007 (Cap 226)',
        layer: 'STATUTORY',
        version: 1,
        status: 'ACTIVE',
        values: { annualLeaveDays: 21, annualLeaveDaysMin: 21 },
        effectiveFrom: new Date('2020-01-01'),
      },
      {
        id: '2',
        code: 'ANNUAL_LEAVE',
        title: 'Unlawful Sub-Statutory Reduction',
        layer: 'ORGANISATION',
        version: 1,
        status: 'ACTIVE',
        values: { annualLeaveDays: 14 }, // Attempting 14 days when statutory minimum is 21!
        effectiveFrom: new Date('2024-01-01'),
      },
    ];

    expect(() =>
      resolveEffectiveConfiguration(rulesWithIllegalReduction, {}),
    ).toThrowError(/Statutory violation: Configured annualLeaveDays \(14\) cannot fall below statutory minimum 21/);
  });

  it('creating and approving a new active version supersedes prior active version', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    const ops = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    const policyCode = `DRESS_CODE_${Date.now().toString().slice(-4)}`;

    // 1. Version 1 Draft & Approve
    const v1Draft = await hr.agent
      .post('/api/v1/configuration')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        code: policyCode,
        title: 'Ndakala Business Attire',
        layer: 'ORGANISATION',
        values: { attire: 'Corporate Formal' },
        sourceReference: 'Dress Code Policy 1 June 2024',
        owner: 'HR',
        effectiveFrom: new Date('2024-01-01').toISOString(),
      });
    const v1Id = v1Draft.body.data.id;
    expect(v1Draft.body.data.version).toBe(1);

    await hr.agent.post(`/api/v1/configuration/${v1Id}/submit`).set('x-csrf-token', hr.csrfToken);
    await ops.agent.post(`/api/v1/configuration/${v1Id}/approve`).set('x-csrf-token', ops.csrfToken);

    const v1Active = await prisma.policyConfiguration.findUnique({ where: { id: v1Id } });
    expect(v1Active?.status).toBe('ACTIVE');

    // 2. Version 2 Draft & Approve
    const v2Draft = await hr.agent
      .post('/api/v1/configuration')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        code: policyCode,
        title: 'Ndakala Business Smart Casual Revision',
        layer: 'ORGANISATION',
        values: { attire: 'Smart Casual Fridays' },
        sourceReference: 'Dress Code Policy Revision v1.1',
        owner: 'HR',
        effectiveFrom: new Date('2024-06-01').toISOString(),
      });
    const v2Id = v2Draft.body.data.id;
    expect(v2Draft.body.data.version).toBe(2);

    await hr.agent.post(`/api/v1/configuration/${v2Id}/submit`).set('x-csrf-token', hr.csrfToken);
    await ops.agent.post(`/api/v1/configuration/${v2Id}/approve`).set('x-csrf-token', ops.csrfToken);

    // Verify v1 is now SUPERSEDED and v2 is ACTIVE
    const v1After = await prisma.policyConfiguration.findUnique({ where: { id: v1Id } });
    const v2After = await prisma.policyConfiguration.findUnique({ where: { id: v2Id } });

    expect(v1After?.status).toBe('SUPERSEDED');
    expect(v1After?.supersededById).toBe(v2Id);
    expect(v2After?.status).toBe('ACTIVE');
    expect(v2After?.version).toBe(2);
  });
});
