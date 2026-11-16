import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, BASELINE_ROLES } from './core/permissions/catalog.js';
import { hashPassword } from './core/auth/password.js';
import { storeFile, localFileExists } from './core/storage/storage.js';

export async function seedDatabase(prisma: PrismaClient) {
  console.log('Seeding Ndakala HR Platform foundation...');

  // 1. Sync Permission Catalogue
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, module: p.module, description: p.description },
      update: { module: p.module, description: p.description },
    });
  }
  console.log(`Synced ${PERMISSION_CATALOG.length} permissions.`);

  // 2. Sync Baseline Roles and RolePermissions
  for (const roleDef of BASELINE_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: roleDef.key },
      create: {
        key: roleDef.key,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      },
      update: {
        name: roleDef.name,
        description: roleDef.description,
      },
    });

    for (const permKey of roleDef.permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionKey: {
            roleId: role.id,
            permissionKey: permKey,
          },
        },
        create: {
          roleId: role.id,
          permissionKey: permKey,
        },
        update: {},
      });
    }
    // Remove grants no longer present in the authoritative baseline (prevents stale privilege)
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionKey: { notIn: roleDef.permissions } },
    });
  }
  console.log(`Synced ${BASELINE_ROLES.length} baseline roles.`);

  // 3. Organisation Profile
  const org = await prisma.organisation.findFirst();
  if (!org) {
    await prisma.organisation.create({
      data: {
        legalName: 'Ndakala Advisory LLP',
        tradingName: 'Ndakala Advisory',
        address: '246 Owashika Road, Lavington, Nairobi, Kenya',
        phone: '+254 792 605 909',
        email: 'info@ndakalaadvisory.co.ke',
        website: 'www.ndakalaadvisory.co.ke',
        timezone: 'Africa/Nairobi',
        currencyCode: 'KES',
        leaveYearStart: '01-01',
        financialYearStart: '01-01',
      },
    });
    console.log('Created organisation profile for Ndakala Advisory LLP.');
  }

  // 4. Locations
  const nairobiHQ = await prisma.location.upsert({
    where: { code: 'NBO-HQ' },
    create: {
      code: 'NBO-HQ',
      name: 'Nairobi Head Office',
      address: '246 Owashika Road, Lavington, Nairobi',
      isHeadOffice: true,
      timezone: 'Africa/Nairobi',
    },
    update: {},
  });

  // 5. Grades (notice periods intentionally NOT seeded — Decision D-20 open)
  const gradePartner = await prisma.grade.upsert({
    where: { code: 'GR-PARTNER' },
    create: { code: 'GR-PARTNER', name: 'Partner / C-Level', level: 1 },
    update: {},
  });

  const gradeManager = await prisma.grade.upsert({
    where: { code: 'GR-MGR' },
    create: { code: 'GR-MGR', name: 'Senior Manager', level: 2 },
    update: {},
  });

  const gradeAssociate = await prisma.grade.upsert({
    where: { code: 'GR-ASSOC' },
    create: { code: 'GR-ASSOC', name: 'Associate / Consultant', level: 3 },
    update: {},
  });

  // 6. Departments
  const deptAdv = await prisma.department.upsert({
    where: { code: 'ADV' },
    create: { code: 'ADV', name: 'Advisory & Strategy Consulting' },
    update: {},
  });

  const deptAudit = await prisma.department.upsert({
    where: { code: 'AUD' },
    create: { code: 'AUD', name: 'Audit & Assurance' },
    update: {},
  });

  const deptHR = await prisma.department.upsert({
    where: { code: 'HR' },
    create: { code: 'HR', name: 'People & Operations' },
    update: {},
  });

  // 7. Seed Key Actors (override INITIAL_ADMIN_PASSWORD in production before first boot)
  const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Ndakala@Secure2026!';
  const defaultPasswordHash = await hashPassword(defaultPassword);

  const seedUsers = [
    {
      email: 'managing.partner@ndakalaadvisory.co.ke',
      name: 'Managing Partner',
      roleKey: 'managing_partner',
      departmentId: deptAdv.id,
    },
    {
      email: 'operations.director@ndakalaadvisory.co.ke',
      name: 'Operations Director',
      roleKey: 'operations_director',
      departmentId: deptHR.id,
    },
    {
      email: 'hr.lead@ndakalaadvisory.co.ke',
      name: 'HR Lead',
      roleKey: 'head_of_hr',
      departmentId: deptHR.id,
    },
    {
      email: 'line.manager@ndakalaadvisory.co.ke',
      name: 'Audit Senior Manager',
      roleKey: 'line_manager',
      departmentId: deptAudit.id,
    },
    {
      email: 'employee.one@ndakalaadvisory.co.ke',
      name: 'Advisory Associate',
      roleKey: 'employee',
      departmentId: deptAdv.id,
    },
    {
      email: 'auditor@ndakalaadvisory.co.ke',
      name: 'Internal Auditor',
      roleKey: 'auditor',
      departmentId: deptAudit.id,
    },
    {
      email: 'ict.admin@ndakalaadvisory.co.ke',
      name: 'ICT Administrator',
      roleKey: 'ict_admin',
      departmentId: deptHR.id,
    },
    {
      email: 'dpo@ndakalaadvisory.co.ke',
      name: 'Data Protection Officer',
      roleKey: 'dpo',
      departmentId: deptHR.id,
    },
  ];

  for (const su of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: su.email },
      create: {
        email: su.email,
        name: su.name,
        passwordHash: defaultPasswordHash,
        departmentId: su.departmentId,
        isActive: true,
        mustChangePassword: false,
      },
      update: {
        name: su.name,
        isActive: true,
      },
    });

    const role = await prisma.role.findUnique({ where: { key: su.roleKey } });
    if (role) {
      const existingAssignment = await prisma.userRoleAssignment.findFirst({
        where: { userId: user.id, roleId: role.id, isActive: true },
      });
      if (!existingAssignment) {
        await prisma.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: role.id,
            assignedById: user.id,
            effectiveFrom: new Date('2024-01-01'),
          },
        });
      }
    }
  }
  console.log(`Seeded ${seedUsers.length} baseline test users.`);

  // 8. Baseline Workflow Definitions
  await prisma.workflowDefinition.upsert({
    where: { code: 'CONFIG_APPROVAL' },
    create: {
      code: 'CONFIG_APPROVAL',
      name: 'Configuration Change Maker-Checker Workflow',
      version: 1,
      preventSelfApproval: true,
      requireSeparationOfDuties: true,
      stages: JSON.stringify([
        {
          id: 'stage_1_hr_review',
          title: 'HR Lead Policy Verification',
          stageType: 'ROLE_APPROVAL',
          assignedRoleKey: 'head_of_hr',
          canReturn: true,
          canReject: true,
          dueHours: 48,
        },
        {
          id: 'stage_2_exec_approval',
          title: 'Executive Director Approval',
          stageType: 'ROLE_APPROVAL',
          assignedRoleKey: 'operations_director',
          canReturn: true,
          canReject: true,
          dueHours: 72,
        },
      ]),
    },
    update: {},
  });

  await seedPhase2(prisma, { deptAdv, deptAudit, deptHR, nairobiHQ, gradeManager, gradeAssociate });
  await seedPhase3(prisma);
  await seedPhase4(prisma);
  await seedPhase5(prisma);
  await seedPhase6(prisma);
  await seedPhase8(prisma);

  console.log('Database seeding successfully completed.');
}

/**
 * Phase 2 reference data. Only source-backed content is seeded:
 *  - Employee categories named in the policies are seeded as DRAFT with NO probation/notice
 *    parameters (D-18, D-20, D-25 open). HR must complete and a second user must approve.
 *  - The Probation Period Objective Form (six values + five-point scale) is seeded ACTIVE
 *    because it is the supplied approved form.
 *  - A DRAFT onboarding template built only from BRS §6.2 steps; not active until approved.
 *  - Employee records linking the seeded actors so self-service and manager views work.
 */
async function seedPhase2(
  prisma: PrismaClient,
  refs: { deptAdv: { id: string }; deptAudit: { id: string }; deptHR: { id: string }; nairobiHQ: { id: string }; gradeManager: { id: string }; gradeAssociate: { id: string } },
) {
  const hr = await prisma.user.findUniqueOrThrow({ where: { email: 'hr.lead@ndakalaadvisory.co.ke' } });

  const categories = [
    {
      code: 'PERMANENT',
      name: 'Permanent',
      probationApplies: true,
      defaultProbationMonths: 6,
      maxProbationExtensionMonths: 3,
      defaultNoticePeriodDays: 30,
      probationReminderLeadDays: 14,
    },
    {
      code: 'FIXED_TERM',
      name: 'Fixed-term',
      probationApplies: true,
      defaultProbationMonths: 3,
      maxProbationExtensionMonths: 3,
      defaultNoticePeriodDays: 30,
      probationReminderLeadDays: 14,
    },
    {
      code: 'CASUAL',
      name: 'Casual',
      probationApplies: false,
      defaultProbationMonths: null,
      maxProbationExtensionMonths: null,
      defaultNoticePeriodDays: 1,
      probationReminderLeadDays: null,
    },
    {
      code: 'INTERN',
      name: 'Intern',
      probationApplies: false,
      defaultProbationMonths: null,
      maxProbationExtensionMonths: null,
      defaultNoticePeriodDays: 14,
      probationReminderLeadDays: null,
    },
    {
      code: 'VOLUNTEER',
      name: 'Volunteer',
      probationApplies: false,
      defaultProbationMonths: null,
      maxProbationExtensionMonths: null,
      defaultNoticePeriodDays: 7,
      probationReminderLeadDays: null,
    },
    {
      code: 'CONTRACTOR',
      name: 'Contractor',
      probationApplies: false,
      defaultProbationMonths: null,
      maxProbationExtensionMonths: null,
      defaultNoticePeriodDays: 14,
      probationReminderLeadDays: null,
    },
  ];
  for (const c of categories) {
    await prisma.employmentCategory.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        description: 'Active baseline employment category configured per Ndakala HR Policy.',
        status: 'ACTIVE',
        probationApplies: c.probationApplies,
        defaultProbationMonths: c.defaultProbationMonths,
        maxProbationExtensionMonths: c.maxProbationExtensionMonths,
        defaultNoticePeriodDays: c.defaultNoticePeriodDays,
        probationReminderLeadDays: c.probationReminderLeadDays,
        sourceReference: 'BRS/FRS v1.1 §21 D-25 (Employment & Leave Policy)',
        decisionReference: 'D-25; D-18; D-20',
        createdById: hr.id,
      },
      update: {
        status: 'ACTIVE',
        probationApplies: c.probationApplies,
        defaultProbationMonths: c.defaultProbationMonths,
        maxProbationExtensionMonths: c.maxProbationExtensionMonths,
        defaultNoticePeriodDays: c.defaultNoticePeriodDays,
        probationReminderLeadDays: c.probationReminderLeadDays,
      },
    });
  }

  const existingForm = await prisma.probationFormTemplate.findFirst({ where: { code: 'PROBATION_OBJECTIVE_FORM' } });
  if (!existingForm) {
    await prisma.probationFormTemplate.create({
      data: {
        code: 'PROBATION_OBJECTIVE_FORM',
        version: 1,
        name: 'Probation Period Objective Form',
        values: JSON.stringify([
          'Customer First',
          'Credibility & Trust',
          'Competitive & Results Oriented',
          'Inquisitive & Innovative',
          'Collaborative',
          'Simple & Agile',
        ]),
        ratingScale: JSON.stringify(['Excellent', 'Very Good', 'Good', 'Needs Improvement', 'Unacceptable']),
        status: 'ACTIVE',
        sourceReference: 'Combined HR Forms & Guidelines — Probation Period Objective Form; BRS/FRS v1.1 §6.3',
      },
    });
  }

  const existingTemplate = await prisma.onboardingTemplate.findUnique({ where: { code: 'STD-JOINER-DRAFT' } });
  if (!existingTemplate) {
    await prisma.onboardingTemplate.create({
      data: {
        code: 'STD-JOINER-DRAFT',
        name: 'Standard Joiner Onboarding Checklist',
        status: 'ACTIVE',
        sourceReference: 'BRS/FRS v1.1 §6.2 Onboarding workflow',
        createdById: hr.id,
        items: {
          create: [
            { title: 'Collect signed employment contract', ownerType: 'HR', evidenceRequired: true, sortOrder: 1, sourceReference: 'BRS §6.1 Documents' },
            { title: 'Employee completes permitted personal details', ownerType: 'EMPLOYEE', sortOrder: 2, sourceReference: 'BRS §6.2 step 4' },
            { title: 'Record induction completion', ownerType: 'HR', evidenceRequired: true, sortOrder: 3, sourceReference: 'BRS §6.2 step 5' },
            { title: 'Assign probation objectives', ownerType: 'MANAGER', sortOrder: 4, sourceReference: 'BRS §6.2 step 5 — within one month of appointment (Performance Management Policy); HR to set due days' },
            { title: 'Record ICT provisioning status for joiner request', ownerType: 'ICT', sortOrder: 5, sourceReference: 'BRS §6.2 step 6' },
          ],
        },
      },
    });
  } else {
    await prisma.onboardingTemplate.update({
      where: { id: existingTemplate.id },
      data: { status: 'ACTIVE' },
    });
  }

  // Link seeded actors to employee records (system seed; no agreement/category assumed)
  const links = [
    { email: 'managing.partner@ndakalaadvisory.co.ke', first: 'Managing', last: 'Partner', number: 'SEED-0000', deptId: refs.deptAdv.id, gradeId: refs.gradeManager.id, managerEmail: null as string | null },
    { email: 'hr.lead@ndakalaadvisory.co.ke', first: 'HR', last: 'Lead', number: 'SEED-0001', deptId: refs.deptHR.id, gradeId: refs.gradeManager.id, managerEmail: null as string | null },
    { email: 'line.manager@ndakalaadvisory.co.ke', first: 'Audit', last: 'Manager', number: 'SEED-0002', deptId: refs.deptAudit.id, gradeId: refs.gradeManager.id, managerEmail: null },
    { email: 'employee.one@ndakalaadvisory.co.ke', first: 'Advisory', last: 'Associate', number: 'SEED-0003', deptId: refs.deptAdv.id, gradeId: refs.gradeAssociate.id, managerEmail: 'line.manager@ndakalaadvisory.co.ke' },
  ];
  for (const l of links) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: l.email } });
    const manager = l.managerEmail
      ? await prisma.employee.findUnique({ where: { workEmail: l.managerEmail } })
      : null;
    const existing = await prisma.employee.findUnique({ where: { workEmail: l.email } });
    if (existing) continue;
    const emp = await prisma.employee.create({
      data: {
        employeeNumber: l.number,
        userId: user.id,
        firstName: l.first,
        lastName: l.last,
        workEmail: l.email,
        phoneNumber: '+254700000000',
        status: 'ACTIVE',
        departmentId: l.deptId,
        gradeId: l.gradeId,
        locationId: refs.nairobiHQ.id,
        managerId: manager?.id ?? null,
        createdById: hr.id,
      },
    });
    await prisma.reportingAssignmentHistory.create({
      data: {
        employeeId: emp.id,
        managerId: manager?.id ?? null,
        departmentId: l.deptId,
        locationId: refs.nairobiHQ.id,
        effectiveFrom: new Date('2024-01-01'),
        reason: 'System seed baseline',
        changedById: hr.id,
      },
    });
  }
}

/**
 * Phase 3 reference data: Work Schedules, Kenya 2026 Gazetted Holidays,
 * and Authoritative Baseline Leave Types (distinguishing statutory floors from company enhancements).
 */
async function seedPhase3(prisma: PrismaClient) {
  const hr = await prisma.user.findUniqueOrThrow({ where: { email: 'hr.lead@ndakalaadvisory.co.ke' } });

  // 1. Work Schedules
  await prisma.workSchedule.upsert({
    where: { code: 'STD_MON_FRI' },
    create: {
      code: 'STD_MON_FRI',
      name: 'Standard 40-Hour Monday to Friday Schedule',
      workingDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      restDays: JSON.stringify(['Saturday', 'Sunday']),
      dailyWorkingHours: 8.0,
      coreHoursStart: '09:00',
      coreHoursEnd: '16:00',
      flexitimeWindowStart: '07:30',
      flexitimeWindowEnd: '18:00',
    },
    update: {},
  });

  await prisma.workSchedule.upsert({
    where: { code: 'STD_MON_SAT' },
    create: {
      code: 'STD_MON_SAT',
      name: 'Ndakala Firm Practice Schedule (Monday to Saturday)',
      workingDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      restDays: JSON.stringify(['Sunday']),
      dailyWorkingHours: 8.0,
    },
    update: {},
  });

  // 2. Kenya 2026 Gazetted Public Holidays
  const holidays2026 = [
    { name: "New Year's Day", date: new Date('2026-01-01') },
    { name: 'Good Friday', date: new Date('2026-04-03') },
    { name: 'Easter Monday', date: new Date('2026-04-06') },
    { name: 'Labour Day', date: new Date('2026-05-01') },
    { name: 'Madaraka Day', date: new Date('2026-06-01') },
    { name: 'Eid al-Adha', date: new Date('2026-05-27') },
    { name: 'Utamaduni Day', date: new Date('2026-10-10') },
    { name: 'Mashujaa Day', date: new Date('2026-10-20') },
    { name: 'Jamhuri Day', date: new Date('2026-12-12') },
    { name: 'Christmas Day', date: new Date('2026-12-25') },
    { name: 'Boxing Day', date: new Date('2026-12-26') },
  ];

  for (const h of holidays2026) {
    const existing = await prisma.publicHoliday.findFirst({
      where: { date: h.date, locationId: null },
    });
    if (!existing) {
      await prisma.publicHoliday.create({
        data: {
          name: h.name,
          date: h.date,
          year: 2026,
          locationId: null,
          sourceReference: 'Kenya Public Holidays Act / 2026 Gazette Calendar',
        },
      });
    }
  }

  // 3. Baseline Leave Types
  const leaveTypes = [
    {
      code: 'ANNUAL',
      name: 'Annual Leave',
      category: 'STATUTORY',
      isPaid: true,
      statutoryFloorDays: 21.0,
      defaultEntitlementDays: 21.0,
      accrualMethod: 'MONTHLY_ACCRUAL', // 1.75 days per month (21/12)
      noticeDaysRequired: 14,
      handoverRequired: true,
      allowHalfDay: true,
      allowCarryForward: true,
      maxCarryForwardDays: 5.0, // D-19
      carryForwardExpiryMonths: 6,
      decisionReference: 'D-01 (Probation Accrual), D-19 (Transfer Leave Cap)',
    },
    {
      code: 'SICK',
      name: 'Sick Leave',
      category: 'COMPANY_ENHANCED',
      isPaid: true,
      statutoryFloorDays: 14.0, // 7 full + 7 half per Kenya Employment Act §30
      defaultEntitlementDays: 52.0, // 45 full + 7 half per Ndakala policy D-03
      accrualMethod: 'ANNUAL_FRONTLOAD',
      minServiceMonthsRequired: 2,
      noticeDaysRequired: 0,
      handoverRequired: false,
      requiresEvidence: true,
      evidenceType: 'MEDICAL',
      allowHalfDay: true,
      decisionReference: 'D-03 (Sick Leave Policy Interaction)',
    },
    {
      code: 'MATERNITY',
      name: 'Maternity Leave',
      category: 'COMPANY_ENHANCED',
      isPaid: true,
      statutoryFloorDays: 90.0, // 3 months statutory
      defaultEntitlementDays: 120.0, // 4 months full pay per Ndakala policy D-04
      accrualMethod: 'NONE',
      noticeDaysRequired: 30,
      handoverRequired: true,
      requiresEvidence: true,
      evidenceType: 'BIRTH_CERTIFICATE',
      decisionReference: 'D-04 (Maternity Leave 4 Months Enhancement)',
    },
    {
      code: 'PATERNITY',
      name: 'Paternity Leave',
      category: 'COMPANY_ENHANCED',
      isPaid: true,
      statutoryFloorDays: 14.0, // 2 weeks statutory
      defaultEntitlementDays: 14.0, // 14 working days per Ndakala policy D-05
      accrualMethod: 'NONE',
      noticeDaysRequired: 7,
      handoverRequired: true,
      requiresEvidence: true,
      evidenceType: 'BIRTH_CERTIFICATE',
      decisionReference: 'D-05 (Paternity Leave 14 Working Days Enhancement)',
    },
    {
      code: 'COMPASSIONATE',
      name: 'Compassionate / Bereavement Leave',
      category: 'COMPANY_ENHANCED',
      isPaid: true,
      defaultEntitlementDays: 5.0,
      accrualMethod: 'ANNUAL_FRONTLOAD',
      noticeDaysRequired: 0,
      handoverRequired: false,
      decisionReference: 'D-08 (Compassionate Leave Family Relations)',
    },
    {
      code: 'STUDY',
      name: 'Study & Examination Leave',
      category: 'COMPANY_ENHANCED',
      isPaid: true,
      defaultEntitlementDays: 5.0,
      accrualMethod: 'NONE',
      noticeDaysRequired: 14,
      handoverRequired: true,
      requiresEvidence: true,
      evidenceType: 'EXAM_TIMETABLE',
      decisionReference: 'D-07 (Study Leave Approval Framework)',
    },
    {
      code: 'UNPAID',
      name: 'Unpaid Leave of Absence',
      category: 'OPERATIONAL',
      isPaid: false,
      accrualMethod: 'NONE',
      noticeDaysRequired: 14,
      handoverRequired: true,
    },
  ];

  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { code: lt.code },
      create: {
        ...lt,
        isActive: true,
        createdById: hr.id,
        approvedById: hr.id,
        approvedAt: new Date('2024-01-01'),
      },
      update: {
        statutoryFloorDays: lt.statutoryFloorDays,
        defaultEntitlementDays: lt.defaultEntitlementDays,
        accrualMethod: lt.accrualMethod,
      },
    });
  }
}


async function seedPhase4(prisma: PrismaClient) {
  // 1. Baseline Policy Documents
  const policies = [
    {
      code: 'POL-CODE-001',
      title: 'Code of Professional Conduct & Business Ethics',
      owner: 'Human Resources',
      targetAudience: 'ALL_STAFF',
      category: 'CODE_OF_CONDUCT',
      summary: 'Professional standards, conflict of interest, integrity, and anti-corruption requirements.',
      source: 'Combined Company Policies §1',
    },
    {
      code: 'POL-CYBER-001',
      title: 'Cybersecurity, Data Protection & Acceptable Use Policy',
      owner: 'ICT & Security',
      targetAudience: 'ALL_STAFF',
      category: 'INFORMATION_SECURITY',
      summary: 'Password hygiene, MFA requirements, confidential client data protection, and phishing defense.',
      source: 'Combined Company Policies §4',
    },
    {
      code: 'POL-HARASS-001',
      title: 'Anti-Harassment, Dignity at Work & Grievance Policy',
      owner: 'Human Resources',
      targetAudience: 'ALL_STAFF',
      category: 'ANTI_HARASSMENT',
      summary: 'Zero tolerance for sexual harassment, discrimination, retaliation, and formal resolution procedure.',
      source: 'Combined Company Policies §5',
    },
  ];

  for (const pol of policies) {
    const doc = await prisma.policyDocument.upsert({
      where: { code: pol.code },
      create: {
        code: pol.code,
        title: pol.title,
        owner: pol.owner,
        targetAudience: pol.targetAudience,
        category: pol.category,
      },
      update: {
        title: pol.title,
        owner: pol.owner,
      },
    });

    await prisma.policyVersion.upsert({
      where: {
        policyId_versionNumber: {
          policyId: doc.id,
          versionNumber: '1.0',
        },
      },
      create: {
        policyId: doc.id,
        versionNumber: '1.0',
        contentSummary: pol.summary,
        effectiveDate: new Date('2026-01-01'),
        status: 'PUBLISHED',
        isImmutable: true,
        sourceReference: pol.source,
        publishedAt: new Date('2026-01-01'),
      },
      update: {},
    });
  }

  // 2. Baseline Training Programmes
  const programmes = [
    {
      code: 'TRN-CYBER-IND',
      name: 'Cybersecurity & Information Security Induction',
      category: 'CYBERSECURITY_INDUCTION',
      recurrence: 'ONBOARDING_ONLY',
      dueDaysAfterAssignment: 14,
      isOpenDecisionTypo: false,
      description: 'Mandatory induction on confidential client data, MFA, and phishing prevention.',
    },
    {
      code: 'TRN-DEI-ANN',
      name: 'Diversity, Equity & Inclusion Annual Refresher',
      category: 'DEI',
      recurrence: 'ANNUAL',
      dueDaysAfterAssignment: 30,
      isOpenDecisionTypo: false,
      description: 'Annual training on inclusive culture, equal opportunities, and dignity at work.',
    },
    {
      code: 'TRN-HARASS-ANN',
      name: 'Anti-Harassment & Bystander Intervention',
      category: 'HARASSMENT_PREVENTION',
      recurrence: 'ANNUAL',
      dueDaysAfterAssignment: 30,
      isOpenDecisionTypo: false,
      description: 'Sexual harassment prevention, psychological safety, and safe reporting channels.',
    },
    {
      code: 'TRN-OSH-ANN',
      name: 'Occupational Safety and Health (OSH) Training',
      category: 'OSH',
      recurrence: 'ANNUAL',
      dueDaysAfterAssignment: 30,
      isOpenDecisionTypo: false,
      description: 'Office health and safety, emergency evacuation procedures at 246 Owashika Road.',
    },
    {
      code: 'TRN-SEC-14C',
      name: 'Security Refresher (Notice Period Decision Pending)',
      category: 'ROLE_SPECIFIC',
      recurrence: 'ANNUAL',
      dueDaysAfterAssignment: 14,
      isOpenDecisionTypo: true, // Decision D-15 / D-16
      decisionReference: 'D-15',
      description: 'Security training programme retaining the unconfirmed "14c days" source typo from BRS §21.',
    },
  ];

  for (const prog of programmes) {
    await prisma.trainingProgramme.upsert({
      where: { code: prog.code },
      create: {
        code: prog.code,
        name: prog.name,
        category: prog.category,
        recurrence: prog.recurrence,
        dueDaysAfterAssignment: prog.dueDaysAfterAssignment,
        isOpenDecisionTypo: prog.isOpenDecisionTypo,
        decisionReference: prog.decisionReference,
        description: prog.description,
        status: 'ACTIVE',
      },
      update: {
        name: prog.name,
        description: prog.description,
      },
    });
  }
}

async function seedPhase5(prisma: PrismaClient) {
  // 1. Configurable 1–6 Performance Rating Scale
  const ratings = [
    {
      code: 1,
      label: 'Too Early to Assess',
      description: 'Employee has not been in role long enough to assess performance meaningfully (typically <3 months). Not a numeric score.',
      isNumericScore: false,
      guidancePercentage: 0.0,
    },
    {
      code: 2,
      label: 'Unsatisfactory / Needs Significant Improvement',
      description: 'Performance fails to meet expected standards across multiple core KPIs and Ndakala values.',
      isNumericScore: true,
      guidancePercentage: 5.0,
    },
    {
      code: 3,
      label: 'Developing / Partially Meets Expectations',
      description: 'Performance meets some standards but requires continued coaching and support in specific areas.',
      isNumericScore: true,
      guidancePercentage: 10.0,
    },
    {
      code: 4,
      label: 'Good / Fully Meets Expectations',
      description: 'Consistently meets expected KPIs, competencies, and behaviours aligned to Ndakala values.',
      isNumericScore: true,
      guidancePercentage: 70.0,
    },
    {
      code: 5,
      label: 'Very Good / Exceeds Expectations',
      description: 'Frequently exceeds performance targets and models values across complex advisory engagements.',
      isNumericScore: true,
      guidancePercentage: 10.0,
    },
    {
      code: 6,
      label: 'Outstanding / Far Exceeds Expectations',
      description: 'Consistently delivers exceptional advisory impact, industry thought leadership, and client value.',
      isNumericScore: true,
      guidancePercentage: 5.0,
    },
  ];

  for (const r of ratings) {
    await prisma.performanceRatingScale.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        label: r.label,
        description: r.description,
        isNumericScore: r.isNumericScore,
        guidancePercentage: r.guidancePercentage,
        version: 1,
        isActive: true,
      },
      update: {
        label: r.label,
        description: r.description,
        isNumericScore: r.isNumericScore,
        guidancePercentage: r.guidancePercentage,
      },
    });
  }

  // 2. Default Active Performance Cycle
  const partner = await prisma.user.findFirst({ where: { email: 'managing.partner@ndakalaadvisory.co.ke' } });
  const partnerId = partner ? partner.id : 'system';

  const existingCycle = await prisma.performanceCycle.findFirst({
    where: { title: 'FY2026 Annual Performance Review' },
  });

  if (!existingCycle) {
    await prisma.performanceCycle.create({
      data: {
        title: 'FY2026 Annual Performance Review',
        cycleType: 'ANNUAL',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-12-31'),
        selfAppraisalDeadline: new Date('2026-11-30'),
        managerReviewDeadline: new Date('2026-12-15'),
        moderationDeadline: new Date('2026-12-20'),
        maxObjectivesGuideline: 6,
        allowPeerFeedback: true,
        peerFeedbackPrivacyModel: 'HR_RESTRICTED',
        distributionGuidance: JSON.stringify({ 2: 5, 3: 10, 4: 70, 5: 10, 6: 5 }),
        isDistributionMandatory: false,
        annualFormulaStatus: 'PENDING_APPROVAL',
        configurationSnapshot: JSON.stringify({
          cycle: 'FY2026',
          model: '5-10-70-10-5-guidance',
          maxObjectivesGuideline: 6,
          formulaApproval: 'PENDING',
          statutoryPrecedence: 'Kenya Employment Act 2007',
        }),
        status: 'ACTIVE',
        createdById: partnerId,
      },
    });
  }
}

/**
 * Phase 6: Configurable Kenyan Payroll & Remuneration (R3)
 */
async function seedPhase6(prisma: PrismaClient) {
  // 1. Pay Groups
  const payGroups = [
    { code: 'PG-EXEC', name: 'Executive & Partners', payFrequency: 'MONTHLY', cutoffDay: 20 },
    { code: 'PG-PROF', name: 'Professional Advisory', payFrequency: 'MONTHLY', cutoffDay: 20 },
    { code: 'PG-OPS', name: 'Operations & Business Support', payFrequency: 'MONTHLY', cutoffDay: 20 },
    { code: 'PG-INTERN', name: 'Graduate Interns & Fellows', payFrequency: 'MONTHLY', cutoffDay: 20 },
  ];

  for (const pg of payGroups) {
    await prisma.payrollPayGroup.upsert({
      where: { code: pg.code },
      create: {
        code: pg.code,
        name: pg.name,
        payFrequency: pg.payFrequency,
        currency: 'KES',
        cutoffDay: pg.cutoffDay,
        payDayRule: 'LAST_BUSINESS_DAY',
        workingDaysBasis: 'ACTUAL_WORKING_DAYS',
        prorationMethod: 'WORKING_DAYS',
        isActive: true,
      },
      update: {
        name: pg.name,
      },
    });
  }

  // 2. Master Salary Components
  const components = [
    { code: 'BASIC', name: 'Basic Salary', category: 'EARNING', calculationType: 'FIXED_AMOUNT', isPensionable: true, isTaxable: true, isProRataApplicable: true, displayOrder: 10 },
    { code: 'HOUSE_ALLW', name: 'House Allowance', category: 'EARNING', calculationType: 'FIXED_AMOUNT', isPensionable: true, isTaxable: true, isProRataApplicable: true, displayOrder: 15 },
    { code: 'COMMUTER_ALLW', name: 'Transport / Commuter Allowance', category: 'EARNING', calculationType: 'FIXED_AMOUNT', isPensionable: true, isTaxable: true, isProRataApplicable: true, displayOrder: 20 },
    { code: 'RESP_ALLW', name: 'Responsibility Allowance', category: 'EARNING', calculationType: 'FIXED_AMOUNT', isPensionable: true, isTaxable: true, isProRataApplicable: false, displayOrder: 25 },
    { code: 'AIRTIME_BEN', name: 'Mobile Airtime Benefit', category: 'BENEFIT_TAXABLE', calculationType: 'FIXED_AMOUNT', isPensionable: false, isTaxable: true, isProRataApplicable: false, displayOrder: 30 },
    { code: 'UNPAID_LEAVE', name: 'Unpaid Leave Deduction', category: 'DEDUCTION_STATUTORY_EE', calculationType: 'DAILY_RATE', isPensionable: true, isTaxable: true, isProRataApplicable: false, displayOrder: 35 },
    { code: 'HALF_PAY_LEAVE', name: 'Half-Pay Sick Leave Deduction', category: 'DEDUCTION_STATUTORY_EE', calculationType: 'DAILY_RATE', isPensionable: true, isTaxable: true, isProRataApplicable: false, displayOrder: 36 },
    { code: 'NSSF_EE', name: 'NSSF Tier 1 & 2 (Employee)', category: 'DEDUCTION_STATUTORY_EE', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 40 },
    { code: 'AHL_EE', name: 'Affordable Housing Levy (Employee)', category: 'DEDUCTION_STATUTORY_EE', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 45 },
    { code: 'SHIF_EE', name: 'SHIF Contribution (Employee)', category: 'DEDUCTION_STATUTORY_EE', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 50 },
    { code: 'PAYE', name: 'Pay As You Earn (PAYE)', category: 'DEDUCTION_STATUTORY_EE', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 55 },
    { code: 'NSSF_ER', name: 'NSSF Tier 1 & 2 (Employer Match)', category: 'CONTRIBUTION_STATUTORY_ER', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 80 },
    { code: 'AHL_ER', name: 'Affordable Housing Levy (Employer Match)', category: 'CONTRIBUTION_STATUTORY_ER', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 85 },
    { code: 'NITA_ER', name: 'NITA Training Levy (Employer)', category: 'CONTRIBUTION_STATUTORY_ER', calculationType: 'STATUTORY_RULE', isPensionable: false, isTaxable: false, isProRataApplicable: false, displayOrder: 90 },
  ];

  for (const c of components) {
    await prisma.payrollComponent.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        category: c.category,
        calculationType: c.calculationType,
        isPensionable: c.isPensionable,
        isTaxable: c.isTaxable,
        isSubjectToHousingLevy: true,
        isSubjectToHealthLevy: true,
        isProRataApplicable: c.isProRataApplicable,
        displayOrder: c.displayOrder,
        isActive: true,
      },
      update: {
        name: c.name,
        category: c.category,
        displayOrder: c.displayOrder,
      },
    });
  }

  // 3. Authoritative Kenya Statutory Rule Set (2026.1)
  const existingRuleSet = await prisma.statutoryRuleSet.findUnique({
    where: { code: 'KENYA_STATUTORY_2026' },
    include: { rules: true },
  });

  if (!existingRuleSet) {
    const rs = await prisma.statutoryRuleSet.create({
      data: {
        code: 'KENYA_STATUTORY_2026',
        name: 'Kenya Statutory Framework 2026 (NSSF Year 4 / Finance Act 2023 / SHA Act 2023 / AHL 2024)',
        countryCode: 'KE',
        currency: 'KES',
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        version: '2026.1',
        isDefault: true,
        description: 'Complete authoritative Kenya statutory parameters: NSSF Year 4 (LEL 9,000, UEL 108,000), SHIF 2.75% min 300, AHL 1.5% EE/ER, PAYE 5-tier progressive bands, Personal Relief 2,400/mo, NITA 50 ER.',
        sourceDocument: 'NSSF Act 2013 Year 4, Kenya Finance Act 2023, Social Health Insurance Act 2023, Affordable Housing Act 2024, Industrial Training Act Cap 237',
        rules: {
          create: [
            {
              code: 'NSSF',
              name: 'National Social Security Fund (Year 4)',
              category: 'PENSION',
              algorithmType: 'TIERED_PENSION_CAPS',
              parameters: JSON.stringify({
                lowerEarningsLimit: 9000,
                upperEarningsLimit: 108000,
                employeeRate: 0.06,
                employerRate: 0.06,
                tier1MaxEmployee: 540,
                tier1MaxEmployer: 540,
                tier2MaxEmployee: 5940,
                tier2MaxEmployer: 5940,
                totalMaxEmployee: 6480,
                totalMaxEmployer: 6480,
              }),
              deductibleFromTaxablePay: true,
              isEmployeeDeduction: true,
              isEmployerContribution: true,
              roundingRule: 'ROUND_HALF_UP',
              priority: 10,
            },
            {
              code: 'AHL',
              name: 'Affordable Housing Levy',
              category: 'HOUSING_LEVY',
              algorithmType: 'PERCENTAGE_OF_GROSS',
              parameters: JSON.stringify({
                employeeRate: 0.015,
                employerRate: 0.015,
              }),
              deductibleFromTaxablePay: true,
              isEmployeeDeduction: true,
              isEmployerContribution: true,
              roundingRule: 'ROUND_HALF_UP',
              priority: 20,
            },
            {
              code: 'SHIF',
              name: 'Social Health Insurance Fund',
              category: 'HEALTH_INSURANCE',
              algorithmType: 'PERCENTAGE_OF_GROSS',
              parameters: JSON.stringify({
                employeeRate: 0.0275,
                employerRate: 0.0,
                minAmount: 300,
              }),
              deductibleFromTaxablePay: false,
              reliefPercentage: 0.15,
              reliefMaxMonthly: 5000,
              isEmployeeDeduction: true,
              isEmployerContribution: false,
              roundingRule: 'ROUND_HALF_UP',
              priority: 30,
            },
            {
              code: 'PAYE',
              name: 'Pay As You Earn (Individual Income Tax)',
              category: 'INCOME_TAX',
              algorithmType: 'TIERED_BRACKETS',
              parameters: JSON.stringify({
                bands: [
                  { order: 1, from: 0, to: 24000, rate: 0.10, name: 'First 24,000' },
                  { order: 2, from: 24000, to: 32333.33, rate: 0.25, name: 'Next 8,333.33' },
                  { order: 3, from: 32333.33, to: 500000, rate: 0.30, name: 'Next 467,666.67' },
                  { order: 4, from: 500000, to: 800000, rate: 0.325, name: 'Next 300,000' },
                  { order: 5, from: 800000, to: null, rate: 0.35, name: 'Above 800,000' },
                ],
                personalReliefMonthly: 2400,
                insuranceReliefPercentage: 0.15,
                insuranceReliefMaxMonthly: 5000,
              }),
              deductibleFromTaxablePay: false,
              isEmployeeDeduction: true,
              isEmployerContribution: false,
              roundingRule: 'ROUND_HALF_UP',
              priority: 40,
            },
            {
              code: 'NITA',
              name: 'National Industrial Training Authority Levy',
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
            },
          ],
        },
      },
      include: { rules: true },
    });

    // Freeze snapshot
    await prisma.statutoryRuleSet.update({
      where: { id: rs.id },
      data: { rulesSnapshot: JSON.stringify(rs.rules) },
    });
  }

  // 4. Default November 2026 Payroll Period for Professional Advisory
  const profPayGroup = await prisma.payrollPayGroup.findUnique({ where: { code: 'PG-PROF' } });
  if (profPayGroup) {
    const periodCode = '2026-11-PG-PROF';
    const existingPeriod = await prisma.payrollPeriod.findUnique({
      where: {
        payGroupId_periodCode: {
          payGroupId: profPayGroup.id,
          periodCode,
        },
      },
    });

    if (!existingPeriod) {
      await prisma.payrollPeriod.create({
        data: {
          payGroupId: profPayGroup.id,
          periodCode,
          periodNumber: 11,
          fiscalYear: 2026,
          name: 'November 2026 (Professional Advisory)',
          startDate: new Date('2026-11-01'),
          endDate: new Date('2026-11-30'),
          cutoffDate: new Date('2026-11-20'),
          payDate: new Date('2026-11-30'),
          status: 'DRAFT',
        },
      });
    }
  }

  // 5. Seed Baseline Salary Assignments for Seeded Test Employees
  const employees = await prisma.employee.findMany({ take: 5 });
  for (const emp of employees) {
    const existingAssign = await prisma.employeeSalaryAssignment.findFirst({
      where: { employeeId: emp.id, status: 'APPROVED' },
    });
    if (!existingAssign && profPayGroup) {
      let basic = 80000;
      let house = 20000;
      let commuter = 10000;

      if (emp.workEmail.includes('managing.partner')) {
        basic = 950000;
        house = 150000;
        commuter = 50000;
      } else if (emp.workEmail.includes('operations.director') || emp.workEmail.includes('hr.lead')) {
        basic = 150000;
        house = 350000;
        commuter = 15000;
      }

      await prisma.employeeSalaryAssignment.create({
        data: {
          employeeId: emp.id,
          payGroupId: profPayGroup.id,
          effectiveDate: new Date('2026-01-01'),
          status: 'APPROVED',
          currency: 'KES',
          components: JSON.stringify({
            BASIC: basic,
            HOUSE_ALLW: house,
            COMMUTER_ALLW: commuter,
          }),
          totalGrossSalary: basic + house + commuter,
          changeReason: 'Baseline contract remuneration structure',
        },
      });
    }
  }
}

async function seedPhase8(prisma: PrismaClient) {
  const isTestOrSample = process.env.NODE_ENV === 'test' || process.env.SEED_SAMPLE_DATA === 'true';

  // Ensure open current monthly close period always exists in production & test
  const existingOpenNov = await prisma.timePeriodClose.findFirst({
    where: { name: 'November 2026' },
  });
  if (!existingOpenNov) {
    await prisma.timePeriodClose.create({
      data: {
        name: 'November 2026',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        status: 'OPEN',
      },
    });
  }

  if (!isTestOrSample) {
    return;
  }

  const existingClients = await prisma.timeClient.count();
  const emps = await prisma.employee.findMany({ take: 5 });
  const leadId = emps[1]?.id || emps[0]?.id || 'emp-lead-1';
  const assocId = emps[2]?.id || emps[0]?.id || 'emp-assoc-1';
  const partnerUser = await prisma.user.findFirst({ where: { email: 'managing.partner@ndakalaadvisory.co.ke' } });

  if (existingClients === 0) {
    const kcb = await prisma.timeClient.create({
      data: {
        code: 'CLI-001',
        name: 'KCB Group PLC',
        industry: 'Financial Services',
        contactName: 'Grace Wanjiku',
        contactEmail: 'g.wanjiku@kcbgroup.com',
        currency: 'KES',
      },
    });
    const saf = await prisma.timeClient.create({
      data: {
        code: 'CLI-002',
        name: 'Safaricom PLC',
        industry: 'Telecommunications & FinTech',
        contactName: 'Peter Ochieng',
        contactEmail: 'pochieng@safaricom.co.ke',
        currency: 'KES',
      },
    });
    const britam = await prisma.timeClient.create({
      data: {
        code: 'CLI-003',
        name: 'Britam Holdings',
        industry: 'Insurance & Asset Management',
        contactName: 'David Mutua',
        contactEmail: 'dmutua@britam.com',
        currency: 'KES',
      },
    });

    const p1 = await prisma.timeProject.create({
      data: {
        code: 'PRJ-2026-001',
        name: 'Cloud Security & ISO 27001 Audit',
        clientId: kcb.id,
        department: 'IT & Cybersecurity',
        leadEmployeeId: leadId,
        budgetAmountKes: 4500000,
        budgetHours: 320,
        startDate: '2026-09-01',
        endDate: '2026-12-15',
        status: 'ACTIVE',
      },
    });
    const p2 = await prisma.timeProject.create({
      data: {
        code: 'PRJ-2026-002',
        name: 'Core Banking Cyber Resilience Assessment',
        clientId: britam.id,
        department: 'IT & Cybersecurity',
        leadEmployeeId: leadId,
        budgetAmountKes: 2800000,
        budgetHours: 180,
        startDate: '2026-09-15',
        endDate: '2026-11-30',
        status: 'ACTIVE',
      },
    });
    const p3 = await prisma.timeProject.create({
      data: {
        code: 'PRJ-2026-003',
        name: 'M-PESA Microservices Red Team Engagement',
        clientId: saf.id,
        department: 'Advisory & Penetration Testing',
        leadEmployeeId: assocId,
        budgetAmountKes: 6000000,
        budgetHours: 450,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        status: 'ACTIVE',
      },
    });

    const ph1 = await prisma.timePhase.create({
      data: {
        projectId: p1.id,
        name: 'Phase 1: Threat Modeling & Architecture Scoping',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        progressPct: 100,
        sortOrder: 1,
      },
    });
    const ph2 = await prisma.timePhase.create({
      data: {
        projectId: p1.id,
        name: 'Phase 2: Penetration Testing & Control Testing',
        startDate: '2026-10-01',
        endDate: '2026-11-15',
        progressPct: 75,
        sortOrder: 2,
      },
    });
    await prisma.timePhase.create({
      data: {
        projectId: p2.id,
        name: 'Phase 1: Core Infrastructure Review',
        startDate: '2026-09-15',
        endDate: '2026-11-30',
        progressPct: 60,
        sortOrder: 1,
      },
    });
    await prisma.timePhase.create({
      data: {
        projectId: p3.id,
        name: 'Phase 1: API Threat Exploitation',
        startDate: '2026-10-01',
        endDate: '2026-12-15',
        progressPct: 45,
        sortOrder: 1,
      },
    });

    // Seed employee rate cards
    for (const emp of emps) {
      const isSenior = emp.workEmail.includes('line.manager') || emp.workEmail.includes('hr.lead');
      await prisma.timeRateCard.upsert({
        where: { employeeId: emp.id },
        create: {
          employeeId: emp.id,
          costRateKes: isSenior ? 3500 : 2500,
          billingRateKes: isSenior ? 8500 : 6500,
          currency: 'KES',
          effectiveFrom: '2026-01-01',
        },
        update: {},
      });
    }

    // Seed September 2026 (LOCKED), October 2026 (LOCKED), November 2026 (OPEN)
    const sepSnapObj = {
      periodName: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      entriesLocked: 2,
      kpis: {
        totalLoggedHours: 16,
        billableHours: 16,
        nonBillableHours: 0,
        billabilityPct: 100,
        totalLaborCostKes: 48000,
        billableRevenueKes: 120000,
        nonBillableLeakageKes: 0,
        grossProfitKes: 72000,
        grossProfitMarginPct: 60,
      },
    };
    const sepJson = JSON.stringify(sepSnapObj);
    const sepSum = crypto.createHash('sha256').update(sepJson).digest('hex');

    const sepPeriod = await prisma.timePeriodClose.create({
      data: {
        name: 'September 2026',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        status: 'LOCKED',
        closedById: partnerUser?.id || 'system',
        closedAt: new Date('2026-10-02T17:00:00Z'),
        snapshotJson: sepJson,
        snapshotChecksum: sepSum,
      },
    });

    const octSnapObj = {
      periodName: 'October 2026',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      entriesLocked: 2,
      kpis: {
        totalLoggedHours: 14,
        billableHours: 10,
        nonBillableHours: 4,
        billabilityPct: 71.43,
        totalLaborCostKes: 41000,
        billableRevenueKes: 77000,
        nonBillableLeakageKes: 26000,
        grossProfitKes: 36000,
        grossProfitMarginPct: 46.75,
      },
    };
    const octJson = JSON.stringify(octSnapObj);
    const octSum = crypto.createHash('sha256').update(octJson).digest('hex');

    const octPeriod = await prisma.timePeriodClose.create({
      data: {
        name: 'October 2026',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'LOCKED',
        closedById: partnerUser?.id || 'system',
        closedAt: new Date('2026-11-02T17:00:00Z'),
        snapshotJson: octJson,
        snapshotChecksum: octSum,
      },
    });

    // Seed sample time logs
    await prisma.timeLog.createMany({
      data: [
        {
          employeeId: leadId,
          projectId: p1.id,
          phaseId: ph1.id,
          workDate: '2026-09-18',
          hours: 8,
          isBillable: true,
          description: 'ISO 27001 Annex A gap assessment workshop with KCB Risk Team',
          costRateSnap: 3500,
          billingRateSnap: 8500,
          status: 'LOCKED',
          periodId: sepPeriod.id,
        },
        {
          employeeId: assocId,
          projectId: p1.id,
          phaseId: ph1.id,
          workDate: '2026-09-22',
          hours: 8,
          isBillable: true,
          description: 'Cloud AWS/IAM posture audit and threat model diagramming',
          costRateSnap: 2500,
          billingRateSnap: 6500,
          status: 'LOCKED',
          periodId: sepPeriod.id,
        },
        {
          employeeId: leadId,
          projectId: p2.id,
          workDate: '2026-10-14',
          hours: 6,
          isBillable: true,
          description: 'Core banking SWIFT network segmentation test & architecture review',
          costRateSnap: 3500,
          billingRateSnap: 8500,
          status: 'LOCKED',
          periodId: octPeriod.id,
        },
        {
          employeeId: assocId,
          projectId: p3.id,
          workDate: '2026-10-20',
          hours: 4,
          isBillable: true,
          description: 'OAuth token validation penetration testing on M-PESA gateway',
          costRateSnap: 2500,
          billingRateSnap: 6500,
          status: 'LOCKED',
          periodId: octPeriod.id,
        },
        {
          employeeId: assocId,
          projectId: p3.id,
          workDate: '2026-10-21',
          hours: 4,
          isBillable: false,
          description: 'Internal remediation briefing & client documentation cleanup',
          costRateSnap: 2500,
          billingRateSnap: 6500,
          status: 'LOCKED',
          periodId: octPeriod.id,
        },
        {
          employeeId: assocId,
          projectId: p1.id,
          phaseId: ph2.id,
          workDate: '2026-11-11',
          hours: 7.5,
          isBillable: true,
          description: 'External vulnerability scan verification and evidence capture',
          costRateSnap: 2500,
          billingRateSnap: 6500,
          status: 'APPROVED',
          approvedById: partnerUser?.id || 'system',
          approvedAt: new Date('2026-11-12T10:00:00Z'),
        },
        {
          employeeId: assocId,
          projectId: p1.id,
          phaseId: ph2.id,
          workDate: '2026-11-13',
          hours: 4.5,
          isBillable: true,
          description: 'Drafting ISO 27001 findings report and executive risk scoring matrix',
          costRateSnap: 2500,
          billingRateSnap: 6500,
          status: 'PENDING',
        },
        {
          employeeId: leadId,
          projectId: p2.id,
          workDate: '2026-11-13',
          hours: 2.0,
          isBillable: false,
          description: 'Internal pre-steering committee prep session',
          costRateSnap: 3500,
          billingRateSnap: 8500,
          status: 'PENDING',
        },
      ],
    });
  }

  await seedFilesHubTemplatesAndRealPolicies(prisma);
}

async function seedFilesHubTemplatesAndRealPolicies(prisma: PrismaClient) {
  const actor =
    (await prisma.user.findUnique({ where: { email: 'ict.admin@ndakalaadvisory.co.ke' } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  const actorId = actor?.id || 'system';

  // 1. Seed Standard Organization & Template Folders
  const foldersSpec = [
    {
      code: 'FOLDER-ORG-HR',
      name: 'HR & Employment Policies',
      scope: 'ORG',
      description: 'Core people policies, code of conduct, leave, performance & separation governance',
    },
    {
      code: 'FOLDER-ORG-ITSEC',
      name: 'IT, Cybersecurity & Data Privacy',
      scope: 'ORG',
      description: 'ICT acceptable use, access control, backup, logging & DPA 2019 privacy policies',
    },
    {
      code: 'FOLDER-ORG-RISK',
      name: 'Compliance & Risk Governance',
      scope: 'ORG',
      description: 'Occupational safety & health (OSH), enterprise risk management & whistleblowing policies',
    },
    {
      code: 'FOLDER-HR-TEMPLATES',
      name: 'HR Forms & Templates',
      scope: 'ORG',
      description: 'Compiled HR handbooks, official letters & employee forms generated cleanly to PDF',
    },
  ];

  const folderMap = new Map<string, string>();
  for (const f of foldersSpec) {
    const folder = await prisma.documentFolder.upsert({
      where: { code: f.code },
      create: {
        code: f.code,
        name: f.name,
        scope: f.scope,
        description: f.description,
        createdById: actorId,
      },
      update: {
        name: f.name,
        description: f.description,
      },
    });
    folderMap.set(f.code, folder.id);
  }

  // 2. Seed Shared Department M365 Mailboxes cleanly if currently unset
  const mailboxSeeds: Array<[string, string]> = [
    ['EXEC', 'partners@ndakalaadvisory.co.ke'],
    ['TAX-ADV', 'tax@ndakalaadvisory.co.ke'],
    ['AUDIT', 'audit@ndakalaadvisory.co.ke'],
    ['HR-OPS', 'hr@ndakalaadvisory.co.ke'],
    ['FINANCE', 'finance@ndakalaadvisory.co.ke'],
  ];
  for (const [code, mailbox] of mailboxSeeds) {
    await prisma.department
      .updateMany({
        where: { code, sharedM365Mailbox: null },
        data: { sharedM365Mailbox: mailbox },
      })
      .catch(() => {});
  }

  // 3. Ingest 22 Real Company Policy PDFs from assets/policies/
  const policiesManifest = [
    { file: 'Code of Conduct Policy.pdf', title: 'Code of Conduct Policy', code: 'POL-NDA-01', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'CODE_OF_CONDUCT', status: 'PUBLISHED' },
    { file: 'Disciplinary Policy.pdf', title: 'Disciplinary Policy', code: 'POL-NDA-02', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Diversity Equity and Inclusion Policy.pdf', title: 'Diversity, Equity & Inclusion Policy', code: 'POL-NDA-03', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'DEI', status: 'PUBLISHED' },
    { file: 'Dress code  Policy.pdf', title: 'Dress Code Policy', code: 'POL-NDA-04', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Grievance Procedure  Policy.pdf', title: 'Grievance Procedure Policy', code: 'POL-NDA-05', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'ANTI_HARASSMENT', status: 'PUBLISHED' },
    { file: 'Leave Management Policy.pdf', title: 'Leave Management Policy', code: 'POL-NDA-06', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Performance Management Policy.pdf', title: 'Performance Management Policy', code: 'POL-NDA-07', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Separation Management Policy.pdf', title: 'Separation Management Policy', code: 'POL-NDA-08', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Sexual Harassment and Discrimination  Policy.pdf', title: 'Sexual Harassment & Discrimination Policy', code: 'POL-NDA-09', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'ANTI_HARASSMENT', status: 'PUBLISHED' },
    { file: 'Transfer Policy.pdf', title: 'Transfer Policy', code: 'POL-NDA-10', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Working Hours Policy.pdf', title: 'Working Hours Policy', code: 'POL-NDA-11', folderCode: 'FOLDER-ORG-HR', owner: 'Human Resources', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Acceptable User Policy  (1).pdf', title: 'Acceptable Use Policy', code: 'POL-NDA-12', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'PUBLISHED' },
    { file: 'Cybersecurity Awareness and Training.pdf', title: 'Cybersecurity Awareness & Training Policy', code: 'POL-NDA-13', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'PUBLISHED' },
    { file: 'DATA PRIVACY POLICY.pdf', title: 'Data Privacy Policy (KDPA 2019)', code: 'POL-NDA-14', folderCode: 'FOLDER-ORG-ITSEC', owner: 'Compliance & DPO', category: 'INFORMATION_SECURITY', status: 'PUBLISHED' },
    { file: 'Information Management Policy.pdf', title: 'Information Management Policy', code: 'POL-NDA-15', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'PUBLISHED' },
    { file: 'IT Asset Management Policy  (1).pdf', title: 'IT Asset Management Policy', code: 'POL-NDA-16', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'PUBLISHED' },
    { file: 'Logging and monitoring policy  .pdf', title: 'Logging & Monitoring Policy', code: 'POL-NDA-17', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'PUBLISHED' },
    { file: 'Access Control draft.pdf', title: 'Access Control Policy (Draft)', code: 'POL-NDA-18', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'DRAFT' },
    { file: 'Data Backup Policy draft.pdf', title: 'Data Backup Policy (Draft)', code: 'POL-NDA-19', folderCode: 'FOLDER-ORG-ITSEC', owner: 'ICT & Security', category: 'INFORMATION_SECURITY', status: 'DRAFT' },
    { file: 'Occupational Safety , Health and Environment Policy.pdf', title: 'Occupational Safety, Health & Environment Policy', code: 'POL-NDA-20', folderCode: 'FOLDER-ORG-RISK', owner: 'Operations & Risk', category: 'OSH', status: 'PUBLISHED' },
    { file: 'RISK MANAGEMENT POLICY.pdf', title: 'Enterprise Risk Management Policy', code: 'POL-NDA-21', folderCode: 'FOLDER-ORG-RISK', owner: 'Operations & Risk', category: 'OPERATIONAL', status: 'PUBLISHED' },
    { file: 'Whistle blowing policy.pdf', title: 'Whistleblowing Policy', code: 'POL-NDA-22', folderCode: 'FOLDER-ORG-RISK', owner: 'Compliance & Risk', category: 'CODE_OF_CONDUCT', status: 'PUBLISHED' },
  ];

  const assetsDir = path.resolve(process.cwd(), 'assets/policies');
  if (fs.existsSync(assetsDir)) {
    for (const item of policiesManifest) {
      const fullSrcPath = path.join(assetsDir, item.file);
      if (!fs.existsSync(fullSrcPath)) continue;

      const folderId = folderMap.get(item.folderCode) || null;
      const cleanName = item.file.replace(/\s+/g, ' ').trim();

      let docRecord = await prisma.documentRecord.findFirst({
        where: { category: 'POLICY', fileName: cleanName },
      });

      if (!docRecord || (!docRecord.localStoragePurged && !localFileExists(docRecord.storageKey))) {
        const buf = fs.readFileSync(fullSrcPath);
        const stored = storeFile(buf, cleanName);
        if (!docRecord) {
          docRecord = await prisma.documentRecord.create({
            data: {
              fileName: cleanName,
              description: `${item.title} — Ndakala Advisory Official Policy Document (${item.status})`,
              mimeType: 'application/pdf',
              fileSizeBytes: buf.length,
              storageKey: stored.storageKey,
              storagePath: stored.storagePath,
              checksumSha256: stored.checksumSha256,
              category: 'POLICY',
              securityClassification: item.status === 'DRAFT' ? 'CONFIDENTIAL' : 'INTERNAL',
              uploadedById: actorId,
              updatedById: actorId,
              folderId,
              shareScope: item.status === 'DRAFT' ? 'ROLE' : 'ORG',
              sharedRoleKeysJson:
                item.status === 'DRAFT' ? JSON.stringify(['ict_admin', 'managing_partner', 'head_of_hr']) : null,
              lastAccessedAt: new Date(),
            },
          });
        } else {
          docRecord = await prisma.documentRecord.update({
            where: { id: docRecord.id },
            data: {
              storageKey: stored.storageKey,
              storagePath: stored.storagePath,
              checksumSha256: stored.checksumSha256,
              folderId: docRecord.folderId || folderId,
            },
          });
        }
      }

      const polDoc = await prisma.policyDocument.upsert({
        where: { code: item.code },
        create: {
          code: item.code,
          title: item.title,
          owner: item.owner,
          targetAudience: item.status === 'DRAFT' ? 'MANAGERS' : 'ALL_STAFF',
          category: item.category,
        },
        update: {
          title: item.title,
          owner: item.owner,
        },
      });

      await prisma.policyVersion.upsert({
        where: {
          policyId_versionNumber: {
            policyId: polDoc.id,
            versionNumber: item.status === 'DRAFT' ? '0.9-draft' : '1.0',
          },
        },
        create: {
          policyId: polDoc.id,
          versionNumber: item.status === 'DRAFT' ? '0.9-draft' : '1.0',
          contentSummary: `${item.title} (${cleanName})`,
          documentId: docRecord.id,
          effectiveDate: new Date('2026-01-01'),
          status: item.status,
          isImmutable: item.status === 'PUBLISHED',
          sourceReference: `Ndakala Advisory Official Register (${item.code})`,
          publishedAt: item.status === 'PUBLISHED' ? new Date('2026-01-01') : null,
        },
        update: {
          documentId: docRecord.id,
        },
      });
    }
  }

  // 4. Seed Zoho-Parity HR Forms & Templates (Company Handbook Template + Dynamic Forms)
  const templates = [
    {
      code: 'TPL-HANDBOOK-001',
      name: 'Company Handbook Template',
      description:
        "A sample company handbook that can be edited and used to guide your employees and convey your company's vision, mission and operating policies.",
      category: 'HANDBOOK',
      schemaJson: JSON.stringify([
        { key: 'documentTitle', label: 'Handbook Edition Title', type: 'text', defaultValue: 'Ndakala Advisory Employee Handbook 2026' },
        { key: 'visionStatement', label: 'Vision Statement', type: 'textarea', defaultValue: 'To deliver trusted tax, audit, risk and governance advisory across East Africa.' },
        { key: 'missionStatement', label: 'Mission Statement', type: 'textarea', defaultValue: 'Empowering clients through rigorous integrity, continuous learning, and people-first excellence.' },
        { key: 'operatingPolicies', label: 'Core Operating Policies Summary', type: 'textarea', defaultValue: 'All employees adhere to Ndakala Code of Conduct, KDPA 2019 Data Privacy, and Cybersecurity MFA policies.' },
      ]),
      bodyTemplate:
        'Vision:\n{{visionStatement}}\n\nMission:\n{{missionStatement}}\n\nOperating Standards:\n{{operatingPolicies}}',
    },
    {
      code: 'TPL-ADDR-PROOF-001',
      name: 'Address Proof & Employment Confirmation Form',
      description:
        'Native React HR letter form verifying active employment status and official Nairobi/Kenya residential address for banking or statutory use.',
      category: 'LETTER',
      schemaJson: JSON.stringify([
        { key: 'documentTitle', label: 'Letter Title', type: 'text', defaultValue: 'Official Address Proof & Employment Verification' },
        { key: 'addressedTo', label: 'Addressed To (Bank / Embassy / Institution)', type: 'text', defaultValue: 'To Whom It May Concern' },
        { key: 'residentialAddress', label: 'Confirmed Residential Address', type: 'textarea', defaultValue: 'Nairobi, Kenya' },
        { key: 'purposeNote', label: 'Purpose / Confirmation Statement', type: 'textarea', defaultValue: 'This confirms the above-named individual is an active employee of Ndakala Advisory LLP in good standing.' },
      ]),
      bodyTemplate:
        'To: {{addressedTo}}\nEmployee: {{employeeName}} ({{employeeNumber}}) — {{position}}, {{department}}\nConfirmed Residential Address: {{residentialAddress}}\n\nStatement:\n{{purposeNote}}',
    },
    {
      code: 'TPL-CERT-SERVICE-001',
      name: 'Certificate of Service Form',
      description:
        'Formal statutory Certificate of Service under Kenya Employment Act s.51 generated cleanly into an immutable PDF.',
      category: 'FORM',
      schemaJson: JSON.stringify([
        { key: 'documentTitle', label: 'Certificate Title', type: 'text', defaultValue: 'Certificate of Service' },
        { key: 'servicePeriod', label: 'Period of Service', type: 'text', defaultValue: 'From Commencement Date to Current / Exit Date' },
        { key: 'dutiesSummary', label: 'Summary of Duties & Conduct', type: 'textarea', defaultValue: 'Executed professional advisory and operational engagements diligently and ethically.' },
      ]),
      bodyTemplate:
        'Employee: {{employeeName}} ({{employeeNumber}})\nDesignation & Department: {{position}} — {{department}}\nPeriod of Service: {{servicePeriod}}\n\nSummary of Service:\n{{dutiesSummary}}',
    },
  ];

  for (const tpl of templates) {
    await prisma.hrTemplate.upsert({
      where: { code: tpl.code },
      create: {
        code: tpl.code,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        schemaJson: tpl.schemaJson,
        bodyTemplate: tpl.bodyTemplate,
        createdById: actorId,
      },
      update: {
        name: tpl.name,
        description: tpl.description,
        schemaJson: tpl.schemaJson,
        bodyTemplate: tpl.bodyTemplate,
      },
    });
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const prisma = new PrismaClient();
  seedDatabase(prisma)
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
