// src/modules/payroll/routes.ts
// HTTP Endpoints for Configurable Kenyan Payroll & Remuneration Architecture (R3)

import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { PayrollService } from './service.js';
import { forbidden, notFound, validation } from '../../core/errors/errors.js';
import { auditCtx } from '../employees/util.js';

export function createPayrollRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new PayrollService(deps.prisma);

  // 1. Pay Groups
  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/pay-groups',
    auth: 'session',
    handler: async () => {
      return service.listPayGroups();
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/pay-groups',
    auth: { permission: 'payroll.config.manage' },
    body: z.object({
      code: z.string().min(2),
      name: z.string().min(3),
      payFrequency: z.enum(['MONTHLY', 'BI_WEEKLY', 'WEEKLY']).default('MONTHLY'),
      currency: z.string().default('KES'),
      cutoffDay: z.number().int().min(1).max(31).default(20),
      payDayRule: z.string().default('LAST_BUSINESS_DAY'),
      workingDaysBasis: z.string().default('ACTUAL_WORKING_DAYS'),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createPayGroup(body, auditCtx(auth, req));
    },
  });

  // 2. Salary Components
  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/components',
    auth: 'session',
    handler: async () => {
      return service.listComponents();
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/components',
    auth: { permission: 'payroll.config.manage' },
    body: z.object({
      code: z.string().min(2),
      name: z.string().min(3),
      category: z.enum([
        'EARNING',
        'BENEFIT_TAXABLE',
        'BENEFIT_NON_TAXABLE',
        'DEDUCTION_STATUTORY_EE',
        'DEDUCTION_VOLUNTARY_EE',
        'CONTRIBUTION_STATUTORY_ER',
        'CONTRIBUTION_VOLUNTARY_ER',
      ]),
      calculationType: z.string().default('FIXED_AMOUNT'),
      formulaExpression: z.string().optional(),
      isPensionable: z.boolean().default(true),
      isTaxable: z.boolean().default(true),
      isSubjectToHousingLevy: z.boolean().default(true),
      isSubjectToHealthLevy: z.boolean().default(true),
      isProRataApplicable: z.boolean().default(true),
      displayOrder: z.number().int().default(10),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createComponent(body, auditCtx(auth, req));
    },
  });

  // 3. Employee Salary Assignments
  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/salaries/assign',
    auth: { permission: 'payroll.config.manage' },
    body: z.object({
      employeeId: z.string().uuid(),
      payGroupId: z.string().uuid().optional(),
      effectiveDate: z.string(),
      components: z.record(z.string(), z.number()),
      changeReason: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.assignEmployeeSalary(body, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/salaries/employee/:employeeId',
    auth: 'session',
    handler: async ({ params, auth, deps }) => {
      const hasOrgSalaryAccess =
        auth.permissions.has('payroll.config.manage') ||
        auth.permissions.has('payroll.prepare') ||
        auth.permissions.has('payroll.reports.view') ||
        auth.permissions.has('employees.view');

      if (!hasOrgSalaryAccess) {
        const emp = await deps.prisma.employee.findUnique({
          where: { id: params.employeeId },
          select: { userId: true },
        });
        if (!emp || emp.userId !== auth.userId) {
          throw forbidden('Access denied: you may only view your own salary structure');
        }
      }

      const salary = await service.getEmployeeSalary(params.employeeId);
      if (!salary) throw notFound('Salary assignment', params.employeeId);
      return salary;
    },
  });

  // 4. Statutory Rule Sets
  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/rule-sets',
    auth: 'session',
    handler: async () => {
      return service.listRuleSets();
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/rule-sets/:id',
    auth: 'session',
    handler: async ({ params }) => {
      const rs = await service.getRuleSet(params.id);
      if (!rs) throw notFound('StatutoryRuleSet', params.id);
      return rs;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/rule-sets',
    auth: { permission: 'payroll.config.manage' },
    body: z.object({
      code: z.string().min(3),
      name: z.string().min(3),
      countryCode: z.string().default('KE'),
      effectiveFrom: z.string(),
      description: z.string().optional(),
      sourceDocument: z.string().optional(),
      rules: z.array(
        z.object({
          code: z.string(),
          name: z.string(),
          category: z.string(),
          algorithmType: z.string(),
          parameters: z.any(),
          deductibleFromTaxablePay: z.boolean().default(false),
          reliefPercentage: z.number().optional(),
          reliefMaxMonthly: z.number().optional(),
          isEmployeeDeduction: z.boolean().default(true),
          isEmployerContribution: z.boolean().default(false),
          roundingRule: z.string().default('ROUND_HALF_UP'),
          priority: z.number().int().optional(),
        })
      ),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createRuleSet(body, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/rule-sets/:id/activate',
    auth: { permission: 'payroll.config.manage' },
    handler: async ({ params, auth, req }) => {
      return service.activateRuleSet(params.id, auth.userId, auditCtx(auth, req));
    },
  });

  // 5. Payroll Periods
  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/periods',
    auth: 'session',
    handler: async ({ req }) => {
      const payGroupId = req.query.payGroupId as string | undefined;
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      return service.listPeriods({ payGroupId, fiscalYear });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/periods',
    auth: { permission: 'payroll.prepare' },
    body: z.object({
      payGroupId: z.string().uuid(),
      periodNumber: z.number().int().min(1).max(12),
      fiscalYear: z.number().int().min(2020),
      name: z.string().min(3),
      startDate: z.string(),
      endDate: z.string(),
      cutoffDate: z.string().optional(),
      payDate: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createPeriod(body, auditCtx(auth, req));
    },
  });

  // 6. Payroll Runs Lifecycle
  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/periods/:id/runs',
    auth: { permission: 'payroll.prepare' },
    body: z.object({
      ruleSetId: z.string().uuid().optional(),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.initiateRun(params.id, body.ruleSetId, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/periods/:id/runs',
    auth: { permission: ['payroll.prepare', 'payroll.approve', 'payroll.config.manage', 'payroll.reports.view'], any: true },
    params: z.object({ id: z.string() }),
    handler: async ({ params }) => {
      return service.listPeriodRuns(params.id);
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/runs',
    auth: { permission: 'payroll.reports.view' },
    handler: async ({ deps }) => {
      return deps.prisma.payrollRun.findMany({
        include: { period: { include: { payGroup: true } }, ruleSet: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/runs/:id',
    auth: { permission: ['payroll.prepare', 'payroll.approve', 'payroll.config.manage', 'payroll.reports.view'], any: true },
    handler: async ({ params, deps }) => {
      const run = await deps.prisma.payrollRun.findUnique({
        where: { id: params.id },
        include: {
          period: { include: { payGroup: true } },
          ruleSet: true,
        },
      });
      if (!run) throw notFound('PayrollRun', params.id);
      return run;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/calculate',
    auth: { permission: 'payroll.prepare' },
    handler: async ({ params, auth, req }) => {
      return service.calculateRun(params.id, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/submit',
    auth: { permission: ['payroll.prepare', 'payroll.review'], any: true },
    handler: async ({ params, auth, req }) => {
      return service.submitRunForReview(params.id, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/approve',
    auth: { permission: 'payroll.approve' },
    handler: async ({ params, auth, req }) => {
      return service.approveRun(params.id, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/lock',
    auth: { permission: 'payroll.lock' },
    handler: async ({ params, auth, req }) => {
      return service.lockRun(params.id, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/adjust',
    auth: { permission: 'payroll.adjust' },
    body: z.object({
      notes: z.string().min(5),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.createAdjustmentRun(params.id, body.notes, auth.userId, auditCtx(auth, req));
    },
  });

  // 7. Payslips
  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/slips/me',
    auth: 'session',
    handler: async ({ auth, deps }) => {
      const employee = await deps.prisma.employee.findFirst({
        where: { userId: auth.userId },
      });
      if (!employee) return [];

      return deps.prisma.payrollSlip.findMany({
        where: { employeeId: employee.id },
        include: {
          lineItems: { orderBy: { displayOrder: 'asc' } },
          period: true,
          run: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/slips/:id',
    auth: 'session',
    handler: async ({ params, auth }) => {
      return service.getEmployeePayslip(params.id, auth.userId, auth.roles);
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/payroll/runs/:id/slips',
    auth: { permission: 'payroll.reports.view' },
    handler: async ({ params }) => {
      return service.listRunPayslips(params.id);
    },
  });

  // 8. Bank Export & Reconciliation
  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/export-bank',
    auth: { permission: 'payroll.export' },
    body: z.object({
      bankFormatCode: z.string().default('STANDARD_EFT_CSV'),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.exportBankSchedule(params.id, body.bankFormatCode, auth.userId, auditCtx(auth, req));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/runs/:id/reconcile',
    auth: { permission: 'payroll.reports.view' },
    body: z.object({
      comparisonRunId: z.string().uuid().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.generateReconciliationReport(params.id, body.comparisonRunId, auth.userId, auditCtx(auth, req));
    },
  });

  // 9. What-If Simulation Sandbox
  registerRoute(router, deps, {
    method: 'post',
    path: '/payroll/simulate',
    auth: { permission: ['payroll.prepare', 'payroll.approve', 'payroll.config.manage', 'payroll.reports.view'], any: true },
    body: z.object({
      ruleSetId: z.string().uuid().optional(),
      customRuleSet: z
        .object({
          name: z.string(),
          rules: z.array(z.any()),
        })
        .optional(),
      testEmployees: z.array(
        z.object({
          employeeId: z.string(),
          employeeName: z.string(),
          employeeRef: z.string(),
          salaryComponents: z.record(z.string(), z.number()),
          daysWorkedInMonth: z.number().optional(),
          totalWorkingDaysInMonth: z.number().optional(),
        })
      ),
    }),
    handler: async ({ body }) => {
      return service.simulatePayroll(body);
    },
  });

  return router;
}
