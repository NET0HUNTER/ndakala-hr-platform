// src/modules/payroll/service.ts
// Comprehensive Domain Service for Configurable Kenyan Payroll & Remuneration Architecture (R3)

import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { validation, forbidden, notFound, conflict } from '../../core/errors/errors.js';
import { decrypt } from '../../core/crypto/vault.js';
import {
  calculateConfigurableSlip,
  applyRounding,
  CalculationInputContext,
  ComponentDefinition,
  RuleDefinition,
} from './engine.js';
import { EvaluatedLineItem, SlipCalculationResult } from './types.js';

export class PayrollService {
  constructor(private prisma: PrismaClient) {}

  // =========================================================================
  // 1. PAY GROUPS MANAGEMENT
  // =========================================================================

  async listPayGroups() {
    return this.prisma.payrollPayGroup.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async createPayGroup(
    data: {
      code: string;
      name: string;
      payFrequency?: string;
      currency?: string;
      cutoffDay?: number;
      payDayRule?: string;
      payDayOffset?: number;
      workingDaysBasis?: string;
      prorationMethod?: string;
    },
    auditCtx: AuditContext
  ) {
    const existing = await this.prisma.payrollPayGroup.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      throw conflict(`Pay group with code '${data.code}' already exists.`);
    }

    const payGroup = await this.prisma.payrollPayGroup.create({
      data: {
        code: data.code.toUpperCase().trim(),
        name: data.name.trim(),
        payFrequency: data.payFrequency || 'MONTHLY',
        currency: data.currency || 'KES',
        cutoffDay: data.cutoffDay ?? 20,
        payDayRule: data.payDayRule || 'LAST_BUSINESS_DAY',
        payDayOffset: data.payDayOffset ?? 0,
        workingDaysBasis: data.workingDaysBasis || 'ACTUAL_WORKING_DAYS',
        prorationMethod: data.prorationMethod || 'WORKING_DAYS',
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PAYROLL_PAYGROUP_CREATED',
      targetType: 'PayrollPayGroup',
      targetId: payGroup.id,
      outcome: 'SUCCESS',
      after: { code: payGroup.code, name: payGroup.name },
    });

    return payGroup;
  }

  // =========================================================================
  // 2. SALARY COMPONENTS MASTER DATA
  // =========================================================================

  async listComponents() {
    return this.prisma.payrollComponent.findMany({
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async createComponent(
    data: {
      code: string;
      name: string;
      category: string;
      calculationType?: string;
      formulaExpression?: string;
      isPensionable?: boolean;
      isTaxable?: boolean;
      isSubjectToHousingLevy?: boolean;
      isSubjectToHealthLevy?: boolean;
      isProRataApplicable?: boolean;
      displayOrder?: number;
    },
    auditCtx: AuditContext
  ) {
    const code = data.code.toUpperCase().trim();
    const existing = await this.prisma.payrollComponent.findUnique({
      where: { code },
    });
    if (existing) {
      throw conflict(`Salary component '${code}' already exists.`);
    }

    const component = await this.prisma.payrollComponent.create({
      data: {
        code,
        name: data.name.trim(),
        category: data.category,
        calculationType: data.calculationType || 'FIXED_AMOUNT',
        formulaExpression: data.formulaExpression,
        isPensionable: data.isPensionable ?? true,
        isTaxable: data.isTaxable ?? true,
        isSubjectToHousingLevy: data.isSubjectToHousingLevy ?? true,
        isSubjectToHealthLevy: data.isSubjectToHealthLevy ?? true,
        isProRataApplicable: data.isProRataApplicable ?? true,
        displayOrder: data.displayOrder ?? 10,
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PAYROLL_COMPONENT_CREATED',
      targetType: 'PayrollComponent',
      targetId: component.id,
      outcome: 'SUCCESS',
      after: { code: component.code, category: component.category },
    });

    return component;
  }

  // =========================================================================
  // 3. EMPLOYEE SALARY ASSIGNMENTS (EFFECTIVE-DATED)
  // =========================================================================

  async assignEmployeeSalary(
    data: {
      employeeId: string;
      payGroupId?: string;
      effectiveDate: string | Date;
      components: Record<string, number>;
      changeReason?: string;
    },
    actorId: string,
    auditCtx: AuditContext
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!employee) throw notFound('Employee', data.employeeId);

    const componentsCatalog = await this.listComponents();
    const compMap = new Map(componentsCatalog.map((c) => [c.code, c]));

    let totalGrossSalary = 0;
    for (const [code, val] of Object.entries(data.components)) {
      const comp = compMap.get(code);
      if (!comp || comp.category === 'EARNING' || comp.category.startsWith('BENEFIT')) {
        totalGrossSalary += val;
      }
    }
    totalGrossSalary = applyRounding(totalGrossSalary, 'ROUND_HALF_UP');

    const effectiveDate = new Date(data.effectiveDate);

    // Supersede any existing approved assignment for this employee
    await this.prisma.employeeSalaryAssignment.updateMany({
      where: {
        employeeId: data.employeeId,
        status: 'APPROVED',
        endDate: null,
      },
      data: {
        status: 'SUPERSEDED',
        endDate: effectiveDate,
      },
    });

    const assignment = await this.prisma.employeeSalaryAssignment.create({
      data: {
        employeeId: data.employeeId,
        payGroupId: data.payGroupId,
        effectiveDate,
        status: 'APPROVED',
        currency: 'KES',
        components: JSON.stringify(data.components),
        totalGrossSalary,
        changeReason: data.changeReason || 'Initial salary assignment',
        proposedById: actorId,
        proposedAt: new Date(),
        approvedById: actorId,
        approvedAt: new Date(),
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PAYROLL_SALARY_ASSIGNED',
      targetType: 'EmployeeSalaryAssignment',
      targetId: assignment.id,
      outcome: 'SUCCESS',
      after: { employeeId: data.employeeId, totalGrossSalary },
    });

    return assignment;
  }

  async getEmployeeSalary(employeeId: string) {
    return this.prisma.employeeSalaryAssignment.findFirst({
      where: {
        employeeId,
        status: 'APPROVED',
      },
      orderBy: { effectiveDate: 'desc' },
      include: { payGroup: true },
    });
  }

  // =========================================================================
  // 4. STATUTORY RULE SETS & PARAMETERS (CONFIGURABLE STATUTORY ENGINE)
  // =========================================================================

  async listRuleSets() {
    return this.prisma.statutoryRuleSet.findMany({
      include: {
        rules: {
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRuleSet(id: string) {
    return this.prisma.statutoryRuleSet.findUnique({
      where: { id },
      include: {
        rules: {
          orderBy: { priority: 'asc' },
        },
      },
    });
  }

  async createRuleSet(
    data: {
      code: string;
      name: string;
      countryCode?: string;
      effectiveFrom: string | Date;
      description?: string;
      sourceDocument?: string;
      rules: Array<{
        code: string;
        name: string;
        category: string;
        algorithmType: string;
        parameters?: any;
        deductibleFromTaxablePay?: boolean;
        reliefPercentage?: number;
        reliefMaxMonthly?: number;
        isEmployeeDeduction?: boolean;
        isEmployerContribution?: boolean;
        roundingRule?: string;
        priority?: number;
      }>;
    },
    actorId: string,
    auditCtx: AuditContext
  ) {
    const existing = await this.prisma.statutoryRuleSet.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      throw conflict(`Rule set with code '${data.code}' already exists.`);
    }

    const ruleSet = await this.prisma.statutoryRuleSet.create({
      data: {
        code: data.code.toUpperCase().trim(),
        name: data.name.trim(),
        countryCode: data.countryCode || 'KE',
        currency: 'KES',
        effectiveFrom: new Date(data.effectiveFrom),
        status: 'DRAFT',
        version: '1.0',
        description: data.description,
        sourceDocument: data.sourceDocument,
        proposedById: actorId,
        proposedAt: new Date(),
        rules: {
          create: data.rules.map((r, idx) => ({
            code: r.code.toUpperCase().trim(),
            name: r.name.trim(),
            category: r.category,
            algorithmType: r.algorithmType,
            parameters: typeof r.parameters === 'string' ? r.parameters : JSON.stringify(r.parameters),
            deductibleFromTaxablePay: r.deductibleFromTaxablePay ?? false,
            reliefPercentage: r.reliefPercentage,
            reliefMaxMonthly: r.reliefMaxMonthly,
            isEmployeeDeduction: r.isEmployeeDeduction ?? true,
            isEmployerContribution: r.isEmployerContribution ?? false,
            roundingRule: r.roundingRule || 'ROUND_HALF_UP',
            priority: r.priority ?? (idx + 1) * 10,
          })),
        },
      },
      include: { rules: true },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PAYROLL_RULESET_CREATED',
      targetType: 'StatutoryRuleSet',
      targetId: ruleSet.id,
      outcome: 'SUCCESS',
      after: { code: ruleSet.code, rulesCount: ruleSet.rules.length },
    });

    return ruleSet;
  }

  async activateRuleSet(id: string, actorId: string, auditCtx: AuditContext) {
    const ruleSet = await this.getRuleSet(id);
    if (!ruleSet) throw notFound('StatutoryRuleSet', id);

    // Maker-checker invariant: Proposer cannot approve their own rule set
    if (ruleSet.proposedById && ruleSet.proposedById === actorId) {
      throw validation('Maker-checker violation: Rule set proposer cannot approve their own configuration.');
    }

    const rulesSnapshot = JSON.stringify(ruleSet.rules);

    // Supersede any existing active rule set for this country
    await this.prisma.statutoryRuleSet.updateMany({
      where: {
        countryCode: ruleSet.countryCode,
        status: 'ACTIVE',
        id: { not: id },
      },
      data: {
        status: 'SUPERSEDED',
        effectiveTo: new Date(),
      },
    });

    const updated = await this.prisma.statutoryRuleSet.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        isDefault: true,
        approvedById: actorId,
        approvedAt: new Date(),
        rulesSnapshot,
      },
      include: { rules: true },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PAYROLL_RULESET_ACTIVATED',
      targetType: 'StatutoryRuleSet',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { code: updated.code, version: updated.version },
    });

    return updated;
  }

  // =========================================================================
  // 5. PAYROLL PERIODS
  // =========================================================================

  async listPeriods(query?: { payGroupId?: string; fiscalYear?: number }) {
    const where: any = {};
    if (query?.payGroupId) where.payGroupId = query.payGroupId;
    if (query?.fiscalYear) where.fiscalYear = query.fiscalYear;

    return this.prisma.payrollPeriod.findMany({
      where,
      include: {
        payGroup: true,
        runs: {
          orderBy: { runNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'desc' }],
    });
  }

  async createPeriod(
    data: {
      payGroupId: string;
      periodNumber: number;
      fiscalYear: number;
      name: string;
      startDate: string | Date;
      endDate: string | Date;
      cutoffDate?: string | Date;
      payDate?: string | Date;
    },
    auditCtx: AuditContext
  ) {
    const payGroup = await this.prisma.payrollPayGroup.findUnique({
      where: { id: data.payGroupId },
    });
    if (!payGroup) throw notFound('PayrollPayGroup', data.payGroupId);

    const periodCode = `${data.fiscalYear}-${String(data.periodNumber).padStart(2, '0')}-${payGroup.code}`;
    const existing = await this.prisma.payrollPeriod.findUnique({
      where: {
        payGroupId_periodCode: {
          payGroupId: data.payGroupId,
          periodCode,
        },
      },
    });
    if (existing) {
      throw conflict(`Payroll period '${periodCode}' already exists.`);
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const cutoffDate = data.cutoffDate
      ? new Date(data.cutoffDate)
      : new Date(endDate.getFullYear(), endDate.getMonth(), payGroup.cutoffDay);
    const payDate = data.payDate ? new Date(data.payDate) : endDate;

    const period = await this.prisma.payrollPeriod.create({
      data: {
        payGroupId: data.payGroupId,
        periodCode,
        periodNumber: data.periodNumber,
        fiscalYear: data.fiscalYear,
        name: data.name,
        startDate,
        endDate,
        cutoffDate,
        payDate,
        status: 'DRAFT',
      },
      include: { payGroup: true },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PAYROLL_PERIOD_CREATED',
      targetType: 'PayrollPeriod',
      targetId: period.id,
      outcome: 'SUCCESS',
      after: { periodCode: period.periodCode },
    });

    return period;
  }

  // =========================================================================
  // 6. PAYROLL RUNS LIFECYCLE (DRAFT -> REVIEW -> APPROVED -> LOCKED)
  // =========================================================================

  async initiateRun(periodId: string, ruleSetId?: string, actorId: string = 'system', auditCtx?: AuditContext) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { payGroup: true },
    });
    if (!period) throw notFound('PayrollPeriod', periodId);
    if (period.status === 'LOCKED') throw validation('Cannot initiate a run for a locked period.');

    let targetRuleSet = null;
    if (ruleSetId) {
      targetRuleSet = await this.getRuleSet(ruleSetId);
    } else {
      targetRuleSet = await this.prisma.statutoryRuleSet.findFirst({
        where: { status: 'ACTIVE', isDefault: true },
        include: { rules: true },
      });
      if (!targetRuleSet) {
        targetRuleSet = await this.prisma.statutoryRuleSet.findFirst({
          where: { status: 'ACTIVE' },
          include: { rules: true },
        });
      }
    }

    if (!targetRuleSet) {
      throw validation('No active statutory rule set found. Please configure and activate a rule set first.');
    }

    const existingRunsCount = await this.prisma.payrollRun.count({
      where: { periodId },
    });

    const run = await this.prisma.payrollRun.create({
      data: {
        periodId,
        runNumber: existingRunsCount + 1,
        runType: 'STANDARD',
        status: 'DRAFT',
        ruleSetId: targetRuleSet.id,
        ruleSetSnapshot: JSON.stringify(targetRuleSet.rules),
        preparerId: actorId,
        preparedAt: new Date(),
        isProductionCertified: false,
      },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_RUN_INITIATED',
        targetType: 'PayrollRun',
        targetId: run.id,
        outcome: 'SUCCESS',
        after: { periodId, runNumber: run.runNumber },
      });
    }

    return run;
  }

  async listPeriodRuns(periodId: string) {
    return this.prisma.payrollRun.findMany({
      where: { periodId },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
      orderBy: { runNumber: 'desc' },
    });
  }

  async calculateRun(runId: string, actorId: string, auditCtx?: AuditContext) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: { include: { rules: true } },
      },
    });
    if (!run) throw notFound('PayrollRun', runId);
    if (run.status === 'LOCKED') throw validation('Cannot recalculate a locked payroll run.');

    const componentsCatalogRaw = await this.listComponents();
    const componentsCatalog: ComponentDefinition[] = componentsCatalogRaw.map((c) => ({
      code: c.code,
      name: c.name,
      category: c.category,
      isPensionable: c.isPensionable,
      isTaxable: c.isTaxable,
      isSubjectToHousingLevy: c.isSubjectToHousingLevy,
      isSubjectToHealthLevy: c.isSubjectToHealthLevy,
      isProRataApplicable: c.isProRataApplicable,
      displayOrder: c.displayOrder,
    }));

    let rules: RuleDefinition[] = [];
    try {
      rules = JSON.parse(run.ruleSetSnapshot);
    } catch (e) {
      rules = run.ruleSet.rules.map((r) => ({
        code: r.code,
        name: r.name,
        category: r.category,
        algorithmType: r.algorithmType,
        parameters: r.parameters,
        deductibleFromTaxablePay: r.deductibleFromTaxablePay,
        reliefPercentage: r.reliefPercentage,
        reliefMaxMonthly: r.reliefMaxMonthly,
        isEmployeeDeduction: r.isEmployeeDeduction,
        isEmployerContribution: r.isEmployerContribution,
        roundingRule: r.roundingRule,
        priority: r.priority,
        version: run.ruleSet.version,
      }));
    }

    const employees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      include: {
        department: true,
        position: true,
        agreements: {
          orderBy: { startDate: 'desc' },
          take: 1,
        },
        salaryAssignments: {
          where: { status: 'APPROVED' },
          orderBy: { effectiveDate: 'desc' },
          take: 1,
        },
      },
    });

    await this.prisma.payrollSlip.deleteMany({
      where: { runId },
    });

    let totalEmployeesCount = 0;
    let totalGrossPay = 0;
    let totalTaxablePay = 0;
    let totalNetPay = 0;
    let totalEmployeeDeductions = 0;
    let totalEmployerCosts = 0;
    let totalPAYE = 0;
    let totalNSSFEmployee = 0;
    let totalNSSFEmployer = 0;
    let totalSHIF = 0;
    let totalHousingLevyEmployee = 0;
    let totalHousingLevyEmployer = 0;
    let totalNITA = 0;

    const totalWorkingDaysInMonth = 22;

    for (const emp of employees) {
      const activeAssignment = emp.salaryAssignments[0];
      if (!activeAssignment) continue;

      let parsedComponents: Record<string, number> = {};
      try {
        parsedComponents = JSON.parse(activeAssignment.components);
      } catch (e) {
        parsedComponents = {};
      }

      // Check upstream HR inputs: Unpaid leave days
      const unpaidEntries = await this.prisma.leaveLedgerEntry.findMany({
        where: {
          employeeId: emp.id,
          entryType: 'LEAVE_TAKEN',
          createdAt: {
            gte: run.period.startDate,
            lte: run.period.endDate,
          },
        },
        include: { leaveType: true },
      });
      const unpaidLeaveDays = unpaidEntries
        .filter((e) => e.leaveType && !e.leaveType.isPaid)
        .reduce((sum, e) => sum + Math.abs(e.amountDays), 0);

      // Check hire date from agreement for joiner pro-rata
      let daysWorkedInMonth = totalWorkingDaysInMonth;
      const hireDate = emp.agreements[0]?.startDate;
      if (hireDate && hireDate > run.period.startDate && hireDate <= run.period.endDate) {
        const hireDay = hireDate.getDate();
        daysWorkedInMonth = Math.max(1, Math.round(totalWorkingDaysInMonth * ((30 - hireDay + 1) / 30)));
      }

      const bankName = emp.bankNameEncrypted ? decrypt(emp.bankNameEncrypted) : null;
      const bankBranch = emp.bankBranchEncrypted ? decrypt(emp.bankBranchEncrypted) : null;
      const bankAccount = emp.bankAccountNumberEncrypted ? decrypt(emp.bankAccountNumberEncrypted) : null;
      const kraPin = emp.kraPinEncrypted ? decrypt(emp.kraPinEncrypted) : null;
      const nssfNum = emp.nssfNumberEncrypted ? decrypt(emp.nssfNumberEncrypted) : null;
      const shifNum = emp.shifNumberEncrypted ? decrypt(emp.shifNumberEncrypted) : null;

      const inputContext: CalculationInputContext = {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeRef: emp.employeeNumber,
        departmentId: emp.departmentId || undefined,
        positionId: emp.positionId || undefined,
        bankName: bankName || undefined,
        bankBranch: bankBranch || undefined,
        accountNumber: bankAccount || undefined,
        kraPin: kraPin || undefined,
        nssfNumber: nssfNum || undefined,
        shifNumber: shifNum || undefined,
        salaryComponents: parsedComponents,
        daysWorkedInMonth,
        totalWorkingDaysInMonth,
        unpaidLeaveDays,
        halfPayLeaveDays: 0,
      };

      const result: SlipCalculationResult = calculateConfigurableSlip(inputContext, componentsCatalog, rules);

      const accountNumberMasked = bankAccount ? `****${bankAccount.slice(-4)}` : '****0000';
      const kraPinMasked = kraPin ? `${kraPin.slice(0, 3)}****${kraPin.slice(-1)}` : undefined;
      const nssfNumberMasked = nssfNum ? `****${nssfNum.slice(-4)}` : undefined;
      const shifNumberMasked = shifNum ? `****${shifNum.slice(-4)}` : undefined;

      await this.prisma.payrollSlip.create({
        data: {
          runId,
          periodId: run.periodId,
          employeeId: emp.id,
          employeeName: result.employeeName,
          employeeRef: result.employeeRef,
          departmentId: emp.departmentId,
          positionId: emp.positionId,
          bankName: bankName || 'Standard Bank',
          bankBranch: bankBranch || 'Nairobi',
          accountNumberMasked,
          kraPinMasked,
          nssfNumberMasked,
          shifNumberMasked,
          daysWorked: result.daysWorked,
          daysAbsent: result.daysAbsent,
          proRataFactor: result.proRataFactor,
          grossPay: result.grossPay,
          taxablePay: result.taxablePay,
          totalEmployeeDeductions: result.totalEmployeeDeductions,
          netPay: result.netPay,
          totalEmployerCosts: result.totalEmployerCosts,
          paymentStatus: 'PENDING',
          lineItems: {
            create: result.lineItems.map((li: EvaluatedLineItem) => ({
              componentCode: li.componentCode,
              componentName: li.componentName,
              category: li.category,
              amount: li.amount,
              isTaxable: li.isTaxable,
              isRelief: li.isRelief,
              sourceInput: li.sourceInput,
              formulaApplied: li.formulaApplied,
              ruleVersion: li.ruleVersion,
              displayOrder: li.displayOrder,
            })),
          },
        },
      });

      totalEmployeesCount++;
      totalGrossPay += result.grossPay;
      totalTaxablePay += result.taxablePay;
      totalNetPay += result.netPay;
      totalEmployeeDeductions += result.totalEmployeeDeductions;
      totalEmployerCosts += result.totalEmployerCosts;

      for (const li of result.lineItems) {
        if (li.componentCode === 'PAYE') totalPAYE += li.amount;
        if (li.componentCode === 'NSSF_EE') totalNSSFEmployee += li.amount;
        if (li.componentCode === 'NSSF_ER') totalNSSFEmployer += li.amount;
        if (li.componentCode === 'SHIF_EE') totalSHIF += li.amount;
        if (li.componentCode === 'AHL_EE') totalHousingLevyEmployee += li.amount;
        if (li.componentCode === 'AHL_ER') totalHousingLevyEmployer += li.amount;
        if (li.componentCode === 'NITA_ER') totalNITA += li.amount;
      }
    }

    const updatedRun = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'CALCULATED',
        totalEmployeesCount,
        totalGrossPay: applyRounding(totalGrossPay, 'ROUND_HALF_UP'),
        totalTaxablePay: applyRounding(totalTaxablePay, 'ROUND_HALF_UP'),
        totalNetPay: applyRounding(totalNetPay, 'ROUND_HALF_UP'),
        totalEmployeeDeductions: applyRounding(totalEmployeeDeductions, 'ROUND_HALF_UP'),
        totalEmployerCosts: applyRounding(totalEmployerCosts, 'ROUND_HALF_UP'),
        totalPAYE: applyRounding(totalPAYE, 'ROUND_HALF_UP'),
        totalNSSFEmployee: applyRounding(totalNSSFEmployee, 'ROUND_HALF_UP'),
        totalNSSFEmployer: applyRounding(totalNSSFEmployer, 'ROUND_HALF_UP'),
        totalSHIF: applyRounding(totalSHIF, 'ROUND_HALF_UP'),
        totalHousingLevyEmployee: applyRounding(totalHousingLevyEmployee, 'ROUND_HALF_UP'),
        totalHousingLevyEmployer: applyRounding(totalHousingLevyEmployer, 'ROUND_HALF_UP'),
        totalNITA: applyRounding(totalNITA, 'ROUND_HALF_UP'),
        preparedAt: new Date(),
      },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_RUN_CALCULATED',
        targetType: 'PayrollRun',
        targetId: runId,
        outcome: 'SUCCESS',
        after: { totalEmployeesCount, totalGrossPay, totalNetPay },
      });
    }

    return updatedRun;
  }

  async submitRunForReview(runId: string, actorId: string, auditCtx?: AuditContext) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw notFound('PayrollRun', runId);
    if (run.status !== 'CALCULATED') {
      throw validation(`Cannot submit run with status '${run.status}' for review. Run must be CALCULATED first.`);
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'UNDER_REVIEW',
        reviewerId: actorId,
        reviewedAt: new Date(),
      },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_RUN_SUBMITTED_FOR_REVIEW',
        targetType: 'PayrollRun',
        targetId: runId,
        outcome: 'SUCCESS',
      });
    }

    return updated;
  }

  async approveRun(runId: string, actorId: string, auditCtx?: AuditContext) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw notFound('PayrollRun', runId);
    if (run.status === 'LOCKED') throw validation('Run is already locked.');
    if (run.status === 'APPROVED') return run;

    // Maker-checker invariant
    if (run.preparerId && run.preparerId === actorId) {
      throw validation('Maker-checker violation: Payroll preparer cannot approve their own payroll run.');
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        approverId: actorId,
        approvedAt: new Date(),
      },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
    });

    await this.prisma.payrollPeriod.update({
      where: { id: run.periodId },
      data: { status: 'APPROVED' },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_RUN_APPROVED',
        targetType: 'PayrollRun',
        targetId: runId,
        outcome: 'SUCCESS',
        after: { approverId: actorId },
      });
    }

    return updated;
  }

  async lockRun(runId: string, actorId: string, auditCtx?: AuditContext) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { slips: true },
    });
    if (!run) throw notFound('PayrollRun', runId);
    if (run.status !== 'APPROVED') {
      throw validation(`Cannot lock payroll run with status '${run.status}'. Run must be APPROVED first.`);
    }

    const payloadToHash = JSON.stringify({
      id: run.id,
      periodId: run.periodId,
      totalGrossPay: run.totalGrossPay,
      totalNetPay: run.totalNetPay,
      totalEmployeeDeductions: run.totalEmployeeDeductions,
      totalEmployerCosts: run.totalEmployerCosts,
      slipsCount: run.slips.length,
      ruleSetSnapshot: run.ruleSetSnapshot,
    });
    const auditHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'LOCKED',
        lockedById: actorId,
        lockedAt: new Date(),
        auditHash,
      },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
    });

    await this.prisma.payrollPeriod.update({
      where: { id: run.periodId },
      data: { status: 'LOCKED' },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_RUN_LOCKED',
        targetType: 'PayrollRun',
        targetId: runId,
        outcome: 'SUCCESS',
        after: { auditHash },
      });
    }

    return updated;
  }

  async createAdjustmentRun(parentRunId: string, notes: string, actorId: string, auditCtx?: AuditContext) {
    const parentRun = await this.prisma.payrollRun.findUnique({
      where: { id: parentRunId },
      include: { period: true },
    });
    if (!parentRun) throw notFound('PayrollRun', parentRunId);
    if (parentRun.status !== 'LOCKED') {
      throw validation('Adjustments can only be initiated against a LOCKED payroll run.');
    }

    const existingRunsCount = await this.prisma.payrollRun.count({
      where: { periodId: parentRun.periodId },
    });

    const adjustmentRun = await this.prisma.payrollRun.create({
      data: {
        periodId: parentRun.periodId,
        runNumber: existingRunsCount + 1,
        runType: 'ADJUSTMENT',
        status: 'DRAFT',
        ruleSetId: parentRun.ruleSetId,
        ruleSetSnapshot: parentRun.ruleSetSnapshot,
        preparerId: actorId,
        preparedAt: new Date(),
        notes: `Adjustment Run linked to Run #${parentRun.runNumber}: ${notes}`,
        isProductionCertified: false,
      },
      include: {
        period: { include: { payGroup: true } },
        ruleSet: true,
      },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_ADJUSTMENT_RUN_CREATED',
        targetType: 'PayrollRun',
        targetId: adjustmentRun.id,
        outcome: 'SUCCESS',
        after: { parentRunId, notes },
      });
    }

    return adjustmentRun;
  }

  // =========================================================================
  // 7. PAYSLIPS & ACCESS CONTROL
  // =========================================================================

  async getEmployeePayslip(slipId: string, actorId: string, actorRoles: string[]) {
    const slip = await this.prisma.payrollSlip.findUnique({
      where: { id: slipId },
      include: {
        lineItems: { orderBy: { displayOrder: 'asc' } },
        run: { include: { period: true } },
        employee: true,
      },
    });
    if (!slip) throw notFound('PayrollSlip', slipId);

    const isExecutive =
      actorRoles.includes('managing_partner') ||
      actorRoles.includes('operations_director') ||
      actorRoles.includes('payroll_officer');
    if (!isExecutive && slip.employee.userId !== actorId) {
      throw forbidden("Access denied: You are not authorized to view another employee's payslip.");
    }

    return slip;
  }

  async listRunPayslips(runId: string) {
    return this.prisma.payrollSlip.findMany({
      where: { runId },
      include: {
        lineItems: { orderBy: { displayOrder: 'asc' } },
      },
      orderBy: { employeeName: 'asc' },
    });
  }

  // =========================================================================
  // 8. BANK SCHEDULE EXPORT & RECONCILIATION
  // =========================================================================

  async exportBankSchedule(runId: string, bankFormatCode: string = 'STANDARD_EFT_CSV', actorId: string, auditCtx?: AuditContext) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        period: true,
        slips: {
          where: { paymentStatus: 'PENDING' },
          orderBy: { employeeName: 'asc' },
        },
      },
    });
    if (!run) throw notFound('PayrollRun', runId);

    const rows = run.slips.map((s, idx) => ({
      recordId: idx + 1,
      employeeName: s.employeeName,
      employeeRef: s.employeeRef,
      bankName: s.bankName,
      bankBranch: s.bankBranch,
      accountNumberMasked: s.accountNumberMasked,
      netAmountKES: s.netPay,
      currency: 'KES',
      paymentReference: `SAL-${run.period.periodCode}-${s.employeeRef}`,
    }));

    const totalAmount = applyRounding(
      run.slips.reduce((sum, s) => sum + s.netPay, 0),
      'ROUND_HALF_UP'
    );
    const checksum = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');

    const exportRecord = await this.prisma.bankScheduleExport.create({
      data: {
        runId,
        bankFormatCode,
        totalAmount,
        recordCount: rows.length,
        exportedById: actorId,
        fileChecksum: checksum,
        maskedExportPayload: JSON.stringify(rows),
      },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_BANK_SCHEDULE_EXPORTED',
        targetType: 'BankScheduleExport',
        targetId: exportRecord.id,
        outcome: 'SUCCESS',
        after: { totalAmount, recordCount: rows.length, checksum },
      });
    }

    const csvHeader = [
      'RecordID',
      'EmployeeName',
      'EmployeeRef',
      'BankName',
      'BankBranch',
      'AccountNumberMasked',
      'NetAmountKES',
      'Currency',
      'PaymentReference',
    ];
    const escapeCsv = (val: unknown) => {
      const s = String(val ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvContent = [
      csvHeader.join(','),
      ...rows.map((r) =>
        [
          r.recordId,
          r.employeeName,
          r.employeeRef,
          r.bankName,
          r.bankBranch,
          r.accountNumberMasked,
          r.netAmountKES.toFixed(2),
          r.currency,
          r.paymentReference,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ].join('\n');
    const fileName = `eft-${run.period.periodCode}-run${run.runNumber}.csv`;

    return {
      exportRecord,
      scheduleRows: rows,
      totalAmount,
      recordCount: rows.length,
      csvContent,
      fileName,
      notice:
        'Bank transfer schedule exported. Manual upload to corporate banking portal required; direct automated API disbursement is disabled by security policy.',
    };
  }

  async generateReconciliationReport(runId: string, comparisonRunId?: string, actorId: string = 'system', auditCtx?: AuditContext) {
    const currentRun = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { period: true, slips: true },
    });
    if (!currentRun) throw notFound('PayrollRun', runId);

    let comparisonRun = null;
    if (comparisonRunId) {
      comparisonRun = await this.prisma.payrollRun.findUnique({
        where: { id: comparisonRunId },
        include: { period: true, slips: true },
      });
    }

    const grossVariance = comparisonRun
      ? applyRounding(currentRun.totalGrossPay - comparisonRun.totalGrossPay, 'ROUND_HALF_UP')
      : 0;
    const netVariance = comparisonRun
      ? applyRounding(currentRun.totalNetPay - comparisonRun.totalNetPay, 'ROUND_HALF_UP')
      : 0;
    const deductionsVariance = comparisonRun
      ? applyRounding(currentRun.totalEmployeeDeductions - comparisonRun.totalEmployeeDeductions, 'ROUND_HALF_UP')
      : 0;
    const employerCostVariance = comparisonRun
      ? applyRounding(currentRun.totalEmployerCosts - comparisonRun.totalEmployerCosts, 'ROUND_HALF_UP')
      : 0;

    const exceptionsList: string[] = [];
    for (const slip of currentRun.slips) {
      if (slip.netPay <= 0) {
        exceptionsList.push(`Negative or zero net pay for ${slip.employeeName} (KES ${slip.netPay.toFixed(2)})`);
      }
      if (!slip.bankName || slip.accountNumberMasked === '****0000') {
        exceptionsList.push(`Missing valid bank account details for ${slip.employeeName}`);
      }
    }

    const varianceDetails = {
      currentRunId: currentRun.id,
      currentPeriod: currentRun.period.periodCode,
      comparisonRunId: comparisonRun?.id || null,
      comparisonPeriod: comparisonRun?.period.periodCode || null,
      gross: {
        current: currentRun.totalGrossPay,
        comparison: comparisonRun?.totalGrossPay || 0,
        variance: grossVariance,
      },
      net: {
        current: currentRun.totalNetPay,
        comparison: comparisonRun?.totalNetPay || 0,
        variance: netVariance,
      },
      deductions: {
        current: currentRun.totalEmployeeDeductions,
        comparison: comparisonRun?.totalEmployeeDeductions || 0,
        variance: deductionsVariance,
      },
      employerCosts: {
        current: currentRun.totalEmployerCosts,
        comparison: comparisonRun?.totalEmployerCosts || 0,
        variance: employerCostVariance,
      },
      statutoryLiabilities: {
        paye: currentRun.totalPAYE,
        nssfTotal: applyRounding(currentRun.totalNSSFEmployee + currentRun.totalNSSFEmployer, 'ROUND_HALF_UP'),
        shifTotal: currentRun.totalSHIF,
        housingLevyTotal: applyRounding(
          currentRun.totalHousingLevyEmployee + currentRun.totalHousingLevyEmployer,
          'ROUND_HALF_UP'
        ),
        nitaTotal: currentRun.totalNITA,
        totalStatutoryObligations: applyRounding(
          currentRun.totalPAYE +
            currentRun.totalNSSFEmployee +
            currentRun.totalNSSFEmployer +
            currentRun.totalSHIF +
            currentRun.totalHousingLevyEmployee +
            currentRun.totalHousingLevyEmployer +
            currentRun.totalNITA,
          'ROUND_HALF_UP'
        ),
      },
    };

    const report = await this.prisma.payrollReconciliationReport.create({
      data: {
        runId,
        comparisonRunId,
        totalGrossVariance: grossVariance,
        totalNetVariance: netVariance,
        totalDeductionsVariance: deductionsVariance,
        totalEmployerCostVariance: employerCostVariance,
        varianceDetails: JSON.stringify(varianceDetails),
        exceptionsCount: exceptionsList.length,
        exceptionsList: JSON.stringify(exceptionsList),
        generatedById: actorId,
      },
    });

    if (auditCtx) {
      await writeAudit(this.prisma, auditCtx, {
        action: 'PAYROLL_RECONCILIATION_GENERATED',
        targetType: 'PayrollReconciliationReport',
        targetId: report.id,
        outcome: 'SUCCESS',
        after: { runId, exceptionsCount: exceptionsList.length },
      });
    }

    return {
      report,
      varianceDetails,
      exceptionsList,
    };
  }

  // =========================================================================
  // 9. LIVE WHAT-IF SIMULATION SANDBOX
  // =========================================================================

  async simulatePayroll(data: {
    ruleSetId?: string;
    customRuleSet?: {
      name: string;
      rules: any[];
    };
    testEmployees: Array<{
      employeeId: string;
      employeeName: string;
      employeeRef: string;
      salaryComponents: Record<string, number>;
      daysWorkedInMonth?: number;
      totalWorkingDaysInMonth?: number;
    }>;
  }) {
    const componentsCatalogRaw = await this.listComponents();
    const componentsCatalog: ComponentDefinition[] = componentsCatalogRaw.map((c) => ({
      code: c.code,
      name: c.name,
      category: c.category,
      isPensionable: c.isPensionable,
      isTaxable: c.isTaxable,
      isSubjectToHousingLevy: c.isSubjectToHousingLevy,
      isSubjectToHealthLevy: c.isSubjectToHealthLevy,
      isProRataApplicable: c.isProRataApplicable,
      displayOrder: c.displayOrder,
    }));

    let rules: RuleDefinition[] = [];
    if (data.customRuleSet?.rules) {
      rules = data.customRuleSet.rules.map((r: any, idx: number) => ({
        code: r.code,
        name: r.name,
        category: r.category,
        algorithmType: r.algorithmType,
        parameters: typeof r.parameters === 'string' ? r.parameters : JSON.stringify(r.parameters),
        deductibleFromTaxablePay: r.deductibleFromTaxablePay ?? false,
        reliefPercentage: r.reliefPercentage,
        reliefMaxMonthly: r.reliefMaxMonthly,
        isEmployeeDeduction: r.isEmployeeDeduction ?? true,
        isEmployerContribution: r.isEmployerContribution ?? false,
        roundingRule: r.roundingRule || 'ROUND_HALF_UP',
        priority: r.priority ?? (idx + 1) * 10,
        version: 'SIMULATION',
      }));
    } else if (data.ruleSetId) {
      const rs = await this.getRuleSet(data.ruleSetId);
      if (rs) {
        rules = rs.rules.map((r) => ({
          code: r.code,
          name: r.name,
          category: r.category,
          algorithmType: r.algorithmType,
          parameters: r.parameters,
          deductibleFromTaxablePay: r.deductibleFromTaxablePay,
          reliefPercentage: r.reliefPercentage,
          reliefMaxMonthly: r.reliefMaxMonthly,
          isEmployeeDeduction: r.isEmployeeDeduction,
          isEmployerContribution: r.isEmployerContribution,
          roundingRule: r.roundingRule,
          priority: r.priority,
          version: rs.version,
        }));
      }
    }

    const simulatedSlips = data.testEmployees.map((emp) => {
      const ctx: CalculationInputContext = {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        employeeRef: emp.employeeRef,
        salaryComponents: emp.salaryComponents,
        daysWorkedInMonth: emp.daysWorkedInMonth ?? 22,
        totalWorkingDaysInMonth: emp.totalWorkingDaysInMonth ?? 22,
        unpaidLeaveDays: 0,
        halfPayLeaveDays: 0,
      };
      return calculateConfigurableSlip(ctx, componentsCatalog, rules);
    });

    const summary = {
      totalEmployees: simulatedSlips.length,
      totalGrossPay: applyRounding(
        simulatedSlips.reduce((sum, s) => sum + s.grossPay, 0),
        'ROUND_HALF_UP'
      ),
      totalNetPay: applyRounding(
        simulatedSlips.reduce((sum, s) => sum + s.netPay, 0),
        'ROUND_HALF_UP'
      ),
      totalEmployeeDeductions: applyRounding(
        simulatedSlips.reduce((sum, s) => sum + s.totalEmployeeDeductions, 0),
        'ROUND_HALF_UP'
      ),
      totalEmployerCosts: applyRounding(
        simulatedSlips.reduce((sum, s) => sum + s.totalEmployerCosts, 0),
        'ROUND_HALF_UP'
      ),
    };

    return {
      simulationSummary: summary,
      simulatedSlips,
      notice: 'In-memory what-if dry run simulation. Database records and active payroll remain unaffected.',
    };
  }
}
