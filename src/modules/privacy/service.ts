import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { validation, forbidden, notFound, conflict } from '../../core/errors/errors.js';
import { decrypt } from '../../core/crypto/vault.js';
import {
  SubmitDSRInput,
  ReviewDSRInput,
  ApplyLegalHoldInput,
  ReleaseLegalHoldInput,
  DPIARecord,
  EmployeeDataPortabilityPackage,
} from './types.js';

const DPIA_REGISTER: DPIARecord[] = [
  {
    processingActivity: 'Workforce Master & Identity Lifecycle',
    lawfulBasis: 'Performance of Employment Contract (Kenya DPA 2019 s.30(1)(b)) & Legal Obligation',
    dataCategories: ['Legal Name', 'Date of Birth', 'Work Email', 'Phone Number', 'Postal Address', 'Job Title', 'Department'],
    sensitiveDataCategories: ['National Identity / Passport (Encrypted)', 'KRA PIN', 'Emergency Next of Kin Contact'],
    dataMinimisationSafeguards: 'AES-256-GCM encryption of sensitive statutory IDs; field-level masking in UI; role-based isolation preventing general manager inspection',
    retentionPeriod: 'Duration of active employment plus 7 years post-separation (Employment Act 2007 s.74)',
    crossBorderTransfers: 'None. In-region data sovereignty maintained.',
    residualRisk: 'LOW',
  },
  {
    processingActivity: 'Remuneration & Kenyan Statutory Payroll (R3)',
    lawfulBasis: 'Statutory Obligation (Income Tax Act Cap 470, NSSF Act No. 45, SHIF Act 2023, Affordable Housing Act 2024)',
    dataCategories: ['Gross Salary', 'Allowances', 'Benefits in Kind', 'Voluntary Deductions', 'Net Pay'],
    sensitiveDataCategories: ['Bank Account & Routing Details (Encrypted)', 'KRA Tax PIN', 'NSSF Number', 'SHIF Number'],
    dataMinimisationSafeguards: 'Dual-approval segregation of duties; bank export limited to disbursement attributes (no tax brackets sent to bank); zero payment API initiation',
    retentionPeriod: '7 years from tax year of assessment (Tax Procedures Act 2015 s.23)',
    crossBorderTransfers: 'None.',
    residualRisk: 'LOW',
  },
  {
    processingActivity: 'Employee Relations & Disciplinary Case Management (R1.1)',
    lawfulBasis: 'Statutory Compliance (Employment Act s.41 Procedural Fairness) & Legitimate Interest',
    dataCategories: ['Case Reference', 'Allegation Summary', 'Investigator Notes', 'Hearing Minutes', 'Outcome Letters'],
    sensitiveDataCategories: ['Special Category Case Evidence', 'Whistleblower Identity (Strict Cryptographic Anonymisation)'],
    dataMinimisationSafeguards: 'Case-level role-based isolation; explicit case handler assignment; whistleblower disclosures overseen strictly by DPO / Managing Partner',
    retentionPeriod: '6 years post-case resolution, or until release of litigation hold',
    crossBorderTransfers: 'None.',
    residualRisk: 'MEDIUM',
  },
  {
    processingActivity: 'Performance Appraisals & PIP Governance (R2)',
    lawfulBasis: 'Legitimate Business Interest & Contract Administration',
    dataCategories: ['Agreed Objectives', 'Self-Appraisal Ratings', 'Manager Ratings', 'PIP Action Milestones', 'Development Plans'],
    sensitiveDataCategories: ['Performance improvement determinations'],
    dataMinimisationSafeguards: 'Self-review first protocol; restricted line manager visibility limited to direct reporting hierarchy; no automated AI termination scoring',
    retentionPeriod: '5 years post-appraisal cycle',
    crossBorderTransfers: 'None.',
    residualRisk: 'LOW',
  },
  {
    processingActivity: 'Leave Administration & Absence Tracking (R1)',
    lawfulBasis: 'Statutory Obligation (Employment Act s.28-34) & Contract Performance',
    dataCategories: ['Leave Balances', 'Accrual Rates', 'Dates Taken', 'Absence Categories'],
    sensitiveDataCategories: ['Sick Leave Doctor Medical Notes (Restricted Medical Quarantine)'],
    dataMinimisationSafeguards: 'Medical certificates quarantined from general line managers; append-only immutable ledger prevents balance tampering',
    retentionPeriod: '7 years post-employment',
    crossBorderTransfers: 'None.',
    residualRisk: 'LOW',
  },
];

export class PrivacyService {
  constructor(private prisma: PrismaClient) {}

  // =========================================================================
  // 1. DPIA REGISTER
  // =========================================================================

  getDPIARegister(): DPIARecord[] {
    return DPIA_REGISTER;
  }

  // =========================================================================
  // 2. DATA SUBJECT REQUESTS (DSR)
  // =========================================================================

  async listDSRRequests(filter?: { employeeId?: string; status?: string }) {
    return await this.prisma.privacyDataSubjectRequest.findMany({
      where: {
        employeeId: filter?.employeeId,
        status: filter?.status,
      },
      include: {
        employee: {
          select: {
            employeeNumber: true,
            firstName: true,
            lastName: true,
            workEmail: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDSRRequest(id: string) {
    const dsr = await this.prisma.privacyDataSubjectRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            department: true,
          },
        },
      },
    });
    if (!dsr) throw notFound(`DSR request ${id} not found`);
    return dsr;
  }

  async submitDSR(input: SubmitDSRInput, auditCtx: AuditContext) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: input.employeeId },
    });
    if (!employee) throw notFound(`Employee ${input.employeeId} not found`);

    const count = await this.prisma.privacyDataSubjectRequest.count();
    const requestNumber = `DSR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const dsr = await this.prisma.privacyDataSubjectRequest.create({
      data: {
        requestNumber,
        employeeId: employee.id,
        requestType: input.requestType,
        status: 'SUBMITTED',
        lawfulJustification: input.lawfulJustification,
        details: input.details,
        requesterEmail: input.requesterEmail,
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PRIVACY_DSR_SUBMITTED',
      targetType: 'PrivacyDataSubjectRequest',
      targetId: dsr.id,
      outcome: 'SUCCESS',
      after: {
        requestNumber,
        requestType: input.requestType,
        employeeNumber: employee.employeeNumber,
      },
    });

    return dsr;
  }

  async reviewDSR(input: ReviewDSRInput, auditCtx: AuditContext) {
    const dsr = await this.prisma.privacyDataSubjectRequest.findUnique({
      where: { id: input.requestId },
      include: { employee: true },
    });
    if (!dsr) throw notFound(`DSR request ${input.requestId} not found`);

    if (dsr.status === 'FULFILLED') {
      throw validation('DSR request is already fulfilled');
    }

    // FULFILL ERASURE: Must strictly check for active Legal Holds & statutory record retention
    if (input.action === 'FULFILL' && dsr.requestType === 'ERASURE') {
      // 1. Check for Active Legal Holds
      const activeHolds = await this.prisma.privacyLegalHold.findMany({
        where: {
          employeeId: dsr.employeeId,
          status: 'ACTIVE',
        },
      });

      if (activeHolds.length > 0) {
        const holdRefs = activeHolds.map((h) => `${h.holdReference} (${h.matterTitle})`).join(', ');
        throw forbidden(
          `Statutory Erasure Refusal: Employee record is currently under active litigation/legal hold [${holdRefs}]. Under Section 40(3) of Kenya DPA 2019, erasure is overridden by legal proceedings.`
        );
      }

      // 2. Check Employment Act & Tax retention obligations
      if (dsr.employee.status === 'ACTIVE' || dsr.employee.status === 'PROBATION') {
        throw validation(
          'Statutory Erasure Limitation: Cannot erase personal records for currently active workforce members. Mandatory records must be retained pursuant to Employment Act s.74.'
        );
      }
    }

    let status = dsr.status;
    let fulfilledAt = dsr.fulfilledAt;
    let artifactPath = dsr.exportArtifactPath;

    if (input.action === 'APPROVE') {
      status = 'APPROVED';
    } else if (input.action === 'REJECT') {
      status = 'REJECTED';
    } else if (input.action === 'FULFILL') {
      status = 'FULFILLED';
      fulfilledAt = new Date();

      if (dsr.requestType === 'ACCESS' || dsr.requestType === 'PORTABILITY') {
        artifactPath = `export/dsr-${dsr.requestNumber}.json`;
      }
    }

    const updated = await this.prisma.privacyDataSubjectRequest.update({
      where: { id: dsr.id },
      data: {
        status,
        rejectionReason: input.rejectionReason,
        handlerUserId: input.handlerUserId,
        fulfilledAt,
        exportArtifactPath: artifactPath,
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: `PRIVACY_DSR_${input.action}`,
      targetType: 'PrivacyDataSubjectRequest',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        requestNumber: dsr.requestNumber,
        newStatus: status,
        rejectionReason: input.rejectionReason,
      },
    });

    return updated;
  }

  // =========================================================================
  // 3. DATA PORTABILITY & ACCESS PACKAGE GENERATOR
  // =========================================================================

  async generatePortabilityPackage(employeeId: string): Promise<EmployeeDataPortabilityPackage> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: true,
        position: true,
        grade: true,
        agreements: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
        leaveLedgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        trainingAssignments: {
          include: { programme: true },
        },
        performanceAppraisals: {
          take: 5,
        },
        payrollSlips: {
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
    });

    if (!employee) throw notFound(`Employee ${employeeId} not found`);

    // Calculate leave balance
    const approvedLeaveDays = employee.leaveLedgerEntries
      .filter((e: any) => e.eventType === 'LEAVE_TAKEN')
      .reduce((sum: number, e: any) => sum + Math.abs(e.units), 0);

    const activeAgreement = employee.agreements[0];

    return {
      metadata: {
        exportId: `DSR-PORTABILITY-${Date.now()}`,
        exportedAt: new Date().toISOString(),
        employeeNumber: employee.employeeNumber,
        workEmail: employee.workEmail,
        jurisdiction: 'Kenya (Data Protection Act 2019 / GDPR Art 20)',
        lawfulBasis: 'Data Subject Right to Data Portability (Section 38)',
        redactionNotice:
          'Employer confidential deliberations, ongoing whistleblower investigations, and third-party PII are excluded pursuant to statutory exemptions.',
      },
      personalProfile: {
        fullName: `${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`.replace(/\s+/g, ' ').trim(),
        personalEmail: employee.personalEmail || undefined,
        phoneNumber: employee.phoneNumber || undefined,
        emergencyContact: employee.emergencyContactName
          ? `${employee.emergencyContactName} (${employee.emergencyContactRelationship || 'Next of Kin'})`
          : undefined,
        dateOfBirth: employee.dateOfBirth?.toISOString().split('T')[0],
        nationality: 'Kenyan',
      },
      employmentHistory: [
        {
          jobTitle: activeAgreement?.jobTitle || employee.position?.title || 'Staff Member',
          department: employee.department?.name || 'Ndakala Advisory',
          employmentType: activeAgreement?.employmentCategoryCode || 'PERMANENT',
          startDate: activeAgreement?.startDate?.toISOString().split('T')[0] || employee.createdAt.toISOString().split('T')[0],
          endDate: activeAgreement?.endDate?.toISOString().split('T')[0] ?? null,
          status: employee.status,
        },
      ],
      leaveSummary: {
        leaveLedgerEntriesCount: employee.leaveLedgerEntries.length,
        approvedLeaveDaysTaken: approvedLeaveDays,
        currentAnnualBalance: 21 - approvedLeaveDays,
      },
      trainingAndCertifications: employee.trainingAssignments.map((t: any) => ({
        programmeCode: t.programme.code,
        programmeName: t.programme.name,
        completedAt: t.completedAt?.toISOString() ?? null,
        passed: t.passed,
        certificateNumber: t.certificateNumber,
      })),
      performanceAppraisals: employee.performanceAppraisals.map((a: any) => ({
        cycleName: a.cycleId,
        period: 'Annual/Quarterly Appraisal',
        rating: a.managerRatingCode,
        employeeComments: a.selfAchievements,
        managerComments: a.managerGeneralComments,
      })),
      remunerationSummary: {
        payFrequency: 'Monthly',
        currency: 'KES',
        recordedPayslipsCount: employee.payrollSlips.length,
        statutoryDeductionsComplied: ['PAYE (Income Tax)', 'NSSF (Tier 1 & Tier 2)', 'SHIF (2.75%)', 'Affordable Housing Levy (1.5%)'],
      },
    };
  }

  // =========================================================================
  // 4. LITIGATION & REGULATORY LEGAL HOLDS
  // =========================================================================

  async listLegalHolds(employeeId?: string) {
    return await this.prisma.privacyLegalHold.findMany({
      where: employeeId ? { employeeId } : undefined,
      include: {
        employee: {
          select: {
            employeeNumber: true,
            firstName: true,
            lastName: true,
            workEmail: true,
          },
        },
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async applyLegalHold(input: ApplyLegalHoldInput, authorizedById: string, auditCtx: AuditContext) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: input.employeeId },
    });
    if (!employee) throw notFound(`Employee ${input.employeeId} not found`);

    const count = await this.prisma.privacyLegalHold.count();
    const holdReference = `HOLD-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const hold = await this.prisma.privacyLegalHold.create({
      data: {
        holdReference,
        employeeId: employee.id,
        matterTitle: input.matterTitle,
        reasonCategory: input.reasonCategory,
        status: 'ACTIVE',
        authorizedById,
        notes: input.notes,
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PRIVACY_LEGAL_HOLD_APPLIED',
      targetType: 'PrivacyLegalHold',
      targetId: hold.id,
      outcome: 'SUCCESS',
      after: {
        holdReference,
        matterTitle: input.matterTitle,
        employeeNumber: employee.employeeNumber,
        reasonCategory: input.reasonCategory,
      },
    });

    return hold;
  }

  async releaseLegalHold(input: ReleaseLegalHoldInput, auditCtx: AuditContext) {
    const hold = await this.prisma.privacyLegalHold.findUnique({
      where: { id: input.holdId },
      include: { employee: true },
    });
    if (!hold) throw notFound(`Legal hold ${input.holdId} not found`);

    if (hold.status === 'RELEASED') {
      throw validation(`Legal hold ${hold.holdReference} is already released`);
    }

    const released = await this.prisma.privacyLegalHold.update({
      where: { id: hold.id },
      data: {
        status: 'RELEASED',
        releaseDate: new Date(),
        notes: input.notes ? `${hold.notes || ''}\n[RELEASE NOTE]: ${input.notes}`.trim() : hold.notes,
      },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PRIVACY_LEGAL_HOLD_RELEASED',
      targetType: 'PrivacyLegalHold',
      targetId: released.id,
      outcome: 'SUCCESS',
      after: {
        holdReference: hold.holdReference,
        releaseNotes: input.notes,
      },
    });

    return released;
  }
}
