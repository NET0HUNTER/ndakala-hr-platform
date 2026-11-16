import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict, validation } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';

const DEPT_STOP_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'with']);

export function generateDepartmentCodeFromName(name: string): string {
  const rawWords = String(name || '')
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const significant = rawWords.filter((w) => !DEPT_STOP_WORDS.has(w.toLowerCase()));
  const words = significant.length > 0 ? significant : rawWords;

  if (words.length === 0) return 'DEPT';
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase().padEnd(2, 'X');
  }
  return `${words[0].slice(0, 3).toUpperCase()}-${words[1].slice(0, 3).toUpperCase()}`;
}

async function resolveUniqueDepartmentCode(
  prisma: AppDeps['prisma'],
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = generateDepartmentCodeFromName(name);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.department.findUnique({ where: { code: candidate } });
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    candidate = `${base.slice(0, 16)}-${suffix}`;
    suffix += 1;
  }
}

export function createOrganisationRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. Get Organisation Profile (Single organisation)
  registerRoute(router, deps, {
    method: 'get',
    path: '/organisation',
    auth: { permission: 'org.view' },
    handler: async ({ deps }) => {
      let org = await deps.prisma.organisation.findFirst();
      if (!org) {
        org = await deps.prisma.organisation.create({
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
      }
      return org;
    },
  });

  // 2. Update Organisation Profile
  registerRoute(router, deps, {
    method: 'patch',
    path: '/organisation',
    auth: { permission: 'org.manage' },
    body: z.object({
      legalName: z.string().min(2).optional(),
      tradingName: z.string().optional(),
      registrationNumber: z.string().optional(),
      taxId: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      website: z.string().optional(),
      timezone: z.string().optional(),
      currencyCode: z.string().length(3).optional(),
      workCalendar: z.string().optional(),
      coldArchiveMonths: z.number().int().min(1).max(120).optional(),
      coldArchiveEnabled: z.boolean().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      let org = await deps.prisma.organisation.findFirst();
      if (!org) {
        org = await deps.prisma.organisation.create({ data: {} });
      }

      const updated = await deps.prisma.organisation.update({
        where: { id: org.id },
        data: body,
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'ORGANISATION_UPDATE',
          targetType: 'Organisation',
          targetId: org.id,
          outcome: 'SUCCESS',
          before: org,
          after: updated,
        },
      );

      return updated;
    },
  });

  // 3. Departments: List
  registerRoute(router, deps, {
    method: 'get',
    path: '/departments',
    auth: { permission: 'structure.view' },
    handler: async ({ deps }) => {
      return deps.prisma.department.findMany({
        include: {
          parentDepartment: { select: { id: true, name: true, code: true } },
          positions: { select: { id: true, title: true, code: true } },
          _count: { select: { employees: true } },
        },
        orderBy: { name: 'asc' },
      });
    },
  });

  // 4. Departments: Create (auto-generates code from name when omitted)
  registerRoute(router, deps, {
    method: 'post',
    path: '/departments',
    auth: { permission: 'structure.manage' },
    body: z.object({
      code: z.preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z.string().trim().min(2).max(20).toUpperCase().optional(),
      ),
      name: z.string().trim().min(2).max(100),
      parentDepartmentId: z.string().uuid().optional(),
      costCenterId: z.string().uuid().optional(),
      headOfDepartmentId: z.string().uuid().optional(),
      sharedM365Mailbox: z.string().email().optional().nullable(),
      effectiveFrom: z.string().datetime().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      let finalCode = body.code;
      if (finalCode) {
        const exists = await deps.prisma.department.findUnique({ where: { code: finalCode } });
        if (exists) throw conflict(`Department with code '${finalCode}' already exists`);
      } else {
        finalCode = await resolveUniqueDepartmentCode(deps.prisma, body.name);
      }

      const dept = await deps.prisma.department.create({
        data: {
          code: finalCode,
          name: body.name,
          parentDepartmentId: body.parentDepartmentId,
          costCenterId: body.costCenterId,
          headOfDepartmentId: body.headOfDepartmentId,
          sharedM365Mailbox: body.sharedM365Mailbox || null,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'DEPARTMENT_CREATE',
          targetType: 'Department',
          targetId: dept.id,
          outcome: 'SUCCESS',
          after: dept,
        },
      );

      return dept;
    },
  });

  // 4b. Departments: Update existing department
  registerRoute(router, deps, {
    method: 'patch',
    path: '/departments/:id',
    auth: { permission: 'structure.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      name: z.string().trim().min(2).max(100).optional(),
      headOfDepartmentId: z.string().uuid().nullable().optional(),
      parentDepartmentId: z.string().uuid().nullable().optional(),
      costCenterId: z.string().uuid().nullable().optional(),
      sharedM365Mailbox: z.preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
        z.string().email().nullable().optional(),
      ),
      isActive: z.boolean().optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const existing = await deps.prisma.department.findUnique({ where: { id: params.id } });
      if (!existing) throw notFound('Department', params.id);

      if (body.parentDepartmentId === existing.id) {
        throw validation('A department cannot be its own parent department');
      }

      const nextName = body.name !== undefined ? body.name : existing.name;
      const nameChanged = body.name !== undefined && nextName !== existing.name.trim();
      const nextCode = nameChanged
        ? await resolveUniqueDepartmentCode(deps.prisma, nextName, existing.id)
        : existing.code;

      const updated = await deps.prisma.department.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          code: nextCode,
          ...(body.headOfDepartmentId !== undefined ? { headOfDepartmentId: body.headOfDepartmentId } : {}),
          ...(body.parentDepartmentId !== undefined ? { parentDepartmentId: body.parentDepartmentId } : {}),
          ...(body.costCenterId !== undefined ? { costCenterId: body.costCenterId } : {}),
          ...(body.sharedM365Mailbox !== undefined ? { sharedM365Mailbox: body.sharedM365Mailbox } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: {
          parentDepartment: { select: { id: true, name: true, code: true } },
          positions: { select: { id: true, title: true, code: true } },
          _count: { select: { employees: true } },
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'DEPARTMENT_UPDATE',
          targetType: 'Department',
          targetId: updated.id,
          outcome: 'SUCCESS',
          before: existing,
          after: updated,
        },
      );

      return updated;
    },
  });

  // 5. Positions: List
  registerRoute(router, deps, {
    method: 'get',
    path: '/positions',
    auth: { permission: 'structure.view' },
    handler: async ({ deps }) => {
      return deps.prisma.position.findMany({
        include: {
          department: { select: { id: true, name: true, code: true } },
          grade: { select: { id: true, name: true, code: true, level: true } },
          reportsTo: { select: { id: true, title: true, code: true } },
        },
        orderBy: { title: 'asc' },
      });
    },
  });

  // 6. Positions: Create
  registerRoute(router, deps, {
    method: 'post',
    path: '/positions',
    auth: { permission: 'structure.manage' },
    body: z.object({
      code: z.string().min(2).max(20).toUpperCase(),
      title: z.string().min(2).max(100),
      departmentId: z.string().uuid(),
      gradeId: z.string().uuid().optional(),
      reportsToPositionId: z.string().uuid().optional(),
      effectiveFrom: z.string().datetime().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const exists = await deps.prisma.position.findUnique({ where: { code: body.code } });
      if (exists) throw conflict(`Position with code '${body.code}' already exists`);

      const dept = await deps.prisma.department.findUnique({ where: { id: body.departmentId } });
      if (!dept) throw notFound('Department', body.departmentId);

      // Check circular reporting line
      if (body.reportsToPositionId) {
        const parentPos = await deps.prisma.position.findUnique({ where: { id: body.reportsToPositionId } });
        if (!parentPos) throw notFound('ReportsTo Position', body.reportsToPositionId);
      }

      const position = await deps.prisma.position.create({
        data: {
          code: body.code,
          title: body.title,
          departmentId: body.departmentId,
          gradeId: body.gradeId,
          reportsToPositionId: body.reportsToPositionId,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'POSITION_CREATE',
          targetType: 'Position',
          targetId: position.id,
          outcome: 'SUCCESS',
          after: position,
        },
      );

      return position;
    },
  });

  // 7. Grades: List & Create
  registerRoute(router, deps, {
    method: 'get',
    path: '/grades',
    auth: { permission: 'structure.view' },
    handler: async ({ deps }) => {
      return deps.prisma.grade.findMany({ orderBy: { level: 'asc' } });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/grades',
    auth: { permission: 'structure.manage' },
    body: z.object({
      code: z.string().min(1).max(20).toUpperCase(),
      name: z.string().min(2).max(50),
      level: z.number().int().min(1).max(20),
      noticePeriodDays: z.number().int().min(7).max(180).default(30),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const exists = await deps.prisma.grade.findUnique({ where: { code: body.code } });
      if (exists) throw conflict(`Grade code '${body.code}' already exists`);

      const grade = await deps.prisma.grade.create({ data: body });
      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'GRADE_CREATE',
          targetType: 'Grade',
          targetId: grade.id,
          outcome: 'SUCCESS',
          after: grade,
        },
      );
      return grade;
    },
  });

  // 8. Locations: List & Create
  registerRoute(router, deps, {
    method: 'get',
    path: '/locations',
    auth: { permission: 'structure.view' },
    handler: async ({ deps }) => {
      return deps.prisma.location.findMany({ orderBy: { name: 'asc' } });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/locations',
    auth: { permission: 'structure.manage' },
    body: z.object({
      code: z.string().min(2).max(20).toUpperCase(),
      name: z.string().min(2).max(100),
      address: z.string().optional(),
      isHeadOffice: z.boolean().default(false),
      timezone: z.string().default('Africa/Nairobi'),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const exists = await deps.prisma.location.findUnique({ where: { code: body.code } });
      if (exists) throw conflict(`Location with code '${body.code}' already exists`);

      const loc = await deps.prisma.location.create({ data: body });
      return loc;
    },
  });

  return router;
}
