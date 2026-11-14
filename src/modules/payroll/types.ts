// src/modules/payroll/types.ts
// Configurable Kenyan Payroll & Remuneration Type Definitions (R3)

export type CalculationAlgorithm =
  | 'TIERED_BRACKETS'
  | 'TIERED_PENSION_CAPS'
  | 'PERCENTAGE_OF_GROSS'
  | 'FIXED_PER_EMPLOYEE'
  | 'CUSTOM_FORMULA';

export type RoundingMethod =
  | 'ROUND_HALF_UP'
  | 'TWO_DECIMALS'
  | 'NEAREST_INTEGER'
  | 'FLOOR'
  | 'CEIL';

export interface TaxBandParam {
  order: number;
  from: number;
  to: number | null; // null represents infinity / unbounded top band
  rate: number; // e.g. 0.10 for 10%
  name?: string;
}

export interface TieredBracketsParams {
  bands: TaxBandParam[];
  personalReliefMonthly?: number; // e.g. 2400
  insuranceReliefPercentage?: number; // e.g. 0.15
  insuranceReliefMaxMonthly?: number; // e.g. 5000
}

export interface TieredPensionCapsParams {
  lowerEarningsLimit: number; // LEL e.g. 9000
  upperEarningsLimit: number; // UEL e.g. 108000
  employeeRate: number; // e.g. 0.06
  employerRate: number; // e.g. 0.06
  tier1MaxEmployee?: number; // e.g. 540
  tier1MaxEmployer?: number; // e.g. 540
  tier2MaxEmployee?: number; // e.g. 5940
  tier2MaxEmployer?: number; // e.g. 5940
  totalMaxEmployee?: number; // e.g. 6480
  totalMaxEmployer?: number; // e.g. 6480
}

export interface PercentageOfGrossParams {
  employeeRate: number; // e.g. 0.0275 for SHIF or 0.015 for Housing Levy
  employerRate: number; // e.g. 0.015 for Housing Levy match, 0 for SHIF
  minAmount?: number; // e.g. 300 for SHIF
  maxAmount?: number; // optional ceiling
}

export interface FixedPerEmployeeParams {
  amount: number; // e.g. 50 for NITA
  payer: 'EMPLOYER' | 'EMPLOYEE';
}

export interface EvaluatedLineItem {
  componentCode: string;
  componentName: string;
  category: 'EARNING' | 'BENEFIT' | 'DEDUCTION_EE' | 'CONTRIBUTION_ER';
  amount: number;
  isTaxable: boolean;
  isRelief: boolean;
  sourceInput: string;
  formulaApplied: string;
  ruleVersion?: string;
  displayOrder: number;
}

export interface SlipCalculationResult {
  employeeId: string;
  employeeName: string;
  employeeRef: string;
  daysWorked: number;
  daysAbsent: number;
  proRataFactor: number;
  grossPay: number;
  taxablePay: number;
  totalEmployeeDeductions: number;
  netPay: number;
  totalEmployerCosts: number;
  lineItems: EvaluatedLineItem[];
}
