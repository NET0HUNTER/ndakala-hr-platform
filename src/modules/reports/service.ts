import type { PrismaClient } from '@prisma/client';
import { getActorEmployeeId, getReportingLineIds } from '../employees/access.js';
import { TimeTrackerService } from '../timetracker/service.js';
import { AppError } from '../../core/errors/errors.js';

export interface ReportFilter {
  scope?: 'my' | 'team' | 'org';
  startDate?: string;
  endDate?: string;
  departmentId?: string;
  search?: string;
}

const DEFAULT_REPORT_ACCESS = {
  my: { enabled: true, empInfo: true, leaveTracker: true, timeTracker: true, performance: true, payroll: true, governance: true },
  team: { enabled: true, empInfo: true, leaveTracker: true, timeTracker: true, performance: true, payroll: false, governance: true },
  org: { enabled: true, empInfo: true, leaveTracker: true, timeTracker: true, performance: true, payroll: true, governance: true },
};

export class ReportsService {
  private timeTracker: TimeTrackerService;

  constructor(private prisma: PrismaClient) {
    this.timeTracker = new TimeTrackerService(prisma);
  }

  private async resolveAllowedEmployeeIds(auth: { userId: string; permissions: Set<string> }, scope: string = 'org'): Promise<string[] | null> {
    const hasOrg =
      auth.permissions.has('employees.view') ||
      auth.permissions.has('leave.view_all') ||
      auth.permissions.has('payroll.reports.view') ||
      auth.permissions.has('audit.view');
    const hasTeam = auth.permissions.has('employees.view_team') || auth.permissions.has('leave.view_team');
    const actorEmpId = await getActorEmployeeId(this.prisma, auth.userId);

    if (scope === 'my' || (!hasOrg && !hasTeam)) {
      return actorEmpId ? [actorEmpId] : [];
    }
    if (scope === 'team' || !hasOrg) {
      if (!actorEmpId) return [];
      const line = await getReportingLineIds(this.prisma, actorEmpId);
      return Array.from(line);
    }
    return null; // null = unrestricted org view
  }

  public async getExecutiveSummary(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const scope = filter.scope || 'org';
    const empIds = await this.resolveAllowedEmployeeIds(auth, scope);
    const empWhere = empIds ? { id: { in: empIds } } : {};
    const empRefWhere = empIds ? { employeeId: { in: empIds } } : {};

    const [
      totalEmployees,
      activeEmployees,
      probationEmployees,
      leavePending,
      absencesCount,
      payrollRunsCount,
      latestRun,
      appraisalsCount,
      activePipsCount,
      pendingAcks,
      openErCases,
      pendingDsrs,
      activeHolds,
    ] = await Promise.all([
      this.prisma.employee.count({ where: empWhere }),
      this.prisma.employee.count({ where: { ...empWhere, status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { ...empWhere, status: 'PROBATION' } }),
      this.prisma.leaveRequest.count({ where: { ...empRefWhere, status: 'PENDING_APPROVAL' } }),
      this.prisma.absenceRecord.count({ where: empRefWhere }),
      this.prisma.payrollRun.count(),
      this.prisma.payrollRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      this.prisma.performanceAppraisal.count({ where: empRefWhere }),
      this.prisma.performanceImprovementPlan.count({ where: { ...empRefWhere, status: 'ACTIVE' } }),
      this.prisma.policyAcknowledgement.count({ where: { ...empRefWhere, status: 'PENDING' } }),
      this.prisma.erCase.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.privacyDataSubjectRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.privacyLegalHold.count({ where: { status: 'ACTIVE' } }),
    ]);

    const canViewRates = auth.permissions.has('timetracker.rates.view');
    const ttOverview = await this.timeTracker.getExecutiveOverview(
      { startDate: filter.startDate, endDate: filter.endDate },
      canViewRates
    );

    return {
      scope,
      generatedAt: new Date().toISOString(),
      workforce: { totalEmployees, activeEmployees, probationEmployees },
      leaveAndAbsence: { leavePending, absencesCount },
      payroll: {
        totalRuns: payrollRunsCount,
        latestGrossPayKes: auth.permissions.has('payroll.reports.view') ? latestRun?.totalGrossPay ?? 0 : null,
        latestNetPayKes: auth.permissions.has('payroll.reports.view') ? latestRun?.totalNetPay ?? 0 : null,
        latestStatus: latestRun?.status ?? 'NONE',
      },
      performance: { appraisalsCount, activePipsCount },
      governanceAndPrivacy: { pendingPolicyAcknowledgements: pendingAcks, openErCases, pendingDsrs, activeLegalHolds: activeHolds },
      timetracker: ttOverview.kpis,
    };
  }

  public async getWorkforceReport(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const empIds = await this.resolveAllowedEmployeeIds(auth, filter.scope || 'org');
    const where: any = {};
    if (empIds) where.id = { in: empIds };
    if (filter.departmentId) where.departmentId = filter.departmentId;

    const [employees, transfers, separations] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { department: true, position: true, grade: true, location: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.employeeTransfer.findMany({
        where: empIds ? { employeeId: { in: empIds } } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.employeeSeparation.findMany({
        where: empIds ? { employeeId: { in: empIds } } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const search = (filter.search || '').toLowerCase();
    const rows = employees
      .filter(
        (e) =>
          !search ||
          `${e.firstName} ${e.lastName} ${e.employeeNumber} ${e.workEmail} ${e.department?.name || ''} ${e.position?.title || ''}`
            .toLowerCase()
            .includes(search)
      )
      .map((e) => ({
        id: e.id,
        employeeNumber: e.employeeNumber,
        fullName: `${e.firstName} ${e.lastName}`,
        workEmail: e.workEmail,
        department: e.department?.name || 'Unassigned',
        position: e.position?.title || 'Staff',
        grade: e.grade?.code || '-',
        location: e.location?.name || 'Nairobi HQ',
        status: e.status,
        profileCompletionStatus: e.profileCompletionStatus,
        hireDate: e.createdAt.toISOString().slice(0, 10),
      }));

    return {
      rows,
      transfersCount: transfers.length,
      separationsCount: separations.length,
      transfers,
      separations,
    };
  }

  public async getLeaveReport(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const empIds = await this.resolveAllowedEmployeeIds(auth, filter.scope || 'org');
    const empRefWhere = empIds ? { employeeId: { in: empIds } } : {};

    const [balances, requests, absences] = await Promise.all([
      this.prisma.leaveBalance.findMany({
        where: empRefWhere,
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } }, leaveType: true },
        orderBy: [{ leaveYear: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.leaveRequest.findMany({
        where: empRefWhere,
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } }, leaveType: true },
        orderBy: { submittedAt: 'desc' },
        take: 200,
      }),
      this.prisma.absenceRecord.findMany({
        where: empRefWhere,
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
        orderBy: { startDate: 'desc' },
        take: 100,
      }),
    ]);

    const search = (filter.search || '').toLowerCase();
    const balanceRows = balances
      .filter(
        (b) =>
          !search ||
          `${b.employee.firstName} ${b.employee.lastName} ${b.leaveType.name}`.toLowerCase().includes(search)
      )
      .map((b) => ({
        id: b.id,
        employeeNumber: b.employee.employeeNumber,
        employeeName: `${b.employee.firstName} ${b.employee.lastName}`,
        leaveType: b.leaveType.name,
        leaveYear: b.leaveYear,
        entitlementDays: b.entitlementDays,
        accruedDays: b.accruedDays,
        takenDays: b.takenDays,
        pendingReservedDays: b.pendingReservedDays,
        closingBalanceDays: b.closingBalanceDays,
      }));

    return { balances: balanceRows, requests, absences };
  }

  public async getPayrollReport(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const canViewAll = auth.permissions.has('payroll.reports.view');
    const actorEmpId = await getActorEmployeeId(this.prisma, auth.userId);

    const runs = canViewAll
      ? await this.prisma.payrollRun.findMany({
          include: { period: { include: { payGroup: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : [];

    const slips = await this.prisma.payrollSlip.findMany({
      where: canViewAll ? {} : { employeeId: actorEmpId || '__none__' },
      include: { period: true, run: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const search = (filter.search || '').toLowerCase();
    const filteredSlips = slips.filter(
      (s) =>
        !search ||
        `${s.employeeName} ${s.employeeRef} ${s.period?.name || ''}`.toLowerCase().includes(search)
    );

    return {
      runs: runs.map((r) => ({
        id: r.id,
        periodName: r.period?.name || 'Period',
        runNumber: r.runNumber,
        runType: r.runType,
        status: r.status,
        totalEmployeesCount: r.totalEmployeesCount,
        totalGrossPay: r.totalGrossPay,
        totalPAYE: r.totalPAYE,
        totalNSSFEmployee: r.totalNSSFEmployee,
        totalSHIF: r.totalSHIF,
        totalHousingLevyEmployee: r.totalHousingLevyEmployee,
        totalNetPay: r.totalNetPay,
      })),
      slips: filteredSlips,
    };
  }

  public async getPerformanceReport(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const empIds = await this.resolveAllowedEmployeeIds(auth, filter.scope || 'org');
    const empRefWhere = empIds ? { employeeId: { in: empIds } } : {};

    const [cycles, appraisals, pips] = await Promise.all([
      this.prisma.performanceCycle.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.performanceAppraisal.findMany({
        where: empRefWhere,
        include: {
          cycle: { select: { title: true, cycleType: true } },
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          manager: { select: { firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.performanceImprovementPlan.findMany({
        where: empRefWhere,
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const search = (filter.search || '').toLowerCase();
    const filteredAppraisals = appraisals
      .filter(
        (a) =>
          !search ||
          `${a.employee.firstName} ${a.employee.lastName} ${a.cycle.title} ${a.status}`.toLowerCase().includes(search)
      )
      .map((a) => ({
        id: a.id,
        cycleTitle: a.cycle.title,
        employeeNumber: a.employee.employeeNumber,
        employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
        managerName: `${a.manager.firstName} ${a.manager.lastName}`,
        status: a.status,
        managerRatingCode: a.managerRatingCode,
        moderatedRatingCode: a.moderatedRatingCode,
        annualCompositeScore: a.annualCompositeScore,
      }));

    return { cycles, appraisals: filteredAppraisals, pips };
  }

  public async getGovernanceReport(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const canAudit = auth.permissions.has('audit.view');
    const canDsr = auth.permissions.has('privacy.dsr.manage');

    const [acknowledgements, trainingAssignments, auditLogs, dsrs, legalHolds] = await Promise.all([
      this.prisma.policyAcknowledgement.findMany({
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          policyVersion: { include: { policy: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 150,
      }),
      this.prisma.trainingAssignment.findMany({
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          programme: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 150,
      }),
      canAudit
        ? this.prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, take: 100 })
        : Promise.resolve([]),
      canDsr
        ? this.prisma.privacyDataSubjectRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
        : Promise.resolve([]),
      canDsr || auth.permissions.has('privacy.legal_hold.manage')
        ? this.prisma.privacyLegalHold.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
        : Promise.resolve([]),
    ]);

    const search = (filter.search || '').toLowerCase();
    const ackRows = acknowledgements
      .filter(
        (a) =>
          !search ||
          `${a.employee.firstName} ${a.employee.lastName} ${a.policyVersion.policy.title}`.toLowerCase().includes(search)
      )
      .map((a) => ({
        id: a.id,
        employeeNumber: a.employee.employeeNumber,
        employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
        policyTitle: a.policyVersion.policy.title,
        status: a.status,
        acknowledgedAt: a.acknowledgedAt,
      }));

    return { acknowledgements: ackRows, trainingAssignments, auditLogs, dsrs, legalHolds };
  }

  public async getTimeTrackerReport(auth: { userId: string; permissions: Set<string> }, filter: ReportFilter) {
    const canViewRates = auth.permissions.has('timetracker.rates.view');
    const startDate = filter.startDate || '2026-09-01';
    const endDate = filter.endDate || '2026-11-30';

    const [executive, utilization, periods] = await Promise.all([
      this.timeTracker.getExecutiveOverview({ startDate, endDate }, canViewRates),
      this.timeTracker.getTeamUtilization(startDate, endDate),
      this.timeTracker.listPeriods(),
    ]);

    return { executive, utilization, periods };
  }

  private toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
    const escape = (val: unknown) => {
      const s = val === null || val === undefined ? '' : String(val);
      return `"${s.replace(/"/g, '""')}"`;
    };
    return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  }

  public async exportDomainCsv(
    domain: string,
    auth: { userId: string; permissions: Set<string> },
    filter: ReportFilter
  ): Promise<{ filename: string; csv: string }> {
    switch (domain) {
      case 'workforce': {
        const rep = await this.getWorkforceReport(auth, filter);
        const csv = this.toCsv(
          ['Employee #', 'Full Name', 'Email', 'Department', 'Position', 'Grade', 'Location', 'Status', 'Hire Date'],
          rep.rows.map((r) => [r.employeeNumber, r.fullName, r.workEmail, r.department, r.position, r.grade, r.location, r.status, r.hireDate])
        );
        return { filename: `Ndakala_Workforce_Report_${new Date().toISOString().slice(0, 10)}.csv`, csv };
      }
      case 'leave': {
        const rep = await this.getLeaveReport(auth, filter);
        const csv = this.toCsv(
          ['Employee #', 'Employee', 'Leave Type', 'Year', 'Entitlement', 'Accrued', 'Taken', 'Reserved', 'Balance'],
          rep.balances.map((b) => [b.employeeNumber, b.employeeName, b.leaveType, b.leaveYear, b.entitlementDays, b.accruedDays, b.takenDays, b.pendingReservedDays, b.closingBalanceDays])
        );
        return { filename: `Ndakala_Leave_Report_${new Date().toISOString().slice(0, 10)}.csv`, csv };
      }
      case 'payroll': {
        const rep = await this.getPayrollReport(auth, filter);
        const csv = this.toCsv(
          ['Period', 'Run #', 'Type', 'Status', 'Employees', 'Gross Pay (KES)', 'PAYE', 'NSSF', 'SHIF', 'AHL', 'Net Pay (KES)'],
          rep.runs.map((r) => [r.periodName, r.runNumber, r.runType, r.status, r.totalEmployeesCount, r.totalGrossPay, r.totalPAYE, r.totalNSSFEmployee, r.totalSHIF, r.totalHousingLevyEmployee, r.totalNetPay])
        );
        return { filename: `Ndakala_Payroll_Report_${new Date().toISOString().slice(0, 10)}.csv`, csv };
      }
      case 'performance': {
        const rep = await this.getPerformanceReport(auth, filter);
        const csv = this.toCsv(
          ['Cycle', 'Employee #', 'Employee', 'Manager', 'Status', 'Manager Rating', 'Moderated Rating', 'Composite Score'],
          rep.appraisals.map((a) => [a.cycleTitle, a.employeeNumber, a.employeeName, a.managerName, a.status, a.managerRatingCode, a.moderatedRatingCode, a.annualCompositeScore])
        );
        return { filename: `Ndakala_Performance_Report_${new Date().toISOString().slice(0, 10)}.csv`, csv };
      }
      case 'governance': {
        const rep = await this.getGovernanceReport(auth, filter);
        const csv = this.toCsv(
          ['Employee #', 'Employee', 'Policy Title', 'Status', 'Acknowledged At'],
          rep.acknowledgements.map((a) => [a.employeeNumber, a.employeeName, a.policyTitle, a.status, a.acknowledgedAt?.toISOString() || ''])
        );
        return { filename: `Ndakala_Governance_Report_${new Date().toISOString().slice(0, 10)}.csv`, csv };
      }
      case 'timetracker': {
        const rep = await this.getTimeTrackerReport(auth, filter);
        const csv = this.toCsv(
          ['Project Code', 'Project Name', 'Client', 'Total Hours', 'Billable Hours', 'Billability %', 'Billable Revenue (KES)', 'Health Status', 'Burn %'],
          rep.executive.projects.map((p: any) => [
            p.code,
            p.name,
            p.client?.name || '',
            p.metrics.totalHours,
            p.metrics.billableHours,
            p.metrics.billabilityPct,
            p.metrics.billableRevenueKes,
            p.metrics.health.status,
            p.metrics.health.burnPct,
          ])
        );
        return { filename: `Ndakala_Timesheet_Profitability_${new Date().toISOString().slice(0, 10)}.csv`, csv };
      }
      default:
        throw new AppError(400, 'INVALID_DOMAIN', `Unknown report export domain: ${domain}`);
    }
  }

  public async getReportPermissions() {
    const cfg = await this.prisma.policyConfiguration.findFirst({
      where: { code: 'REPORT_ACCESS_MATRIX', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (!cfg) return DEFAULT_REPORT_ACCESS;
    try {
      return JSON.parse(cfg.values);
    } catch {
      return DEFAULT_REPORT_ACCESS;
    }
  }

  public async updateReportPermissions(matrix: Record<string, any>, actorUserId: string) {
    const latest = await this.prisma.policyConfiguration.findFirst({
      where: { code: 'REPORT_ACCESS_MATRIX' },
      orderBy: { version: 'desc' },
    });
    const nextVer = (latest?.version ?? 0) + 1;
    if (latest && latest.status === 'ACTIVE') {
      await this.prisma.policyConfiguration.update({
        where: { id: latest.id },
        data: { status: 'SUPERSEDED' },
      });
    }
    const created = await this.prisma.policyConfiguration.create({
      data: {
        code: 'REPORT_ACCESS_MATRIX',
        title: 'Enterprise Reports Access Permissions Matrix',
        layer: 'ORGANISATION',
        version: nextVer,
        status: 'ACTIVE',
        values: JSON.stringify(matrix),
        sourceReference: 'Reports Hub Access Control',
        owner: 'Head of HR',
        effectiveFrom: new Date(),
        createdById: actorUserId,
        approvedById: actorUserId,
        approvedAt: new Date(),
      },
    });
    return JSON.parse(created.values);
  }
}
