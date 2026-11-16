import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { conflict, notFound, validation, forbidden } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import { auditCtx, parseJson } from './util.js';

const OWNER_TYPES = ['HR', 'MANAGER', 'EMPLOYEE', 'ICT'] as const;

/**
 * Employee categories (D-25), onboarding checklist templates and probation form templates.
 * Drafting requires `employees.categories.manage`; activation requires `config.approve`
 * held by a DIFFERENT user than the author (maker-checker).
 */
export function createEmployeeSetupRouter(deps: AppDeps): Router {
  const router = Router();

  // ---------------- Employee categories ----------------
  registerRoute(router, deps, {
    method: 'get',
    path: '/employee-categories',
    auth: { permission: ['employees.view', 'employees.create', 'employees.categories.manage', 'config.approve'], any: true },
    handler: async ({ deps }) => deps.prisma.employmentCategory.findMany({ orderBy: { code: 'asc' } }),
  });

  const categoryParams = z.object({
    name: z.string().min(2).max(80),
    description: z.string().max(500).optional(),
    probationApplies: z.boolean().nullable().optional(),
    defaultProbationMonths: z.number().int().min(1).max(24).nullable().optional(),
    maxProbationExtensionMonths: z.number().int().min(1).max(24).nullable().optional(),
    defaultNoticePeriodDays: z.number().int().min(1).max(365).nullable().optional(),
    probationReminderLeadDays: z.number().int().min(1).max(120).nullable().optional(),
    sourceReference: z.string().min(3).max(300),
    decisionReference: z.string().max(100).optional(),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/employee-categories',
    auth: { permission: 'employees.categories.manage' },
    successStatus: 201,
    body: categoryParams.extend({ code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/) }),
    handler: async ({ body, auth, req, deps }) => {
      const existing = await deps.prisma.employmentCategory.findUnique({ where: { code: body.code } });
      if (existing) throw conflict(`Employee category '${body.code}' already exists`);
      const created = await deps.prisma.employmentCategory.create({
        data: { ...body, status: 'DRAFT', createdById: auth.userId },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_DRAFTED', targetType: 'EmploymentCategory', targetId: created.id, outcome: 'SUCCESS', after: created,
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/employee-categories/:id',
    auth: { permission: 'employees.categories.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: categoryParams.partial(),
    handler: async ({ params, body, auth, req, deps }) => {
      const cat = await deps.prisma.employmentCategory.findUnique({ where: { id: params.id } });
      if (!cat) throw notFound('EmploymentCategory', params.id);
      if (cat.status !== 'DRAFT') {
        throw conflict('Only DRAFT categories can be edited. Deactivate and redraft to change an active category.');
      }
      const updated = await deps.prisma.employmentCategory.update({
        where: { id: params.id },
        // Editing resets authorship so the editor cannot also approve
        data: { ...body, createdById: auth.userId },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_UPDATED', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'SUCCESS', before: cat, after: updated,
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/employee-categories/:id/activate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const cat = await deps.prisma.employmentCategory.findUnique({ where: { id: params.id } });
      if (!cat) throw notFound('EmploymentCategory', params.id);
      if (cat.createdById === auth.userId) {
        await writeAudit(deps.prisma, auditCtx(auth, req), {
          action: 'EMPLOYEE_CATEGORY_ACTIVATE', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'BLOCKED', reason: 'Maker-checker violation',
        });
        throw forbidden('Maker-Checker violation: the author of a category cannot activate it');
      }
      if (cat.status !== 'DRAFT') throw conflict(`Category is ${cat.status}; only DRAFT categories can be activated`);
      if (cat.probationApplies === null) {
        throw validation('Activation blocked: probationApplies must be explicitly confirmed (true/false) for this category (D-18/D-25)');
      }
      const updated = await deps.prisma.employmentCategory.update({
        where: { id: params.id },
        data: { status: 'ACTIVE', approvedById: auth.userId, approvedAt: new Date() },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_ACTIVATED', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'SUCCESS', before: { status: cat.status }, after: { status: 'ACTIVE' },
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/employee-categories/:id/deactivate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().min(5) }),
    handler: async ({ params, body, auth, req, deps }) => {
      const cat = await deps.prisma.employmentCategory.findUnique({ where: { id: params.id } });
      if (!cat) throw notFound('EmploymentCategory', params.id);
      const updated = await deps.prisma.employmentCategory.update({ where: { id: params.id }, data: { status: 'INACTIVE' } });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_DEACTIVATED', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'SUCCESS', reason: body.reason,
      });
      return updated;
    },
  });

  // ---------------- Onboarding templates ----------------
  registerRoute(router, deps, {
    method: 'get',
    path: '/onboarding-templates',
    auth: { permission: ['onboarding.manage', 'employees.categories.manage', 'config.approve'], any: true },
    handler: async ({ deps }) =>
      deps.prisma.onboardingTemplate.findMany({ include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { code: 'asc' } }),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding-templates',
    auth: { permission: 'employees.categories.manage' },
    successStatus: 201,
    body: z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_-]{1,40}$/),
      name: z.string().min(3).max(150),
      employmentCategoryCode: z.string().optional(),
      departmentId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      positionId: z.string().uuid().optional(),
      sourceReference: z.string().min(3).max(300),
      items: z
        .array(
          z.object({
            title: z.string().min(3).max(200),
            description: z.string().max(1000).optional(),
            ownerType: z.enum(OWNER_TYPES),
            dueDaysAfterStart: z.number().int().min(-60).max(365).optional(),
            evidenceRequired: z.boolean().default(false),
            escalateAfterDaysOverdue: z.number().int().min(0).max(90).optional(),
            escalateToRoleKey: z.string().optional(),
            policyAcknowledgementRef: z.string().max(200).optional(),
            sourceReference: z.string().max(300).optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    handler: async ({ body, auth, req, deps }) => {
      if (await deps.prisma.onboardingTemplate.findUnique({ where: { code: body.code } })) {
        throw conflict(`Onboarding template '${body.code}' already exists`);
      }
      if (body.employmentCategoryCode) {
        const cat = await deps.prisma.employmentCategory.findUnique({ where: { code: body.employmentCategoryCode } });
        if (!cat) throw validation(`Unknown employment category '${body.employmentCategoryCode}'`);
      }
      for (const item of body.items) {
        if (item.escalateToRoleKey && !(await deps.prisma.role.findUnique({ where: { key: item.escalateToRoleKey } }))) {
          throw validation(`Unknown escalation role '${item.escalateToRoleKey}'`);
        }
      }
      const { items, ...tpl } = body;
      const created = await deps.prisma.onboardingTemplate.create({
        data: {
          ...tpl,
          status: 'DRAFT',
          createdById: auth.userId,
          items: { create: items.map((it, idx) => ({ ...it, sortOrder: idx + 1 })) },
        },
        include: { items: true },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ONBOARDING_TEMPLATE_DRAFTED', targetType: 'OnboardingTemplate', targetId: created.id, outcome: 'SUCCESS', after: { code: created.code, items: items.length },
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding-templates/:id/activate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const tpl = await deps.prisma.onboardingTemplate.findUnique({ where: { id: params.id } });
      if (!tpl) throw notFound('OnboardingTemplate', params.id);
      if (tpl.createdById === auth.userId) throw forbidden('Maker-Checker violation: the author of a template cannot activate it');
      if (tpl.status !== 'DRAFT') throw conflict(`Template is ${tpl.status}; only DRAFT templates can be activated`);
      const updated = await deps.prisma.onboardingTemplate.update({
        where: { id: params.id },
        data: { status: 'ACTIVE', approvedById: auth.userId, approvedAt: new Date() },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ONBOARDING_TEMPLATE_ACTIVATED', targetType: 'OnboardingTemplate', targetId: tpl.id, outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding-templates/:id/deactivate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const tpl = await deps.prisma.onboardingTemplate.findUnique({ where: { id: params.id } });
      if (!tpl) throw notFound('OnboardingTemplate', params.id);
      const updated = await deps.prisma.onboardingTemplate.update({ where: { id: params.id }, data: { status: 'INACTIVE' } });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ONBOARDING_TEMPLATE_DEACTIVATED', targetType: 'OnboardingTemplate', targetId: tpl.id, outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  // ---------------- Probation form templates ----------------
  registerRoute(router, deps, {
    method: 'get',
    path: '/probation-forms',
    auth: 'session',
    handler: async ({ deps }) => {
      const forms = await deps.prisma.probationFormTemplate.findMany({ where: { status: 'ACTIVE' } });
      return forms.map((f) => ({ ...f, values: parseJson<string[]>(f.values, []), ratingScale: parseJson<string[]>(f.ratingScale, []) }));
    },
  });

  // ---------------- Onboarding Candidates (Zoho People Parity) ----------------
  async function resolveOrgDomain(): Promise<string> {
    const org = await deps.prisma.organisation.findFirst();
    if (org?.email && org.email.includes('@')) {
      return org.email.split('@')[1];
    }
    if (org?.website) {
      const cleaned = org.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
      if (cleaned) return cleaned;
    }
    return 'company.com';
  }

  function getBaseCandidates(domain: string) {
    return [
      {
        id: 'cnd-001',
        candidateId: 'CND-2026-0001',
        firstName: 'Sarah',
        lastName: 'Sanders',
        email: 'sarahsanders@zylker.com',
        officialEmail: `sarah.sanders@${domain}`,
        onboardingStatus: 'In Progress',
        department: 'Advisory',
        sourceOfHire: 'Direct',
        gender: 'Female',
        maritalStatus: 'Single',
        aboutMe: 'Advisory specialist with 4+ years consulting experience',
        citizenship: 'Kenyan',
        nickName: 'Sarah',
        expertise: 'Financial Modelling & Valuations',
        joiningDate: '2026-11-15',
        title: 'Senior Advisory Consultant',
        location: 'Nairobi',
        phone: '+254 711 000 101',
        experience: '4 Years',
        highestQualification: 'Master of Science in Finance',
        currentSalary: 'KES 250,000',
        tentativeJoiningDate: '2026-11-15',
        addedBy: 'HR Lead',
        addedTime: '13-Nov-2026 09:30 AM',
        modifiedBy: 'HR Lead',
        modifiedTime: '15-Nov-2026 10:15 AM',
      },
      {
        id: 'cnd-002',
        candidateId: 'CND-2026-0002',
        firstName: 'Rose',
        lastName: 'Stacy',
        email: 'rosestacy@zylker.com',
        officialEmail: `rose.stacy@${domain}`,
        onboardingStatus: 'Offer Accepted',
        department: 'Audit & Assurance',
        sourceOfHire: 'Referral',
        gender: 'Female',
        maritalStatus: 'Single',
        aboutMe: 'Senior statutory auditor and compliance reviewer',
        citizenship: 'Kenyan',
        nickName: 'Rose',
        expertise: 'IFRS & Statutory Audit',
        joiningDate: '2026-11-18',
        title: 'Audit Supervisor',
        location: 'Nairobi',
        phone: '+254 711 000 102',
        experience: '5 Years',
        highestQualification: 'CPA(K) / B.Com',
        currentSalary: 'KES 220,000',
        tentativeJoiningDate: '2026-11-18',
        addedBy: 'HR Lead',
        addedTime: '12-Nov-2026 14:20 PM',
        modifiedBy: 'Line Manager',
        modifiedTime: '14-Nov-2026 11:00 AM',
      },
      {
        id: 'cnd-003',
        candidateId: 'CND-2026-0003',
        firstName: 'Mathew',
        lastName: 'Morales',
        email: 'mathewmorales@zylker.com',
        officialEmail: `mathew.morales@${domain}`,
        onboardingStatus: 'Offer Sent',
        department: 'Tax & Regulatory',
        sourceOfHire: 'LinkedIn',
        gender: 'Male',
        maritalStatus: 'Married',
        aboutMe: 'Transfer pricing and corporate tax associate',
        citizenship: 'Kenyan',
        nickName: 'Mat',
        expertise: 'Corporate Tax & KRA Audits',
        joiningDate: '2026-11-20',
        title: 'Tax Specialist',
        location: 'Nairobi',
        phone: '+254 711 000 103',
        experience: '3 Years',
        highestQualification: 'LL.B / Dip Tax',
        currentSalary: 'KES 195,000',
        tentativeJoiningDate: '2026-11-20',
        addedBy: 'Managing Partner',
        addedTime: '10-Nov-2026 11:15 AM',
        modifiedBy: 'Managing Partner',
        modifiedTime: '13-Nov-2026 16:45 PM',
      },
      {
        id: 'cnd-004',
        candidateId: 'CND-2026-0004',
        firstName: 'Kevin',
        lastName: 'Parker',
        email: 'kevinparker@zylker.com',
        officialEmail: `kevin.parker@${domain}`,
        onboardingStatus: 'In Progress',
        department: 'ICT & Digital',
        sourceOfHire: 'Career Site',
        gender: 'Male',
        maritalStatus: 'Single',
        aboutMe: 'Cloud infrastructure & Microsoft 365 systems administrator',
        citizenship: 'Kenyan',
        nickName: 'Kev',
        expertise: 'Azure & Systems Architecture',
        joiningDate: '2026-11-22',
        title: 'ICT Systems Engineer',
        location: 'Nairobi',
        phone: '+254 711 000 104',
        experience: '6 Years',
        highestQualification: 'BSc Computer Science',
        currentSalary: 'KES 240,000',
        tentativeJoiningDate: '2026-11-22',
        addedBy: 'Operations Director',
        addedTime: '11-Nov-2026 15:40 PM',
        modifiedBy: 'HR Lead',
        modifiedTime: '14-Nov-2026 09:10 AM',
      },
      {
        id: 'cnd-005',
        candidateId: 'CND-2026-0005',
        firstName: 'David',
        lastName: 'Rickman',
        email: 'davidrickman@zylker.com',
        officialEmail: `david.rickman@${domain}`,
        onboardingStatus: 'Offer Sent',
        department: 'Operations',
        sourceOfHire: 'Agency',
        gender: 'Male',
        maritalStatus: 'Married',
        aboutMe: 'Business operations & project workflow lead',
        citizenship: 'Kenyan',
        nickName: 'Dave',
        expertise: 'Operations Management',
        joiningDate: '2026-11-25',
        title: 'Operations Analyst',
        location: 'Nairobi',
        phone: '+254 711 000 105',
        experience: '4 Years',
        highestQualification: 'BBA / PMP',
        currentSalary: 'KES 210,000',
        tentativeJoiningDate: '2026-11-25',
        addedBy: 'Operations Director',
        addedTime: '09-Nov-2026 10:00 AM',
        modifiedBy: 'Operations Director',
        modifiedTime: '12-Nov-2026 14:30 PM',
      },
    ];
  }

  registerRoute(router, deps, {
    method: 'get',
    path: '/onboarding/candidates',
    auth: 'session',
    handler: async () => {
      const domain = await resolveOrgDomain();
      const cfg = await deps.prisma.policyConfiguration.findFirst({
        where: { code: 'UI_ORG_ONBOARDING_CANDIDATES', status: 'ACTIVE' },
      });
      if (!cfg) {
        return getBaseCandidates(domain);
      }
      try {
        const parsed = JSON.parse(cfg.values);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : getBaseCandidates(domain);
      } catch {
        return getBaseCandidates(domain);
      }
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding/candidates',
    auth: 'session',
    body: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      officialEmail: z.string().optional(),
      onboardingStatus: z.string().optional(),
      department: z.string().optional(),
      sourceOfHire: z.string().optional(),
      gender: z.string().optional(),
      maritalStatus: z.string().optional(),
      aboutMe: z.string().optional(),
      citizenship: z.string().optional(),
      nickName: z.string().optional(),
      expertise: z.string().optional(),
      joiningDate: z.string().optional(),
      tentativeJoiningDate: z.string().optional(),
      presentAddress: z.string().optional(),
      permanentAddress: z.string().optional(),
      experience: z.string().optional(),
      phone: z.string().optional(),
      skillSet: z.string().optional(),
      highestQualification: z.string().optional(),
      location: z.string().optional(),
      title: z.string().optional(),
      currentSalary: z.string().optional(),
      additionalInfo: z.string().optional(),
    }),
    handler: async ({ body, auth }) => {
      const domain = await resolveOrgDomain();
      let candidates = getBaseCandidates(domain);
      const cfg = await deps.prisma.policyConfiguration.findFirst({
        where: { code: 'UI_ORG_ONBOARDING_CANDIDATES', status: 'ACTIVE' },
      });
      if (cfg) {
        try {
          const parsed = JSON.parse(cfg.values);
          if (Array.isArray(parsed)) candidates = parsed;
        } catch {
          // fallback
        }
      }

      const seq = candidates.length + 1;
      const candidateId = `CND-2026-${String(seq).padStart(4, '0')}`;
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const newCand = {
        id: `cnd-${Date.now()}`,
        candidateId,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email.trim(),
        officialEmail: body.officialEmail?.trim() || `${body.firstName.trim().toLowerCase()}.${body.lastName.trim().toLowerCase()}@${domain}`,
        onboardingStatus: body.onboardingStatus || 'Draft',
        department: body.department || 'General',
        sourceOfHire: body.sourceOfHire || 'Direct',
        gender: body.gender || 'Not Specified',
        maritalStatus: body.maritalStatus || 'Single',
        aboutMe: body.aboutMe || '',
        citizenship: body.citizenship || 'Kenyan',
        nickName: body.nickName || body.firstName.trim(),
        expertise: body.expertise || '',
        joiningDate: body.joiningDate || formattedDate,
        tentativeJoiningDate: body.tentativeJoiningDate || body.joiningDate || formattedDate,
        presentAddress: body.presentAddress || '',
        permanentAddress: body.permanentAddress || '',
        experience: body.experience || '',
        phone: body.phone || '',
        skillSet: body.skillSet || '',
        highestQualification: body.highestQualification || '',
        location: body.location || 'Nairobi',
        title: body.title || 'Candidate',
        currentSalary: body.currentSalary || '',
        additionalInfo: body.additionalInfo || '',
        addedBy: auth.email || 'HR Operations',
        addedTime: `${formattedDate} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        modifiedBy: auth.email || 'HR Operations',
        modifiedTime: `${formattedDate} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      };

      candidates.unshift(newCand);

      if (cfg) {
        await deps.prisma.policyConfiguration.update({
          where: { id: cfg.id },
          data: { values: JSON.stringify(candidates) },
        });
      } else {
        await deps.prisma.policyConfiguration.create({
          data: {
            code: 'UI_ORG_ONBOARDING_CANDIDATES',
            title: 'Ndakala Workspace UX Config: ONBOARDING_CANDIDATES (ORG)',
            layer: 'ORGANISATION',
            owner: auth.name || auth.email || 'HR Operations',
            effectiveFrom: new Date(),
            createdById: auth.userId,
            status: 'ACTIVE',
            sourceReference: 'NDAKALA_WORKSPACE_UX',
            values: JSON.stringify(candidates),
          },
        });
      }

      return newCand;
    },
  });

  registerRoute(router, deps, {
    method: 'delete',
    path: '/onboarding/candidates/:id',
    auth: 'session',
    params: z.object({ id: z.string() }),
    handler: async ({ params }) => {
      const domain = await resolveOrgDomain();
      let candidates = getBaseCandidates(domain);
      const cfg = await deps.prisma.policyConfiguration.findFirst({
        where: { code: 'UI_ORG_ONBOARDING_CANDIDATES', status: 'ACTIVE' },
      });
      if (cfg) {
        try {
          const parsed = JSON.parse(cfg.values);
          if (Array.isArray(parsed)) candidates = parsed;
        } catch {
          // fallback
        }
      }
      const filtered = candidates.filter((c) => c.id !== params.id && c.candidateId !== params.id);
      if (cfg) {
        await deps.prisma.policyConfiguration.update({
          where: { id: cfg.id },
          data: { values: JSON.stringify(filtered) },
        });
      }
      return { success: true, count: filtered.length };
    },
  });

  return router;
}
