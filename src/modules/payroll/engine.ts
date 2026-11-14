// src/modules/payroll/engine.ts
// Deterministic, Configurable Calculation Engine for Kenyan & Multi-Country Payroll (R3)

import {
  RoundingMethod,
  TieredBracketsParams,
  TieredPensionCapsParams,
  PercentageOfGrossParams,
  FixedPerEmployeeParams,
  EvaluatedLineItem,
  SlipCalculationResult,
} from './types.js';

export function applyRounding(value: number, method: RoundingMethod = 'ROUND_HALF_UP'): number {
  switch (method) {
    case 'TWO_DECIMALS':
      return parseFloat(value.toFixed(2));
    case 'NEAREST_INTEGER':
      return Math.round(value);
    case 'FLOOR':
      return Math.floor(value * 100) / 100;
    case 'CEIL':
      return Math.ceil(value * 100) / 100;
    case 'ROUND_HALF_UP':
    default:
      return Math.round(value * 100) / 100;
  }
}

/**
 * 1. TIERED BRACKETS ALGORITHM (e.g. Kenya PAYE 5-tier progressive tax)
 */
export function calculateTieredBrackets(
  taxableIncome: number,
  params: TieredBracketsParams,
  reliefEligibleContributions: number = 0,
  rounding: RoundingMethod = 'ROUND_HALF_UP'
): {
  grossTax: number;
  personalRelief: number;
  insuranceRelief: number;
  netTax: number;
  bandBreakdown: Array<{ bandOrder: number; slice: number; rate: number; tax: number }>;
} {
  if (taxableIncome <= 0) {
    return { grossTax: 0, personalRelief: 0, insuranceRelief: 0, netTax: 0, bandBreakdown: [] };
  }

  const sortedBands = [...params.bands].sort((a, b) => a.order - b.order);
  let cumulativeTax = 0;
  const bandBreakdown: Array<{ bandOrder: number; slice: number; rate: number; tax: number }> = [];

  for (const band of sortedBands) {
    const bandFrom = band.from !== undefined ? band.from : ((band as any).lowerLimit ?? 0);
    const rawTo = band.to !== undefined ? band.to : (band as any).upperLimit;
    const bandTo = rawTo !== null && rawTo !== undefined ? rawTo : Infinity;

    if (taxableIncome > bandFrom) {
      const slice = Math.min(taxableIncome, bandTo) - bandFrom;
      const tax = slice * band.rate;
      cumulativeTax += tax;
      bandBreakdown.push({
        bandOrder: band.order,
        slice: applyRounding(slice, rounding),
        rate: band.rate,
        tax: applyRounding(tax, rounding),
      });
    }
  }

  const grossTax = applyRounding(cumulativeTax, rounding);
  const personalRelief = applyRounding(params.personalReliefMonthly || 0, rounding);

  let insuranceRelief = 0;
  const reliefRate = params.insuranceReliefPercentage ?? (params as any).insuranceReliefRate;
  if (reliefEligibleContributions > 0 && reliefRate) {
    const rawRelief = reliefEligibleContributions * reliefRate;
    const maxMonthlyRelief = params.insuranceReliefMaxMonthly ?? 5000;
    insuranceRelief = applyRounding(Math.min(rawRelief, maxMonthlyRelief), rounding);
  }

  const netTax = Math.max(0, applyRounding(grossTax - personalRelief - insuranceRelief, rounding));

  return {
    grossTax,
    personalRelief,
    insuranceRelief,
    netTax,
    bandBreakdown,
  };
}

/**
 * 2. TIERED PENSION CAPS ALGORITHM (e.g. NSSF Act 2013 Year 4)
 */
export function calculateTieredPension(
  pensionableEarnings: number,
  params: TieredPensionCapsParams,
  rounding: RoundingMethod = 'ROUND_HALF_UP'
): {
  tier1Employee: number;
  tier1Employer: number;
  tier2Employee: number;
  tier2Employer: number;
  totalEmployee: number;
  totalEmployer: number;
} {
  if (pensionableEarnings <= 0) {
    return {
      tier1Employee: 0,
      tier1Employer: 0,
      tier2Employee: 0,
      tier2Employer: 0,
      totalEmployee: 0,
      totalEmployer: 0,
    };
  }

  const lel = params.lowerEarningsLimit;
  const uel = params.upperEarningsLimit;

  // Tier 1 calculation: 6% on earnings up to LEL (max 9,000 in Year 4)
  const tier1Earnings = Math.min(pensionableEarnings, lel);
  let tier1EE = tier1Earnings * params.employeeRate;
  let tier1ER = tier1Earnings * params.employerRate;
  if (params.tier1MaxEmployee !== undefined) tier1EE = Math.min(tier1EE, params.tier1MaxEmployee);
  if (params.tier1MaxEmployer !== undefined) tier1ER = Math.min(tier1ER, params.tier1MaxEmployer);

  // Tier 2 calculation: 6% on earnings between LEL and UEL (between 9,000 and 108,000 in Year 4)
  const tier2Earnings = Math.max(0, Math.min(pensionableEarnings, uel) - lel);
  let tier2EE = tier2Earnings * params.employeeRate;
  let tier2ER = tier2Earnings * params.employerRate;
  if (params.tier2MaxEmployee !== undefined) tier2EE = Math.min(tier2EE, params.tier2MaxEmployee);
  if (params.tier2MaxEmployer !== undefined) tier2ER = Math.min(tier2ER, params.tier2MaxEmployer);

  let totalEE = tier1EE + tier2EE;
  let totalER = tier1ER + tier2ER;
  if (params.totalMaxEmployee !== undefined) totalEE = Math.min(totalEE, params.totalMaxEmployee);
  if (params.totalMaxEmployer !== undefined) totalER = Math.min(totalER, params.totalMaxEmployer);

  return {
    tier1Employee: applyRounding(tier1EE, rounding),
    tier1Employer: applyRounding(tier1ER, rounding),
    tier2Employee: applyRounding(tier2EE, rounding),
    tier2Employer: applyRounding(tier2ER, rounding),
    totalEmployee: applyRounding(totalEE, rounding),
    totalEmployer: applyRounding(totalER, rounding),
  };
}

/**
 * 3. PERCENTAGE OF GROSS ALGORITHM (e.g. SHIF 2.75%, Affordable Housing Levy 1.5%)
 */
export function calculatePercentageOfGross(
  grossEarnings: number,
  params: PercentageOfGrossParams,
  rounding: RoundingMethod = 'ROUND_HALF_UP'
): {
  employeeAmount: number;
  employerAmount: number;
} {
  if (grossEarnings <= 0) {
    return { employeeAmount: 0, employerAmount: 0 };
  }

  let eeAmount = grossEarnings * params.employeeRate;
  let erAmount = grossEarnings * params.employerRate;

  if (params.minAmount !== undefined) {
    eeAmount = Math.max(params.minAmount, eeAmount);
  }
  if (params.maxAmount !== undefined) {
    eeAmount = Math.min(params.maxAmount, eeAmount);
    erAmount = Math.min(params.maxAmount, erAmount);
  }

  return {
    employeeAmount: applyRounding(eeAmount, rounding),
    employerAmount: applyRounding(erAmount, rounding),
  };
}

/**
 * 4. FIXED PER EMPLOYEE ALGORITHM (e.g. NITA KES 50)
 */
export function calculateFixedPerEmployee(
  params: FixedPerEmployeeParams,
  rounding: RoundingMethod = 'ROUND_HALF_UP'
): {
  employeeAmount: number;
  employerAmount: number;
} {
  const rounded = applyRounding(params.amount, rounding);
  return {
    employeeAmount: params.payer === 'EMPLOYEE' ? rounded : 0,
    employerAmount: params.payer === 'EMPLOYER' ? rounded : 0,
  };
}

export interface CalculationInputContext {
  employeeId: string;
  employeeName: string;
  employeeRef: string;
  departmentId?: string;
  positionId?: string;
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  kraPin?: string;
  nssfNumber?: string;
  shifNumber?: string;
  // Salary assignment components
  salaryComponents: Record<string, number>; // code -> monthly amount
  // Days & Absence
  daysWorkedInMonth: number;
  totalWorkingDaysInMonth: number;
  unpaidLeaveDays: number;
  halfPayLeaveDays: number;
  // Additional one-off allowances/adjustments
  oneOffEarnings?: Record<string, number>;
  oneOffDeductions?: Record<string, number>;
}

export interface RuleDefinition {
  code: string;
  name: string;
  category: string;
  algorithmType: string;
  parameters: string; // JSON
  deductibleFromTaxablePay: boolean;
  reliefPercentage?: number | null;
  reliefMaxMonthly?: number | null;
  isEmployeeDeduction: boolean;
  isEmployerContribution: boolean;
  roundingRule: string;
  priority: number;
  version?: string;
}

export interface ComponentDefinition {
  code: string;
  name: string;
  category: string;
  isPensionable: boolean;
  isTaxable: boolean;
  isSubjectToHousingLevy: boolean;
  isSubjectToHealthLevy: boolean;
  isProRataApplicable: boolean;
  displayOrder: number;
}

/**
 * 5. COMPLETE CONFIGURABLE SLIP ORCHESTRATOR
 * Executes entirely from database-configured rules and master components.
 */
export function calculateConfigurableSlip(
  ctx: CalculationInputContext,
  componentsCatalog: ComponentDefinition[],
  activeRules: RuleDefinition[]
): SlipCalculationResult {
  const lineItems: EvaluatedLineItem[] = [];
  const compMap = new Map(componentsCatalog.map((c) => [c.code, c]));

  // Pro-rata factor
  const totalWorkingDays = Math.max(1, ctx.totalWorkingDaysInMonth || 22);
  const daysWorked = Math.max(0, Math.min(totalWorkingDays, ctx.daysWorkedInMonth));
  const proRataFactor = applyRounding(daysWorked / totalWorkingDays, 'TWO_DECIMALS');

  // Step 1: Evaluate Contractual Earnings & Benefits
  let basicSalary = 0;
  let totalGrossPay = 0;
  let totalPensionable = 0;

  for (const [code, amount] of Object.entries(ctx.salaryComponents)) {
    const compDef = compMap.get(code);
    const compName = compDef?.name || code;
    const isEarning = compDef ? compDef.category === 'EARNING' || compDef.category.startsWith('BENEFIT') : true;

    if (isEarning && amount > 0) {
      // Apply pro-rata if configured for mid-month joiner/leaver
      let finalAmount = amount;
      let formula = `Contractual ${code}: ${amount.toFixed(2)}`;
      if (compDef?.isProRataApplicable && proRataFactor < 1.0) {
        finalAmount = applyRounding(amount * proRataFactor, 'ROUND_HALF_UP');
        formula += ` * Pro-Rata Factor (${daysWorked}/${totalWorkingDays} = ${proRataFactor})`;
      }

      if (code === 'BASIC') {
        basicSalary = finalAmount;
      }

      totalGrossPay += finalAmount;
      if (compDef?.isPensionable ?? true) {
        totalPensionable += finalAmount;
      }

      lineItems.push({
        componentCode: code,
        componentName: compName,
        category: compDef?.category.startsWith('BENEFIT') ? 'BENEFIT' : 'EARNING',
        amount: finalAmount,
        isTaxable: compDef?.isTaxable ?? true,
        isRelief: false,
        sourceInput: 'SALARY_ASSIGNMENT',
        formulaApplied: formula,
        displayOrder: compDef?.displayOrder ?? 10,
      });
    }
  }

  // Add one-off earnings
  if (ctx.oneOffEarnings) {
    for (const [code, amount] of Object.entries(ctx.oneOffEarnings)) {
      if (amount > 0) {
        totalGrossPay += amount;
        lineItems.push({
          componentCode: code,
          componentName: compMap.get(code)?.name || code,
          category: 'EARNING',
          amount: applyRounding(amount, 'ROUND_HALF_UP'),
          isTaxable: true,
          isRelief: false,
          sourceInput: 'ONE_OFF_INPUT',
          formulaApplied: `One-Off Earning: ${amount.toFixed(2)}`,
          displayOrder: 25,
        });
      }
    }
  }

  // Step 1b: Unpaid and Half-Pay Leave Deductions (Phase 3 Integration)
  const dailyBasicRate = basicSalary > 0 ? applyRounding(basicSalary / totalWorkingDays, 'ROUND_HALF_UP') : 0;
  if (ctx.unpaidLeaveDays > 0 && dailyBasicRate > 0) {
    const unpaidDeduction = applyRounding(dailyBasicRate * ctx.unpaidLeaveDays, 'ROUND_HALF_UP');
    totalGrossPay = Math.max(0, totalGrossPay - unpaidDeduction);
    lineItems.push({
      componentCode: 'UNPAID_LEAVE',
      componentName: 'Unpaid Leave Deduction',
      category: 'DEDUCTION_EE',
      amount: -unpaidDeduction,
      isTaxable: false,
      isRelief: false,
      sourceInput: 'LEAVE_LEDGER_UNPAID',
      formulaApplied: `${ctx.unpaidLeaveDays} Days * Daily Rate (${dailyBasicRate.toFixed(2)})`,
      displayOrder: 28,
    });
  }

  if (ctx.halfPayLeaveDays > 0 && dailyBasicRate > 0) {
    const halfPayDeduction = applyRounding((dailyBasicRate * 0.5) * ctx.halfPayLeaveDays, 'ROUND_HALF_UP');
    totalGrossPay = Math.max(0, totalGrossPay - halfPayDeduction);
    lineItems.push({
      componentCode: 'HALF_PAY_LEAVE',
      componentName: 'Half-Pay Sick Leave Deduction',
      category: 'DEDUCTION_EE',
      amount: -halfPayDeduction,
      isTaxable: false,
      isRelief: false,
      sourceInput: 'LEAVE_LEDGER_HALF_PAY',
      formulaApplied: `${ctx.halfPayLeaveDays} Days * 50% Daily Rate (${(dailyBasicRate * 0.5).toFixed(2)})`,
      displayOrder: 29,
    });
  }

  totalGrossPay = applyRounding(totalGrossPay, 'ROUND_HALF_UP');

  // Step 2: Evaluate Statutory Rules in Priority Order
  const sortedRules = [...activeRules].sort((a, b) => a.priority - b.priority);

  let totalEmployeeDeductions = 0;
  let totalEmployerCosts = totalGrossPay;
  let allowableDeductionsForTax = 0;
  let insuranceReliefEligibleContributions = 0;

  // Find tax rule if any
  const taxRule = sortedRules.find((r) => r.category === 'INCOME_TAX');
  const nonTaxRules = sortedRules.filter((r) => r.category !== 'INCOME_TAX');

  for (const rule of nonTaxRules) {
    const rounding = (rule.roundingRule as RoundingMethod) || 'ROUND_HALF_UP';
    let params: any = {};
    try {
      params = typeof rule.parameters === 'string' ? JSON.parse(rule.parameters) : rule.parameters;
    } catch (e) {
      params = {};
    }

    if (rule.algorithmType === 'TIERED_PENSION_CAPS') {
      const pensionBase = totalPensionable > 0 ? totalPensionable : totalGrossPay;
      const res = calculateTieredPension(pensionBase, params, rounding);

      if (rule.isEmployeeDeduction && res.totalEmployee > 0) {
        totalEmployeeDeductions += res.totalEmployee;
        if (rule.deductibleFromTaxablePay) {
          allowableDeductionsForTax += res.totalEmployee;
        }
        lineItems.push({
          componentCode: `${rule.code}_EE`,
          componentName: `${rule.name} (Employee)`,
          category: 'DEDUCTION_EE',
          amount: res.totalEmployee,
          isTaxable: false,
          isRelief: false,
          sourceInput: 'STATUTORY_RULE',
          formulaApplied: `Tier 1: ${res.tier1Employee.toFixed(2)} + Tier 2: ${res.tier2Employee.toFixed(2)}`,
          ruleVersion: rule.version,
          displayOrder: 40,
        });
      }

      if (rule.isEmployerContribution && res.totalEmployer > 0) {
        totalEmployerCosts += res.totalEmployer;
        lineItems.push({
          componentCode: `${rule.code}_ER`,
          componentName: `${rule.name} (Employer Match)`,
          category: 'CONTRIBUTION_ER',
          amount: res.totalEmployer,
          isTaxable: false,
          isRelief: false,
          sourceInput: 'STATUTORY_RULE',
          formulaApplied: `Tier 1: ${res.tier1Employer.toFixed(2)} + Tier 2: ${res.tier2Employer.toFixed(2)} (Employer Operational Cost)`,
          ruleVersion: rule.version,
          displayOrder: 80,
        });
      }
    } else if (rule.algorithmType === 'PERCENTAGE_OF_GROSS') {
      const res = calculatePercentageOfGross(totalGrossPay, params, rounding);

      if (rule.isEmployeeDeduction && res.employeeAmount > 0) {
        totalEmployeeDeductions += res.employeeAmount;
        if (rule.deductibleFromTaxablePay) {
          allowableDeductionsForTax += res.employeeAmount;
        }
        if (rule.category === 'HEALTH_INSURANCE' || (rule.reliefPercentage && rule.reliefPercentage > 0)) {
          insuranceReliefEligibleContributions += res.employeeAmount;
        }

        lineItems.push({
          componentCode: `${rule.code}_EE`,
          componentName: `${rule.name} (Employee)`,
          category: 'DEDUCTION_EE',
          amount: res.employeeAmount,
          isTaxable: false,
          isRelief: false,
          sourceInput: 'STATUTORY_RULE',
          formulaApplied: `${(params.employeeRate * 100).toFixed(2)}% of Gross (${totalGrossPay.toFixed(2)})`,
          ruleVersion: rule.version,
          displayOrder: 45,
        });
      }

      if (rule.isEmployerContribution && res.employerAmount > 0) {
        totalEmployerCosts += res.employerAmount;
        lineItems.push({
          componentCode: `${rule.code}_ER`,
          componentName: `${rule.name} (Employer Match)`,
          category: 'CONTRIBUTION_ER',
          amount: res.employerAmount,
          isTaxable: false,
          isRelief: false,
          sourceInput: 'STATUTORY_RULE',
          formulaApplied: `${(params.employerRate * 100).toFixed(2)}% of Gross (${totalGrossPay.toFixed(2)}) (Employer Operational Cost)`,
          ruleVersion: rule.version,
          displayOrder: 85,
        });
      }
    } else if (rule.algorithmType === 'FIXED_PER_EMPLOYEE') {
      const res = calculateFixedPerEmployee(params, rounding);

      if (rule.isEmployerContribution && res.employerAmount > 0) {
        totalEmployerCosts += res.employerAmount;
        lineItems.push({
          componentCode: `${rule.code}_ER`,
          componentName: `${rule.name} (Employer)`,
          category: 'CONTRIBUTION_ER',
          amount: res.employerAmount,
          isTaxable: false,
          isRelief: false,
          sourceInput: 'STATUTORY_RULE',
          formulaApplied: `Flat Statutory Levy: ${res.employerAmount.toFixed(2)} (Employer Operational Cost)`,
          ruleVersion: rule.version,
          displayOrder: 90,
        });
      }

      if (rule.isEmployeeDeduction && res.employeeAmount > 0) {
        totalEmployeeDeductions += res.employeeAmount;
        lineItems.push({
          componentCode: `${rule.code}_EE`,
          componentName: `${rule.name} (Employee)`,
          category: 'DEDUCTION_EE',
          amount: res.employeeAmount,
          isTaxable: false,
          isRelief: false,
          sourceInput: 'STATUTORY_RULE',
          formulaApplied: `Flat Employee Deduction: ${res.employeeAmount.toFixed(2)}`,
          ruleVersion: rule.version,
          displayOrder: 50,
        });
      }
    }
  }

  // Step 3: Compute Taxable Pay & PAYE
  const taxablePay = Math.max(0, applyRounding(totalGrossPay - allowableDeductionsForTax, 'ROUND_HALF_UP'));

  if (taxRule) {
    let taxParams: TieredBracketsParams = { bands: [] };
    try {
      taxParams = typeof taxRule.parameters === 'string' ? JSON.parse(taxRule.parameters) : taxRule.parameters;
    } catch (e) {}

    const taxRounding = (taxRule.roundingRule as RoundingMethod) || 'ROUND_HALF_UP';
    const taxRes = calculateTieredBrackets(taxablePay, taxParams, insuranceReliefEligibleContributions, taxRounding);

    if (taxRes.netTax > 0) {
      totalEmployeeDeductions += taxRes.netTax;
      lineItems.push({
        componentCode: taxRule.code,
        componentName: `${taxRule.name} (PAYE)`,
        category: 'DEDUCTION_EE',
        amount: taxRes.netTax,
        isTaxable: false,
        isRelief: false,
        sourceInput: 'STATUTORY_RULE',
        formulaApplied: `Gross Tax: ${taxRes.grossTax.toFixed(2)} - Personal Relief: ${taxRes.personalRelief.toFixed(2)} - Insurance Relief: ${taxRes.insuranceRelief.toFixed(2)}`,
        ruleVersion: taxRule.version,
        displayOrder: 55,
      });
    } else {
      lineItems.push({
        componentCode: taxRule.code,
        componentName: `${taxRule.name} (PAYE - Relief Exceeds Tax)`,
        category: 'DEDUCTION_EE',
        amount: 0,
        isTaxable: false,
        isRelief: true,
        sourceInput: 'STATUTORY_RULE',
        formulaApplied: `Gross Tax: ${taxRes.grossTax.toFixed(2)} fully offset by Personal Relief (${taxRes.personalRelief.toFixed(2)}) & Insurance Relief (${taxRes.insuranceRelief.toFixed(2)})`,
        ruleVersion: taxRule.version,
        displayOrder: 55,
      });
    }
  }

  // Add one-off voluntary deductions
  if (ctx.oneOffDeductions) {
    for (const [code, amount] of Object.entries(ctx.oneOffDeductions)) {
      if (amount > 0) {
        totalEmployeeDeductions += amount;
        lineItems.push({
          componentCode: code,
          componentName: compMap.get(code)?.name || code,
          category: 'DEDUCTION_EE',
          amount: applyRounding(amount, 'ROUND_HALF_UP'),
          isTaxable: false,
          isRelief: false,
          sourceInput: 'ONE_OFF_INPUT',
          formulaApplied: `Voluntary Deduction: ${amount.toFixed(2)}`,
          displayOrder: 60,
        });
      }
    }
  }

  totalEmployeeDeductions = applyRounding(totalEmployeeDeductions, 'ROUND_HALF_UP');
  const netPay = Math.max(0, applyRounding(totalGrossPay - totalEmployeeDeductions, 'ROUND_HALF_UP'));
  totalEmployerCosts = applyRounding(totalEmployerCosts, 'ROUND_HALF_UP');

  return {
    employeeId: ctx.employeeId,
    employeeName: ctx.employeeName,
    employeeRef: ctx.employeeRef,
    daysWorked,
    daysAbsent: Math.max(0, totalWorkingDays - daysWorked),
    proRataFactor,
    grossPay: totalGrossPay,
    taxablePay,
    totalEmployeeDeductions,
    netPay,
    totalEmployerCosts,
    lineItems,
  };
}
