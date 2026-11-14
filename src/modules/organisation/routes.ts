import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict, validation } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';

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
        },
        orderBy: { name: 'asc' },
      });
    },
  });

  // 4. Departments: Create
  registerRoute(router, deps, {
    method: 'post',
    path: '/departments',
    auth: { permission: 'structure.manage' },
    body: z.object({
      code: z.string().min(2).max(20).toUpperCase(),
      name: z.string().min(2).max(100),
      parentDepartmentId: z.string().uuid().optional(),
      costCenterId: z.string().uuid().optional(),
      headOfDepartmentId: z.string().uuid().optional(),
      effectiveFrom: z.string().datetime().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const exists = await deps.prisma.department.findUnique({ where: { code: body.code } });
      if (exists) throw conflict(`Department with code '${body.code}' already exists`);

      const dept = await deps.prisma.department.create({
        data: {
          code: body.code,
          name: body.name,
          parentDepartmentId: body.parentDepartmentId,
          costCenterId: body.costCenterId,
          headOfDepartmentId: body.headOfDepartmentId,
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
