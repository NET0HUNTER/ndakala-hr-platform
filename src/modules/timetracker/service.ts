import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError, notFound, validation, conflict } from '../../core/errors/errors.js';

export interface LogTimeInput {
  employeeId: string;
  projectId: string;
  phaseId?: string | null;
  workDate: string;
  hours: number;
  isBillable: boolean;
  description: string;
}

export interface ReviewTimeLogsInput {
  logIds: string[];
  action: 'APPROVE' | 'REJECT';
  actorUserId: string;
  rejectionReason?: string;
}

export class TimeTrackerService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Computes Monday-Friday working days in a date range [startDate, endDate].
   */
  public countWorkingDaysMonFri(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getUTCDay();
      if (day >= 1 && day <= 5) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }

  /**
   * Classifies Project Health & Revenue Leakage per Section 5.2 of Runbook (ND-RUN-2026-10).
   */
  public classifyProjectHealth(laborCostKes: number, budgetAmountKes: number, totalHours: number) {
    if (budgetAmountKes <= 0 && totalHours > 0) {
      return { status: 'NO_BUDGET', burnPct: 100, label: 'No Budget (Leakage Risk)' };
    }
    if (budgetAmountKes <= 0) {
      return { status: 'ON_TRACK', burnPct: 0, label: 'On Track' };
    }
    const burnPct = Number(((laborCostKes / budgetAmountKes) * 100).toFixed(1));
    if (burnPct > 100) return { status: 'OVER_BUDGET', burnPct, label: 'Over Budget' };
    if (burnPct > 90) return { status: 'ATTENTION', burnPct, label: 'Attention (>90%)' };
    if (burnPct >= 75) return { status: 'WATCH', burnPct, label: 'Watch (75-90%)' };
    return { status: 'ON_TRACK', burnPct, label: 'On Track (<75%)' };
  }

  /**
   * Enforces Period Lock safety before creating or mutating any time entry.
   */
  public async assertDateNotLocked(workDate: string) {
    const lockedPeriod = await this.prisma.timePeriodClose.findFirst({
      where: {
        status: 'LOCKED',
        startDate: { lte: workDate },
        endDate: { gte: workDate },
      },
    });
    if (lockedPeriod) {
      throw new AppError(
        409,
        'PERIOD_LOCKED',
        `Financial period "${lockedPeriod.name}" (${lockedPeriod.startDate} to ${lockedPeriod.endDate}) is permanently LOCKED.`
      );
    }
  }

  /**
   * Creates a time entry with automatic rate card snapshot.
   */
  public async logTime(input: LogTimeInput) {
    if (!input.hours || input.hours <= 0 || input.hours > 24) {
      throw new AppError(400, 'INVALID_HOURS', 'Hours logged must be between 0.25 and 24.0');
    }
    if (!input.description || !input.description.trim()) {
      throw validation('Work description is required');
    }
    await this.assertDateNotLocked(input.workDate);

    const project = await this.prisma.timeProject.findUnique({ where: { id: input.projectId } });
    if (!project) throw notFound('TimeProject', input.projectId);

    const rateCard = await this.prisma.timeRateCard.findUnique({
      where: { employeeId: input.employeeId },
    });

    return this.prisma.timeLog.create({
      data: {
        employeeId: input.employeeId,
        projectId: input.projectId,
        phaseId: input.phaseId || null,
        workDate: input.workDate,
        hours: Number(input.hours),
        isBillable: Boolean(input.isBillable),
        description: input.description.trim(),
        costRateSnap: rateCard?.costRateKes ?? 2500,
        billingRateSnap: rateCard?.billingRateKes ?? 6500,
        status: 'PENDING',
      },
      include: { project: { include: { client: true } }, phase: true },
    });
  }

  /**
   * Deletes an unlocked, non-approved time entry.
   */
  public async deleteTimeLog(logId: string, actorEmployeeId: string | null, isAdmin: boolean) {
    const log = await this.prisma.timeLog.findUnique({ where: { id: logId } });
    if (!log) throw notFound('TimeLog', logId);

    await this.assertDateNotLocked(log.workDate);
    if (log.status === 'LOCKED') {
      throw new AppError(409, 'PERIOD_LOCKED', 'Cannot delete a locked time log entry.');
    }
    if (!isAdmin && actorEmployeeId && log.employeeId !== actorEmployeeId) {
      throw new AppError(403, 'FORBIDDEN', 'Cannot delete another employee time log.');
    }
    if (log.status === 'APPROVED' && !isAdmin) {
      throw new AppError(409, 'ALREADY_APPROVED', 'Cannot delete an already approved time log.');
    }

    await this.prisma.timeLog.delete({ where: { id: logId } });
    return { deleted: true, id: logId };
  }

  /**
   * Single or Batch Approval / Rejection with Mandatory Rejection Feedback.
   */
  public async reviewTimeLogs(input: ReviewTimeLogsInput) {
    if (!input.logIds || input.logIds.length === 0) {
      throw validation('At least one time log ID must be provided.');
    }
    if (input.action === 'REJECT' && (!input.rejectionReason || !input.rejectionReason.trim())) {
      throw new AppError(400, 'REJECTION_REASON_REQUIRED', 'A rejection reason is required when rejecting time logs.');
    }

    const logs = await this.prisma.timeLog.findMany({
      where: { id: { in: input.logIds } },
    });
    if (logs.length === 0) throw notFound('TimeLog', input.logIds.join(', '));

    for (const l of logs) {
      if (l.status === 'LOCKED') {
        throw new AppError(409, 'PERIOD_LOCKED', `Time log ${l.id} is inside a LOCKED period and cannot be modified.`);
      }
      await this.assertDateNotLocked(l.workDate);
    }

    const nextStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await this.prisma.timeLog.updateMany({
      where: { id: { in: input.logIds } },
      data: {
        status: nextStatus,
        approvedById: input.actorUserId,
        approvedAt: new Date(),
        rejectionReason: input.action === 'REJECT' ? input.rejectionReason!.trim() : null,
      },
    });

    return this.prisma.timeLog.findMany({
      where: { id: { in: input.logIds } },
      include: { project: { include: { client: true } }, phase: true },
    });
  }

  /**
   * Lists time logs with optional filters and RBAC cost-rate masking.
   */
  public async listTimeLogs(
    filters: {
      employeeId?: string;
      projectId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
    canViewRates: boolean
  ) {
    const where: any = {};
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.workDate = {};
      if (filters.startDate) where.workDate.gte = filters.startDate;
      if (filters.endDate) where.workDate.lte = filters.endDate;
    }

    const logs = await this.prisma.timeLog.findMany({
      where,
      include: { project: { include: { client: true } }, phase: true },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
    });

    const empIds = Array.from(new Set(logs.map((l) => l.employeeId).filter(Boolean)));
    const emps =
      empIds.length > 0
        ? await this.prisma.employee.findMany({
            where: { id: { in: empIds } },
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          })
        : [];
    const empMap = new Map(emps.map((e) => [e.id, e]));

    const filtered = filters.search
      ? logs.filter((l) => {
          const term = filters.search!.toLowerCase();
          const emp = empMap.get(l.employeeId);
          const empName = emp ? `${emp.firstName} ${emp.lastName} ${emp.employeeNumber}`.toLowerCase() : '';
          return (
            l.description.toLowerCase().includes(term) ||
            l.project.name.toLowerCase().includes(term) ||
            l.project.code.toLowerCase().includes(term) ||
            (l.phase?.name.toLowerCase().includes(term) ?? false) ||
            empName.includes(term)
          );
        })
      : logs;

    return filtered.map((l) => {
      const emp = empMap.get(l.employeeId);
      const employeeName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : null;
      return {
        ...l,
        employeeName,
        employeeNumber: emp?.employeeNumber || null,
        costRateSnap: canViewRates ? l.costRateSnap : null,
        laborCostKes: canViewRates ? Number((l.hours * l.costRateSnap).toFixed(2)) : null,
        billingValueKes: l.isBillable ? Number((l.hours * l.billingRateSnap).toFixed(2)) : 0,
      };
    });
  }

  public async listClients() {
    return this.prisma.timeClient.findMany({
      include: { _count: { select: { projects: true } } },
      orderBy: { name: 'asc' },
    });
  }

  public async createClient(input: {
    code: string;
    name: string;
    industry?: string;
    contactName?: string;
    contactEmail?: string;
    currency?: string;
  }) {
    const exists = await this.prisma.timeClient.findUnique({ where: { code: input.code } });
    if (exists) throw conflict(`Client with code ${input.code} already exists`);
    return this.prisma.timeClient.create({ data: input });
  }

  public async listProjects(canViewRates: boolean) {
    const projects = await this.prisma.timeProject.findMany({
      include: {
        client: true,
        phases: { orderBy: { sortOrder: 'asc' } },
        timeLogs: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((p) => {
      const totalHours = p.timeLogs.reduce((s, l) => s + l.hours, 0);
      const billableHours = p.timeLogs.filter((l) => l.isBillable).reduce((s, l) => s + l.hours, 0);
      const laborCostKes = p.timeLogs.reduce((s, l) => s + l.hours * l.costRateSnap, 0);
      const billableRevenueKes = p.timeLogs
        .filter((l) => l.isBillable)
        .reduce((s, l) => s + l.hours * l.billingRateSnap, 0);
      const health = this.classifyProjectHealth(laborCostKes, p.budgetAmountKes, totalHours);

      const { timeLogs: _logs, ...rest } = p;
      return {
        ...rest,
        metrics: {
          totalHours: Number(totalHours.toFixed(2)),
          billableHours: Number(billableHours.toFixed(2)),
          billabilityPct: totalHours > 0 ? Number(((billableHours / totalHours) * 100).toFixed(2)) : 0,
          laborCostKes: canViewRates ? Number(laborCostKes.toFixed(2)) : null,
          billableRevenueKes: Number(billableRevenueKes.toFixed(2)),
          health,
        },
      };
    });
  }

  public async createProject(input: {
    code: string;
    name: string;
    clientId: string;
    department?: string;
    leadEmployeeId: string;
    budgetAmountKes?: number;
    budgetHours?: number;
    startDate: string;
    endDate: string;
  }) {
    const exists = await this.prisma.timeProject.findUnique({ where: { code: input.code } });
    if (exists) throw conflict(`Project code ${input.code} already exists`);
    return this.prisma.timeProject.create({
      data: input,
      include: { client: true, phases: true },
    });
  }

  public async createPhase(projectId: string, input: { name: string; startDate: string; endDate: string; progressPct?: number; sortOrder?: number }) {
    const proj = await this.prisma.timeProject.findUnique({ where: { id: projectId } });
    if (!proj) throw notFound('TimeProject', projectId);
    return this.prisma.timePhase.create({
      data: { projectId, ...input },
    });
  }

  public async updatePhaseProgress(phaseId: string, progressPct: number) {
    return this.prisma.timePhase.update({
      where: { id: phaseId },
      data: { progressPct },
    });
  }

  public async listRateCards() {
    return this.prisma.timeRateCard.findMany({ orderBy: { employeeId: 'asc' } });
  }

  public async getRateCard(employeeId: string) {
    return this.prisma.timeRateCard.findUnique({ where: { employeeId } });
  }

  public async upsertRateCard(input: {
    employeeId: string;
    costRateKes: number;
    billingRateKes: number;
    currency?: string;
    effectiveFrom?: string;
    updatedById: string;
  }) {
    return this.prisma.timeRateCard.upsert({
      where: { employeeId: input.employeeId },
      create: {
        employeeId: input.employeeId,
        costRateKes: input.costRateKes,
        billingRateKes: input.billingRateKes,
        currency: input.currency ?? 'KES',
        effectiveFrom: input.effectiveFrom ?? '2026-01-01',
        updatedById: input.updatedById,
      },
      update: {
        costRateKes: input.costRateKes,
        billingRateKes: input.billingRateKes,
        currency: input.currency,
        effectiveFrom: input.effectiveFrom,
        updatedById: input.updatedById,
      },
    });
  }

  public async listPeriods() {
    const periods = await this.prisma.timePeriodClose.findMany({
      orderBy: { startDate: 'desc' },
    });

    const result = [];
    for (const p of periods) {
      const unapprovedCount =
        p.status === 'LOCKED'
          ? 0
          : await this.prisma.timeLog.count({
              where: {
                workDate: { gte: p.startDate, lte: p.endDate },
                status: 'PENDING',
              },
            });
      result.push({
        ...p,
        unapprovedCount,
        snapshot: p.snapshotJson ? JSON.parse(p.snapshotJson) : null,
      });
    }
    return result;
  }

  public async openPeriod(input: { name: string; startDate: string; endDate: string }) {
    if (input.startDate > input.endDate) {
      throw validation('startDate cannot be after endDate');
    }
    const overlap = await this.prisma.timePeriodClose.findFirst({
      where: {
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
    });
    if (overlap) {
      throw conflict(`Period overlaps with existing period "${overlap.name}" (${overlap.startDate} to ${overlap.endDate}).`);
    }
    return this.prisma.timePeriodClose.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'OPEN',
      },
    });
  }

  public async approveAllPeriodLogs(periodId: string, actorUserId: string) {
    const period = await this.prisma.timePeriodClose.findUnique({ where: { id: periodId } });
    if (!period) throw notFound('TimePeriodClose', periodId);
    if (period.status === 'LOCKED') {
      throw new AppError(409, 'PERIOD_LOCKED', 'Cannot approve logs inside an already LOCKED period.');
    }

    const updated = await this.prisma.timeLog.updateMany({
      where: {
        workDate: { gte: period.startDate, lte: period.endDate },
        status: 'PENDING',
      },
      data: {
        status: 'APPROVED',
        approvedById: actorUserId,
        approvedAt: new Date(),
      },
    });

    return { approvedCount: updated.count };
  }

  /**
   * Computes exact financial formulas & seals an immutable month-end snapshot with SHA-256 checksum.
   */
  public computeKpis(logs: Array<{ hours: number; isBillable: boolean; costRateSnap: number; billingRateSnap: number }>) {
    const totalLoggedHours = logs.reduce((s, l) => s + l.hours, 0);
    const billableHours = logs.filter((l) => l.isBillable).reduce((s, l) => s + l.hours, 0);
    const nonBillableHours = totalLoggedHours - billableHours;

    const billabilityPct =
      totalLoggedHours > 0 ? Number(((billableHours / totalLoggedHours) * 100).toFixed(2)) : 0;
    const totalLaborCostKes = logs.reduce((s, l) => s + l.hours * l.costRateSnap, 0);
    const billableRevenueKes = logs
      .filter((l) => l.isBillable)
      .reduce((s, l) => s + l.hours * l.billingRateSnap, 0);
    const nonBillableLeakageKes = logs
      .filter((l) => !l.isBillable)
      .reduce((s, l) => s + l.hours * l.billingRateSnap, 0);
    const grossProfitKes = billableRevenueKes - totalLaborCostKes;
    const grossProfitMarginPct =
      billableRevenueKes > 0
        ? Number((((billableRevenueKes - totalLaborCostKes) / billableRevenueKes) * 100).toFixed(2))
        : 0;

    return {
      totalLoggedHours: Number(totalLoggedHours.toFixed(2)),
      billableHours: Number(billableHours.toFixed(2)),
      nonBillableHours: Number(nonBillableHours.toFixed(2)),
      billabilityPct,
      totalLaborCostKes: Number(totalLaborCostKes.toFixed(2)),
      billableRevenueKes: Number(billableRevenueKes.toFixed(2)),
      nonBillableLeakageKes: Number(nonBillableLeakageKes.toFixed(2)),
      grossProfitKes: Number(grossProfitKes.toFixed(2)),
      grossProfitMarginPct,
    };
  }

  /**
   * Closes a financial period, locks all entries, and seals SHA-256 audit snapshot.
   */
  public async closePeriod(periodId: string, actorUserId: string, autoApprove = false) {
    const period = await this.prisma.timePeriodClose.findUnique({ where: { id: periodId } });
    if (!period) throw notFound('TimePeriodClose', periodId);
    if (period.status === 'LOCKED') {
      throw new AppError(409, 'ALREADY_LOCKED', `Period "${period.name}" is already LOCKED.`);
    }

    const pendingCount = await this.prisma.timeLog.count({
      where: {
        workDate: { gte: period.startDate, lte: period.endDate },
        status: 'PENDING',
      },
    });

    if (pendingCount > 0) {
      if (autoApprove) {
        await this.approveAllPeriodLogs(periodId, actorUserId);
      } else {
        throw new AppError(
          400,
          'UNAPPROVED_LOGS_EXIST',
          `Cannot close period "${period.name}": ${pendingCount} PENDING time logs require review.`
        );
      }
    }

    const logsInPeriod = await this.prisma.timeLog.findMany({
      where: {
        workDate: { gte: period.startDate, lte: period.endDate },
        status: { not: 'REJECTED' },
      },
    });

    const kpis = this.computeKpis(logsInPeriod);
    const closedAt = new Date();
    const snapshot = {
      periodId: period.id,
      periodName: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      closedById: actorUserId,
      closedAt: closedAt.toISOString(),
      entriesLocked: logsInPeriod.length,
      kpis,
    };

    const snapshotJson = JSON.stringify(snapshot);
    const snapshotChecksum = crypto.createHash('sha256').update(snapshotJson).digest('hex');

    await this.prisma.timeLog.updateMany({
      where: {
        workDate: { gte: period.startDate, lte: period.endDate },
      },
      data: {
        status: 'LOCKED',
        periodId: period.id,
      },
    });

    return this.prisma.timePeriodClose.update({
      where: { id: period.id },
      data: {
        status: 'LOCKED',
        closedById: actorUserId,
        closedAt,
        snapshotJson,
        snapshotChecksum,
      },
    });
  }

  /**
   * Reopens a locked period with mandatory audit reasoning.
   */
  public async reopenPeriod(periodId: string, reason: string, _actorUserId: string) {
    if (!reason || reason.trim().length < 5) {
      throw validation('A descriptive justification (minimum 5 characters) is required to reopen a closed period.');
    }
    const period = await this.prisma.timePeriodClose.findUnique({ where: { id: periodId } });
    if (!period) throw notFound('TimePeriodClose', periodId);
    if (period.status !== 'LOCKED') {
      throw new AppError(400, 'PERIOD_NOT_LOCKED', 'Only LOCKED periods can be reopened.');
    }

    await this.prisma.timeLog.updateMany({
      where: { periodId: period.id, status: 'LOCKED' },
      data: { status: 'APPROVED', periodId: null },
    });

    return this.prisma.timePeriodClose.update({
      where: { id: period.id },
      data: { status: 'OPEN', closedAt: null, closedById: null },
    });
  }

  /**
   * Executive Overview & Project Health Matrix (ND-RUN-2026-10 Section 5).
   */
  public async getExecutiveOverview(
    filters: { startDate?: string; endDate?: string; projectId?: string; employeeId?: string },
    canViewRates: boolean
  ) {
    const where: any = { status: { not: 'REJECTED' } };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.startDate || filters.endDate) {
      where.workDate = {};
      if (filters.startDate) where.workDate.gte = filters.startDate;
      if (filters.endDate) where.workDate.lte = filters.endDate;
    }

    const logs = await this.prisma.timeLog.findMany({ where });
    const rawKpis = this.computeKpis(logs);

    const projects = await this.listProjects(canViewRates);
    const healthDistribution: Record<string, number> = {
      ON_TRACK: 0,
      WATCH: 0,
      ATTENTION: 0,
      OVER_BUDGET: 0,
      NO_BUDGET: 0,
    };
    const needsAttention = [];

    for (const prj of projects) {
      const h = prj.metrics.health.status;
      healthDistribution[h] = (healthDistribution[h] || 0) + 1;
      if (['ATTENTION', 'OVER_BUDGET', 'NO_BUDGET'].includes(h)) {
        needsAttention.push({
          id: prj.id,
          code: prj.code,
          name: prj.name,
          clientName: prj.client?.name,
          status: h,
          burnPct: prj.metrics.health.burnPct,
          label: prj.metrics.health.label,
        });
      }
    }

    return {
      kpis: canViewRates
        ? rawKpis
        : {
            ...rawKpis,
            totalLaborCostKes: null,
            grossProfitKes: null,
            grossProfitMarginPct: null,
          },
      healthDistribution,
      needsAttention,
      projects,
    };
  }

  /**
   * Computes Mon-Fri Expected vs Logged Capacity Utilization % per employee.
   */
  public async getTeamUtilization(startDate: string, endDate: string) {
    const workingDays = this.countWorkingDaysMonFri(startDate, endDate);
    const expectedHours = workingDays * 8;

    const [employees, logs] = await Promise.all([
      this.prisma.employee.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          position: { select: { title: true } },
        },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.timeLog.findMany({
        where: {
          workDate: { gte: startDate, lte: endDate },
          status: { not: 'REJECTED' },
        },
      }),
    ]);

    const byEmp = new Map<string, { logged: number; billable: number }>();
    for (const l of logs) {
      const cur = byEmp.get(l.employeeId) ?? { logged: 0, billable: 0 };
      cur.logged += l.hours;
      if (l.isBillable) cur.billable += l.hours;
      byEmp.set(l.employeeId, cur);
    }

    const rows = employees.map((emp) => {
      const agg = byEmp.get(emp.id) ?? { logged: 0, billable: 0 };
      const utilizationPct = expectedHours > 0 ? Number(((agg.logged / expectedHours) * 100).toFixed(1)) : 0;
      const billabilityPct = agg.logged > 0 ? Number(((agg.billable / agg.logged) * 100).toFixed(1)) : 0;
      return {
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: `${emp.firstName} ${emp.lastName}`,
        jobTitle: emp.position?.title || 'Staff',
        expectedHours,
        loggedHours: Number(agg.logged.toFixed(2)),
        billableHours: Number(agg.billable.toFixed(2)),
        utilizationPct,
        billabilityPct,
      };
    });

    return {
      startDate,
      endDate,
      workingDays,
      expectedHoursPerEmployee: expectedHours,
      employees: rows,
    };
  }
}
