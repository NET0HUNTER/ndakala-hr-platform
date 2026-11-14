import { validation } from '../../core/errors/errors.js';

export type PolicyLayer =
  | 'STATUTORY'
  | 'ORGANISATION'
  | 'LOCATION'
  | 'DEPARTMENT'
  | 'EXCEPTION';

export const LAYER_PRIORITY: Record<PolicyLayer, number> = {
  EXCEPTION: 5,
  DEPARTMENT: 4,
  LOCATION: 3,
  ORGANISATION: 2,
  STATUTORY: 1, // Base floor
};

export interface PolicyRule {
  id: string;
  code: string;
  title: string;
  layer: PolicyLayer;
  locationId?: string | null;
  departmentId?: string | null;
  gradeId?: string | null;
  targetEmployeeId?: string | null;
  version: number;
  status: string;
  values: Record<string, any>;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}

export interface ResolutionContext {
  targetEmployeeId?: string;
  departmentId?: string;
  locationId?: string;
  gradeId?: string;
  asOfDate?: Date;
}

/**
 * Evaluates policy rules by layer precedence:
 * Statutory guardrail defines the floor/ceiling that NO lower policy or individual exception can violate.
 * Order of specific overrides:
 * Statutory -> Organisation -> Location -> Department/Grade -> Approved Individual Exception
 */
export function resolveEffectiveConfiguration(
  rules: PolicyRule[],
  ctx: ResolutionContext,
): { effectiveValues: Record<string, any>; appliedRules: PolicyRule[] } {
  const asOf = ctx.asOfDate ?? new Date();

  // Filter only ACTIVE rules within effective date range
  const activeRules = rules.filter((r) => {
    if (r.status !== 'ACTIVE') return false;
    if (r.effectiveFrom > asOf) return false;
    if (r.effectiveTo && r.effectiveTo < asOf) return false;
    return true;
  });

  // Check matching context for each layer
  const matchingRules = activeRules.filter((r) => {
    switch (r.layer) {
      case 'STATUTORY':
      case 'ORGANISATION':
        return true;
      case 'LOCATION':
        return !r.locationId || r.locationId === ctx.locationId;
      case 'DEPARTMENT':
        const deptMatch = !r.departmentId || r.departmentId === ctx.departmentId;
        const gradeMatch = !r.gradeId || r.gradeId === ctx.gradeId;
        return deptMatch && gradeMatch;
      case 'EXCEPTION':
        return !r.targetEmployeeId || r.targetEmployeeId === ctx.targetEmployeeId;
      default:
        return false;
    }
  });

  // Sort by layer precedence: STATUTORY first, then ORGANISATION, LOCATION, DEPARTMENT, EXCEPTION
  matchingRules.sort((a, b) => LAYER_PRIORITY[a.layer] - LAYER_PRIORITY[b.layer]);

  const statutoryRule = matchingRules.find((r) => r.layer === 'STATUTORY');
  const merged: Record<string, any> = {};

  for (const rule of matchingRules) {
    Object.assign(merged, rule.values);
  }

  // Statutory guardrail protection:
  // If a statutory rule exists with a minimum requirement (e.g. minDays, statutoryFloor),
  // verify that the resolved configuration did not reduce it below the statutory minimum!
  if (statutoryRule) {
    for (const [key, statValue] of Object.entries(statutoryRule.values)) {
      if (typeof statValue === 'number' && key.endsWith('Min')) {
        const baseKey = key.replace(/Min$/, '');
        const configuredVal = merged[baseKey];
        if (typeof configuredVal === 'number' && configuredVal < statValue) {
          throw validation(
            `Statutory violation: Configured ${baseKey} (${configuredVal}) cannot fall below statutory minimum ${statValue} specified in ${statutoryRule.title}`,
          );
        }
      }
    }
  }

  return {
    effectiveValues: merged,
    appliedRules: matchingRules,
  };
}
