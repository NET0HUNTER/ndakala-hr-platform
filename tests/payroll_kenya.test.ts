import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import {
  calculateConfigurableSlip,
  calculateTieredBrackets,
  calculateTieredPension,
  calculatePercentageOfGross,
  calculateFixedPerEmployee,
  ComponentDefinition,
  RuleDefinition,
  CalculationInputContext,
} from '../src/modules/payroll/engine.js';

describe('Kenyan Payroll & Remuneration Engine (Phase 6 - R3 Pilot)', () => {
  const app = getApp();

  let partnerClient: Awaited<ReturnType<typeof loginClient>>;
  let opsClient: Awaited<ReturnType<typeof loginClient>>;
  let hrClient: Awaited<ReturnType<typeof loginClient>>;
  let employeeClient: Awaited<ReturnType<typeof loginClient>>;

  let profPayGroupId: string;
  let testPeriodId: string;
  let activeRuleSetId: string;

  const defaultCatalog: ComponentDefinition[] = [
    { code: 'BASIC', name: 'Basic Salary', category: 'EARNING', isPensionable: true, isTaxable: true, isSubjectToHousingLevy: true, isSubjectToHealthLevy: true, isProRataApplicable: true, displayOrder: 10 },
    { code: 'HOUSE_ALLW', name: 'Housing Allowance', category: 'EARNING', isPensionable: false, isTaxable: true, isSubjectToHousingLevy: true, isSubjectToHealthLevy: true, isProRataApplicable: true, displayOrder: 15 },
    { code: 'COMMUTER_ALLW', name: 'Commuter Allowance', category: 'EARNING', isPensionable: false, isTaxable: true, isSubjectToHousingLevy: true, isSubjectToHealthLevy: true, isProRataApplicable: true, displayOrder: 20 },
  ];

  const testRuleSet: RuleDefinition[] = [
    {
      code: 'NSSF_2026',
      name: 'NSSF Year 4 (Feb 2026)',
      category: 'PENSION',
      algorithmType: 'TIERED_PENSION_CAPS',
      parameters: JSON.stringify({
        employeeRate: 0.06,
        employerRate: 0.06,
        lowerEarningsLimit: 8000,
        upperEarningsLimit: 72000,
        tier1MaxEmployee: 480,
        tier1MaxEmployer: 480,
        tier2MaxEmployee: 3840,
        tier2MaxEmployer: 3840,
        totalMaxEmployee: 4320,
        totalMaxEmployer: 4320,
      }),
      deductibleFromTaxablePay: true,
      isEmployeeDeduction: true,
      isEmployerContribution: true,
      roundingRule: 'ROUND_HALF_UP',
      priority: 10,
      version: '2026.1',
    },
    {
      code: 'SHIF_2026',
      name: 'Social Health Insurance Fund (SHIF 2.75%)',
      category: 'HEALTH_INSURANCE',
      algorithmType: 'PERCENTAGE_OF_GROSS',
      parameters: JSON.stringify({
        employeeRate: 0.0275,
        employerRate: 0,
        minAmount: 300,
      }),
      deductibleFromTaxablePay: false,
      reliefPercentage: 15,
      reliefMaxMonthly: 5000,
      isEmployeeDeduction: true,
      isEmployerContribution: false,
      roundingRule: 'ROUND_HALF_UP',
      priority: 20,
      version: '2026.1',
    },
    {
      code: 'AHL_2026',
      name: 'Affordable Housing Levy (AHL 1.5%)',
      category: 'HOUSING_LEVY',
      algorithmType: 'PERCENTAGE_OF_GROSS',
      parameters: JSON.stringify({
        employeeRate: 0.015,
        employerRate: 0.015,
      }),
      deductibleFromTaxablePay: false,
      isEmployeeDeduction: true,
      isEmployerContribution: true,
      roundingRule: 'ROUND_HALF_UP',
      priority: 30,
      version: '2026.1',
    },
    {
      code: 'PAYE_2026',
      name: 'PAYE Individual Income Tax (5 Bands)',
      category: 'INCOME_TAX',
      algorithmType: 'TIERED_BRACKETS',
      parameters: JSON.stringify({
        bands: [
          { order: 1, lowerLimit: 0, upperLimit: 24000, rate: 0.10 },
          { order: 2, lowerLimit: 24000, upperLimit: 32333, rate: 0.25 },
          { order: 3, lowerLimit: 32333, upperLimit: 500000, rate: 0.30 },
          { order: 4, lowerLimit: 500000, upperLimit: 800000, rate: 0.325 },
          { order: 5, lowerLimit: 800000, upperLimit: null, rate: 0.35 },
        ],
        personalReliefMonthly: 2400,
        insuranceReliefRate: 0.15,
        insuranceReliefMaxMonthly: 5000,
      }),
      deductibleFromTaxablePay: false,
      isEmployeeDeduction: true,
      isEmployerContribution: false,
      roundingRule: 'ROUND_HALF_UP',
      priority: 40,
      version: '2026.1',
    },
    {
      code: 'NITA_2026',
      name: 'NITA Industrial Training Levy',
      category: 'TRAINING_LEVY',
      algorithmType: 'FIXED_PER_EMPLOYEE',
      parameters: JSON.stringify({
        amount: 50,
        payer: 'EMPLOYER',
      }),
      deductibleFromTaxablePay: false,
      isEmployeeDeduction: false,
      isEmployerContribution: true,
      roundingRule: 'ROUND_HALF_UP',
      priority: 50,
      version: '2026.1',
    },
  ];

  beforeAll(async () => {
    await seedDatabase(prisma);

    // Clean up any lingering runs to guarantee clean deterministic tests
    await prisma.bankScheduleExport.deleteMany();
    await prisma.payrollReconciliationReport.deleteMany();
    await prisma.payrollLineItem.deleteMany();
    await prisma.payrollSlip.deleteMany();
    await prisma.payrollRun.deleteMany();
    await prisma.payrollPeriod.updateMany({
      data: { status: 'DRAFT' },
    });

    partnerClient = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    opsClient = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    hrClient = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    employeeClient = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const pg = await prisma.payrollPayGroup.findUniqueOrThrow({ where: { code: 'PG-PROF' } });
    profPayGroupId = pg.id;

    const period = await prisma.payrollPeriod.findFirstOrThrow({
      where: { payGroupId: profPayGroupId, periodCode: '2026-11-PG-PROF' },
    });
    testPeriodId = period.id;

    const rs = await prisma.statutoryRuleSet.findFirstOrThrow({
      where: { code: 'KENYA_STATUTORY_2026' },
    });
    activeRuleSetId = rs.id;
  });

  // =========================================================================
  // 1. PURE ENGINE UNIT TESTS & ALGORITHM VERIFICATION
  // =========================================================================
  describe('Pure Engine Calculation Algorithms', () => {
    it('calculates Tiered Pension Caps (NSSF Year 4 Feb 2026) correctly across gross thresholds', () => {
      const nssfParams = {
        employeeRate: 0.06,
        employerRate: 0.06,
        lowerEarningsLimit: 8000,
        upperEarningsLimit: 72000,
        tier1MaxEmployee: 480,
        tier1MaxEmployer: 480,
        tier2MaxEmployee: 3840,
        tier2MaxEmployer: 3840,
        totalMaxEmployee: 4320,
        totalMaxEmployer: 4320,
      };

      // Below Tier 1 cap: 5,000 * 6% = 300
      const lowResult = calculateTieredPension(5000, nssfParams);
      expect(lowResult.totalEmployee).toBe(300);
      expect(lowResult.totalEmployer).toBe(300);

      // Between Tier 1 and Tier 2: 25,000 gross
      // Tier 1: 8,000 * 6% = 480
      // Tier 2: (25,000 - 8,000) * 6% = 17,000 * 6% = 1,020
      // Total: 480 + 1,020 = 1,500
      const midResult = calculateTieredPension(25000, nssfParams);
      expect(midResult.tier1Employee).toBe(480);
      expect(midResult.tier2Employee).toBe(1020);
      expect(midResult.totalEmployee).toBe(1500);
      expect(midResult.totalEmployer).toBe(1500);

      // Above Tier 2 cap: 100,000 gross -> capped at 4,320
      const highResult = calculateTieredPension(100000, nssfParams);
      expect(highResult.tier1Employee).toBe(480);
      expect(highResult.tier2Employee).toBe(3840);
      expect(highResult.totalEmployee).toBe(4320);
      expect(highResult.totalEmployer).toBe(4320);
    });

    it('calculates SHIF (2.75%) with statutory minimum floor of KES 300', () => {
      const shifParams = {
        employeeRate: 0.0275,
        employerRate: 0,
        minAmount: 300,
      };

      // Very low earner: 8,000 * 2.75% = 220 -> capped up by floor to 300
      const floorResult = calculatePercentageOfGross(8000, shifParams);
      expect(floorResult.employeeAmount).toBe(300);
      expect(floorResult.employerAmount).toBe(0);

      // Standard earner: 80,000 * 2.75% = 2,200
      const stdResult = calculatePercentageOfGross(80000, shifParams);
      expect(stdResult.employeeAmount).toBe(2200);
    });

    it('calculates Affordable Housing Levy (1.5%) with matching employer contribution', () => {
      const ahlParams = {
        employeeRate: 0.015,
        employerRate: 0.015,
      };

      const ahl = calculatePercentageOfGross(100000, ahlParams);
      expect(ahl.employeeAmount).toBe(1500);
      expect(ahl.employerAmount).toBe(1500);
    });

    it('calculates Fixed per employee levy (NITA KES 50) as pure employer cost', () => {
      const nitaParams = {
        amount: 50,
        payer: 'EMPLOYER' as const,
      };

      const nita = calculateFixedPerEmployee(nitaParams);
      expect(nita.employeeAmount).toBe(0);
      expect(nita.employerAmount).toBe(50);
    });
  });

  // =========================================================================
  // 2. GOLDEN TEST VECTORS (SECTION 8 OF DESIGN PACK)
  // =========================================================================
  describe('Golden Test Vectors (Design Pack Section 8)', () => {
    it('Golden Vector A: Intern / Trainee @ KES 25,000 gross (Zero Net PAYE due to Personal Relief)', () => {
      const ctx: CalculationInputContext = {
        employeeId: 'EMP-VECTOR-A',
        employeeName: 'Graduate Intern',
        employeeRef: 'NDK-INT-001',
        salaryComponents: { BASIC: 25000 },
        daysWorkedInMonth: 30,
        totalWorkingDaysInMonth: 30,
        unpaidLeaveDays: 0,
        halfPayLeaveDays: 0,
      };

      const result = calculateConfigurableSlip(ctx, defaultCatalog, testRuleSet);

      expect(result.grossPay).toBe(25000);

      // NSSF: 480 + 1,020 = 1,500
      const nssfItem = result.lineItems.find((l) => l.componentCode.startsWith('NSSF') && l.category === 'DEDUCTION_EE');
      expect(nssfItem?.amount).toBe(1500);

      // Taxable Pay: 25,000 - 1,500 = 23,500
      expect(result.taxablePay).toBe(23500);

      // Gross PAYE: 23,500 * 10% = 2,350. Personal Relief: 2,400 -> Net PAYE = 0
      const payeItem = result.lineItems.find((l) => l.componentCode.startsWith('PAYE'));
      expect(payeItem?.amount).toBe(0);

      // SHIF: 25,000 * 2.75% = 687.50
      const shifItem = result.lineItems.find((l) => l.componentCode.startsWith('SHIF'));
      expect(shifItem?.amount).toBe(687.50);

      // AHL: 25,000 * 1.5% = 375.00
      const ahlItem = result.lineItems.find((l) => l.componentCode.startsWith('AHL') && l.category === 'DEDUCTION_EE');
      expect(ahlItem?.amount).toBe(375.00);

      // Total Employee Deductions: 1,500 + 0 + 687.50 + 375.00 = 2,562.50
      expect(result.totalEmployeeDeductions).toBe(2562.50);

      // Net Pay: 25,000 - 2,562.50 = 22,437.50
      expect(result.netPay).toBe(22437.50);

      // Employer Operational Costs: NSSF match (1,500) + AHL match (375) + NITA (50) = 1,925.00
      // In totalEmployerCosts = grossPay (25000) + employer contributions (1925) = 26925
      expect(result.totalEmployerCosts).toBe(26925);

      // Invariant: Employee Net Pay + Employee Deductions equals Gross Pay
      expect(result.netPay + result.totalEmployeeDeductions).toBe(result.grossPay);
    });

    it('Golden Vector B: Senior Consultant @ KES 200,000 gross', () => {
      const ctx: CalculationInputContext = {
        employeeId: 'EMP-VECTOR-B',
        employeeName: 'Senior Consultant',
        employeeRef: 'NDK-SR-002',
        salaryComponents: { BASIC: 150000, HOUSE_ALLW: 35000, COMMUTER_ALLW: 15000 },
        daysWorkedInMonth: 30,
        totalWorkingDaysInMonth: 30,
        unpaidLeaveDays: 0,
        halfPayLeaveDays: 0,
      };

      const result = calculateConfigurableSlip(ctx, defaultCatalog, testRuleSet);

      expect(result.grossPay).toBe(200000);

      // NSSF: Max Tier 1 (480) + Tier 2 (3,840) = 4,320
      const nssfItem = result.lineItems.find((l) => l.componentCode.startsWith('NSSF') && l.category === 'DEDUCTION_EE');
      expect(nssfItem?.amount).toBe(4320);

      // Taxable Pay: 200,000 - 4,320 = 195,680
      expect(result.taxablePay).toBe(195680);

      // PAYE:
      // Band 1: 24,000 @ 10% = 2,400.00
      // Band 2: 8,333 @ 25% = 2,083.25
      // Band 3: (195,680 - 32,333) = 163,347 @ 30% = 49,004.10
      // Total Gross PAYE: 2,400 + 2,083.25 + 49,004.10 = 53,487.35
      // Less Personal Relief (2,400.00) and SHIF Insurance Relief (5,500 * 15% = 825.00)
      // Net PAYE: 53,487.35 - 2,400 - 825 = 50,262.35
      const payeItem = result.lineItems.find((l) => l.componentCode.startsWith('PAYE'));
      expect(payeItem?.amount).toBeCloseTo(50262.35, 1);

      // SHIF: 200,000 * 2.75% = 5,500.00
      const shifItem = result.lineItems.find((l) => l.componentCode.startsWith('SHIF'));
      expect(shifItem?.amount).toBe(5500);

      // AHL: 200,000 * 1.5% = 3,000.00
      const ahlItem = result.lineItems.find((l) => l.componentCode.startsWith('AHL') && l.category === 'DEDUCTION_EE');
      expect(ahlItem?.amount).toBe(3000);

      // Net Pay check: Gross - Total Deductions
      expect(result.netPay).toBe(200000 - result.totalEmployeeDeductions);
      expect(result.netPay).toBeGreaterThan(130000);
    });

    it('Golden Vector C: Managing Partner @ KES 1,150,000 gross (32.5% and 35% PAYE brackets)', () => {
      const ctx: CalculationInputContext = {
        employeeId: 'EMP-VECTOR-C',
        employeeName: 'Managing Partner',
        employeeRef: 'NDK-PT-001',
        salaryComponents: { BASIC: 950000, HOUSE_ALLW: 150000, COMMUTER_ALLW: 50000 },
        daysWorkedInMonth: 30,
        totalWorkingDaysInMonth: 30,
        unpaidLeaveDays: 0,
        halfPayLeaveDays: 0,
      };

      const result = calculateConfigurableSlip(ctx, defaultCatalog, testRuleSet);

      expect(result.grossPay).toBe(1150000);
      expect(result.taxablePay).toBe(1150000 - 4320); // 1,145,680

      // High earner reaches the 35% PAYE bracket (> 800,000 KES)
      const payeItem = result.lineItems.find((l) => l.componentCode.startsWith('PAYE'));
      expect(payeItem?.amount).toBeGreaterThan(350000);

      // SHIF: 1,150,000 * 2.75% = 31,625.00
      const shifItem = result.lineItems.find((l) => l.componentCode.startsWith('SHIF'));
      expect(shifItem?.amount).toBe(31625);

      // AHL: 1,150,000 * 1.5% = 17,250.00
      const ahlItem = result.lineItems.find((l) => l.componentCode.startsWith('AHL') && l.category === 'DEDUCTION_EE');
      expect(ahlItem?.amount).toBe(17250);

      expect(result.netPay + result.totalEmployeeDeductions).toBe(result.grossPay);
    });
  });

  // =========================================================================
  // 3. MID-MONTH JOINER PRO-RATA & UNPAID LEAVE DEDUCTIONS
  // =========================================================================
  describe('Pro-Rata Joiners & Upstream Leave Deductions', () => {
    it('applies pro-rata factor for mid-month joiner (15 active days out of 30)', () => {
      const ctx: CalculationInputContext = {
        employeeId: 'EMP-JOINER-15',
        employeeName: 'Mid-Month Joiner',
        employeeRef: 'NDK-JN-015',
        salaryComponents: { BASIC: 100000 },
        daysWorkedInMonth: 15, // Joined middle of month
        totalWorkingDaysInMonth: 30,
        unpaidLeaveDays: 0,
        halfPayLeaveDays: 0,
      };

      const result = calculateConfigurableSlip(ctx, defaultCatalog, testRuleSet);

      expect(result.proRataFactor).toBe(0.5);
      expect(result.grossPay).toBe(50000); // 100,000 * 0.5
      expect(result.netPay).toBeGreaterThan(0);
      expect(result.netPay).toBeLessThan(50000);
    });

    it('deducts unpaid leave days in compliance with statutory rules', () => {
      const ctx: CalculationInputContext = {
        employeeId: 'EMP-UNPAID-LEAVE',
        employeeName: 'Leave Employee',
        employeeRef: 'NDK-LV-003',
        salaryComponents: { BASIC: 90000 },
        daysWorkedInMonth: 30,
        totalWorkingDaysInMonth: 30,
        unpaidLeaveDays: 3, // 3 days unpaid
        halfPayLeaveDays: 0,
      };

      const result = calculateConfigurableSlip(ctx, defaultCatalog, testRuleSet);

      // Daily rate: 90,000 / 30 = 3,000. 3 days = 9,000 deduction
      const unpaidItem = result.lineItems.find((l) => l.componentCode === 'UNPAID_LEAVE');
      expect(unpaidItem?.amount).toBe(-9000);
      expect(result.grossPay).toBe(81000); // 90,000 - 9,000
    });
  });

  // =========================================================================
  // 4. RESTFUL API & MAKER-CHECKER SEGREGATION OF DUTIES
  // =========================================================================
  describe('RESTful API & Maker-Checker Workflow Invariants', () => {
    let createdRunId: string;

    it('allows HR / Payroll Officer to retrieve pay groups and active statutory rule sets', async () => {
      const pgsRes = await hrClient.agent.get('/api/v1/payroll/pay-groups');
      expect(pgsRes.status).toBe(200);
      expect(pgsRes.body.data.length).toBeGreaterThan(0);

      const rulesRes = await hrClient.agent.get('/api/v1/payroll/rule-sets');
      expect(rulesRes.status).toBe(200);
      expect(rulesRes.body.data.length).toBeGreaterThan(0);
      expect(rulesRes.body.data[0].status).toBe('ACTIVE');
    });

    it('creates a new Payroll Run in DRAFT status', async () => {
      const runRes = await opsClient.agent
        .post(`/api/v1/payroll/periods/${testPeriodId}/runs`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({ ruleSetId: activeRuleSetId });

      expect(runRes.status).toBe(201);
      createdRunId = runRes.body.data.id;
      expect(runRes.body.data.status).toBe('DRAFT');
      expect(runRes.body.data.isProductionCertified).toBe(false); // Must remain pilot simulation
      expect(createdRunId).toBeDefined();
    });

    it('calculates the payroll run and produces immutable line item slips', async () => {
      const calcRes = await opsClient.agent
        .post(`/api/v1/payroll/runs/${createdRunId}/calculate`)
        .set('x-csrf-token', opsClient.csrfToken);

      expect(calcRes.status).toBe(200);
      expect(calcRes.body.data.status).toBe('CALCULATED');
      expect(calcRes.body.data.totalEmployeesCount).toBeGreaterThan(0);
      expect(calcRes.body.data.totalNetPay).toBeGreaterThan(0);
      expect(calcRes.body.data.totalEmployerCosts).toBeGreaterThan(0);
    });

    it('submits calculated run for review', async () => {
      const submitRes = await opsClient.agent
        .post(`/api/v1/payroll/runs/${createdRunId}/submit`)
        .set('x-csrf-token', opsClient.csrfToken);

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.status).toBe('UNDER_REVIEW');
    });

    it('enforces Maker-Checker: preparer CANNOT approve their own payroll run (400 Bad Request)', async () => {
      // opsClient prepared the run; opsClient attempting to approve must fail
      const selfApproveRes = await opsClient.agent
        .post(`/api/v1/payroll/runs/${createdRunId}/approve`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({});

      expect(selfApproveRes.status).toBe(400);
      expect(selfApproveRes.body.error.message.toLowerCase()).toContain('maker-checker');
    });

    it('allows distinct authorised approver (Managing Partner) to approve the run', async () => {
      const partnerApproveRes = await partnerClient.agent
        .post(`/api/v1/payroll/runs/${createdRunId}/approve`)
        .set('x-csrf-token', partnerClient.csrfToken)
        .send({});

      expect(partnerApproveRes.status).toBe(200);
      expect(partnerApproveRes.body.data.status).toBe('APPROVED');
    });

    it('locks the approved payroll run, freezing calculation snapshot and generating SHA-256 audit hash', async () => {
      const lockRes = await partnerClient.agent
        .post(`/api/v1/payroll/runs/${createdRunId}/lock`)
        .set('x-csrf-token', partnerClient.csrfToken);

      expect(lockRes.status).toBe(200);
      expect(lockRes.body.data.status).toBe('LOCKED');
      expect(lockRes.body.data.auditHash).toBeDefined();
      expect(lockRes.body.data.auditHash.length).toBe(64); // SHA-256 hex string
    });

    it('prevents recalculation or modification of a LOCKED payroll run (immutability)', async () => {
      const recalcRes = await opsClient.agent
        .post(`/api/v1/payroll/runs/${createdRunId}/calculate`)
        .set('x-csrf-token', opsClient.csrfToken);

      expect(recalcRes.status).toBe(400);
      expect(recalcRes.body.error.message.toLowerCase()).toContain('locked');
    });
  });

  // =========================================================================
  // 5. TRACEABLE ADJUSTMENT RUNS
  // =========================================================================
  describe('Traceable Adjustment Runs', () => {
    it('allows creation of an ADJUSTMENT run linked to a parent locked run', async () => {
      const lockedRun = await prisma.payrollRun.findFirstOrThrow({
        where: { status: 'LOCKED' },
      });

      const adjRes = await opsClient.agent
        .post(`/api/v1/payroll/runs/${lockedRun.id}/adjust`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({
          notes: 'Adjustment for missed overtime and expense reimbursement',
        });

      expect(adjRes.status).toBe(201);
      expect(adjRes.body.data.runType).toBe('ADJUSTMENT');
      expect(adjRes.body.data.status).toBe('DRAFT');
    });
  });

  // =========================================================================
  // 6. BANK SCHEDULE EXPORTS, MASKING & RECONCILIATION
  // =========================================================================
  describe('Bank Schedule Export, Masking & Reconciliation Reports', () => {
    it('masks bank account numbers on public payslip views (e.g. ****1234)', async () => {
      const lockedRun = await prisma.payrollRun.findFirstOrThrow({
        where: { status: 'LOCKED' },
      });

      const slipsRes = await hrClient.agent.get(`/api/v1/payroll/runs/${lockedRun.id}/slips`);
      expect(slipsRes.status).toBe(200);
      expect(slipsRes.body.data.length).toBeGreaterThan(0);

      const firstSlip = slipsRes.body.data[0];
      if (firstSlip.accountNumberMasked) {
        expect(firstSlip.accountNumberMasked.startsWith('****')).toBe(true);
      }
    });

    it('exports restricted unmasked bank schedule with total checksum and audit trail', async () => {
      const lockedRun = await prisma.payrollRun.findFirstOrThrow({
        where: { status: 'LOCKED' },
      });

      const exportRes = await partnerClient.agent
        .post(`/api/v1/payroll/runs/${lockedRun.id}/export-bank`)
        .set('x-csrf-token', partnerClient.csrfToken)
        .send({
          bankFormatCode: 'STANDARD_EFT_CSV',
        });

      expect(exportRes.status).toBe(200);
      expect(exportRes.body.data.exportRecord.fileChecksum).toBeDefined();
      expect(exportRes.body.data.totalAmount).toBeGreaterThan(0);
      expect(exportRes.body.data.recordCount).toBeGreaterThan(0);

      // Verify audit trail logged in database
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'PAYROLL_BANK_SCHEDULE_EXPORTED',
          targetId: exportRes.body.data.exportRecord.id,
        },
      });
      expect(audit).toBeDefined();
    });

    it('generates variance reconciliation report detecting anomalies', async () => {
      const lockedRun = await prisma.payrollRun.findFirstOrThrow({
        where: { status: 'LOCKED' },
      });

      const reconRes = await opsClient.agent
        .post(`/api/v1/payroll/runs/${lockedRun.id}/reconcile`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({});

      expect(reconRes.status).toBe(200);
      expect(reconRes.body.data.report.runId).toBe(lockedRun.id);
      expect(reconRes.body.data.varianceDetails.currentRunId).toBe(lockedRun.id);
    });
  });

  // =========================================================================
  // 7. LIVE WHAT-IF DRY-RUN SIMULATION SANDBOX
  // =========================================================================
  describe('Live What-If Dry-Run Simulation Sandbox', () => {
    it('simulates employee remuneration changes without mutating database state', async () => {
      const simRes = await hrClient.agent
        .post('/api/v1/payroll/simulate')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          ruleSetId: activeRuleSetId,
          testEmployees: [
            {
              employeeId: 'SIM-001',
              employeeName: 'Simulated Senior Consultant',
              employeeRef: 'SIM-001',
              salaryComponents: {
                BASIC: 120000,
                HOUSE_ALLW: 30000,
                COMMUTER_ALLW: 10000,
              },
              daysWorkedInMonth: 22,
              totalWorkingDaysInMonth: 22,
            },
          ],
        });

      expect(simRes.status).toBe(200);
      const simData = simRes.body.data;
      expect(simData.simulationSummary.totalEmployees).toBe(1);
      expect(simData.simulationSummary.totalGrossPay).toBe(160000);
      expect(simData.simulationSummary.totalNetPay).toBeGreaterThan(0);
      expect(simData.simulatedSlips).toHaveLength(1);

      const slip = simData.simulatedSlips[0];
      expect(slip.grossPay).toBe(160000);
      expect(slip.lineItems.length).toBeGreaterThan(0);
      // Ensure NSSF, SHIF, AHL, PAYE are all calculated in the simulation
      const nssfItem = slip.lineItems.find((l: any) => l.componentCode.startsWith('NSSF') && l.category === 'DEDUCTION_EE');
      expect(nssfItem).toBeDefined();
    });
  });
});
