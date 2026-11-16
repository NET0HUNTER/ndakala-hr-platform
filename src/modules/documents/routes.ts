import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, forbidden } from '../../core/errors/errors.js';
import {
  validateUploadFile,
  storeFile,
  generateSignedDownloadToken,
  verifySignedDownloadToken,
} from '../../core/storage/storage.js';
import { writeAudit } from '../../core/audit/audit.js';
import {
  assertCanAccessDocument,
  bulkFilesAction,
  dualWriteToSharePointIfEnabled,
  exportFilesCsv,
  generateTemplatePdf,
  listUnifiedFiles,
  readDocumentStreamBuffer,
  uploadOrganizationFile,
} from './service.js';
import { resolveSharePointFolderForCategory } from '../m365/client.js';
import { runColdStorageArchival } from '../m365/archivalJob.js';

const fileFilterQuerySchema = z
  .object({
    tab: z.enum(['shared_with_me', 'shared_with_role', 'org', 'employee', 'templates']).optional(),
    fileName: z.string().optional(),
    fileFormat: z.string().optional(),
    folderId: z.string().optional(),
    fileAccess: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(),
    locationId: z.string().optional(),
    departmentId: z.string().optional(),
    updatedFrom: z.string().optional(),
    updatedTo: z.string().optional(),
    expiryFrom: z.string().optional(),
    expiryTo: z.string().optional(),
  })
  .optional();

export function createDocumentsRouter(deps: AppDeps): Router {
  const router = Router();

  // =========================================================================
  // LEGACY & CORE DOCUMENT ENDPOINTS (/documents*)
  // =========================================================================

  // 1. List Documents
  registerRoute(router, deps, {
    method: 'get',
    path: '/documents',
    auth: { permission: 'documents.view' },
    query: z
      .object({
        category: z.string().optional(),
      })
      .optional(),
    handler: async ({ query, deps }) => {
      const where: any = { isArchived: false };
      if (query?.category) where.category = query.category;

      return deps.prisma.documentRecord.findMany({
        where,
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSizeBytes: true,
          category: true,
          securityClassification: true,
          version: true,
          uploadedById: true,
          externalProvider: true,
          localStoragePurged: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 2. Upload Document (Multipart/Raw Base64 Buffer -> AES-256-GCM + SharePoint Dual-Write)
  registerRoute(router, deps, {
    method: 'post',
    path: '/documents/upload',
    auth: { permission: 'documents.upload' },
    body: z.object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      category: z.enum(['POLICY', 'ORGANISATION', 'COMPLIANCE']),
      securityClassification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).default('INTERNAL'),
      fileBase64: z.string().min(1),
    }),
    handler: async ({ body, auth, req, deps }) => {
      const buffer = Buffer.from(body.fileBase64, 'base64');
      validateUploadFile(body.fileName, body.mimeType, buffer.length);

      const { storageKey, storagePath, checksumSha256 } = storeFile(buffer, body.fileName);

      const record = await deps.prisma.documentRecord.create({
        data: {
          fileName: body.fileName,
          mimeType: body.mimeType,
          fileSizeBytes: buffer.length,
          storageKey,
          storagePath,
          checksumSha256,
          category: body.category,
          securityClassification: body.securityClassification,
          uploadedById: auth.userId,
          updatedById: auth.userId,
          lastAccessedAt: new Date(),
        },
      });

      const spFolder = resolveSharePointFolderForCategory(body.category, body.category);
      await dualWriteToSharePointIfEnabled(deps.prisma, record.id, buffer, spFolder, body.fileName, body.mimeType);

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'DOCUMENT_UPLOAD',
          targetType: 'DocumentRecord',
          targetId: record.id,
          outcome: 'SUCCESS',
          after: { fileName: record.fileName, sizeBytes: record.fileSizeBytes, checksum: checksumSha256 },
        },
      );

      return {
        id: record.id,
        fileName: record.fileName,
        fileSizeBytes: record.fileSizeBytes,
        checksumSha256: record.checksumSha256,
        createdAt: record.createdAt,
      };
    },
  });

  // 3. Request Short-Lived Signed Download & Inline Preview Token (RBAC Enforced)
  registerRoute(router, deps, {
    method: 'post',
    path: '/documents/:id/token',
    auth: { permission: 'documents.download' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const doc = await assertCanAccessDocument(deps.prisma, auth, params.id);
      if (doc.isArchived && !auth.permissions.has('documents.upload')) {
        throw notFound('Document', params.id);
      }

      const downloadToken = generateSignedDownloadToken(doc.id, 300, auth.userId);
      return {
        documentId: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        downloadToken,
        expiresInSeconds: 300,
        inlineUrl: `/api/v1/files/${doc.id}/inline?token=${downloadToken}`,
        downloadUrl: `/api/v1/documents/download?token=${downloadToken}`,
      };
    },
  });

  // 4. Download file with signed token (AES-256 decrypt + SharePoint archive fallback)
  router.get('/documents/download', async (req, res, next) => {
    try {
      const token = req.query.token as string;
      if (!token) throw forbidden('Download token missing');

      const { documentId } = verifySignedDownloadToken(token, req.auth?.userId);
      const doc = await deps.prisma.documentRecord.findUnique({
        where: { id: documentId },
      });

      if (!doc || (doc.isArchived && !req.auth?.permissions?.has('documents.upload'))) {
        throw notFound('Document', documentId);
      }

      const { buffer: fileBuffer, source } = await readDocumentStreamBuffer(deps.prisma, doc);

      await writeAudit(
        deps.prisma,
        {
          userId: req.auth?.userId,
          email: req.auth?.email,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          correlationId: req.requestId,
        },
        {
          action: 'DOCUMENT_DOWNLOAD',
          targetType: 'DocumentRecord',
          targetId: doc.id,
          outcome: 'SUCCESS',
          after: { fileName: doc.fileName, storageSource: source },
        },
      );

      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName.replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (err) {
      next(err);
    }
  });

  // =========================================================================
  // UNIFIED FILES HUB ROUTES (/files*) — ZOHO PEOPLE PARITY + ZERO-TRUST M365
  // =========================================================================

  // 5. List Unified Files across tabs & multi-facet Filter Drawer
  registerRoute(router, deps, {
    method: 'get',
    path: '/files',
    auth: { permission: 'documents.view' },
    query: fileFilterQuerySchema,
    handler: async ({ query, auth, deps }) => {
      return listUnifiedFiles(deps.prisma, auth, query || {});
    },
  });

  // 6. Folders List & Create
  registerRoute(router, deps, {
    method: 'get',
    path: '/files/folders',
    auth: { permission: 'documents.view' },
    query: z.object({ scope: z.string().optional() }).optional(),
    handler: async ({ query, deps }) => {
      const folders = await deps.prisma.documentFolder.findMany({
        where: query?.scope ? { scope: query.scope } : undefined,
        include: {
          _count: { select: { documents: true } },
        },
        orderBy: { name: 'asc' },
      });
      return folders.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        scope: f.scope,
        parentId: f.parentId,
        description: f.description,
        documentCount: f._count.documents,
        createdAt: f.createdAt,
      }));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/files/folders',
    auth: { permission: 'documents.upload' },
    body: z.object({
      name: z.string().trim().min(2).max(120),
      scope: z.enum(['ORG', 'EMPLOYEE', 'TEMPLATES']).default('ORG'),
      parentId: z.string().uuid().optional().nullable(),
      description: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req, deps }) => {
      const folder = await deps.prisma.documentFolder.create({
        data: {
          name: body.name,
          scope: body.scope,
          parentId: body.parentId || null,
          description: body.description || null,
          createdById: auth.userId,
        },
      });
      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'FILES_FOLDER_CREATED',
          targetType: 'DocumentFolder',
          targetId: folder.id,
          outcome: 'SUCCESS',
          after: { name: folder.name, scope: folder.scope },
        },
      );
      return folder;
    },
  });

  // 7. Add Organization / Scoped File (Audience Sharing + Expiry + SharePoint Dual-Write)
  registerRoute(router, deps, {
    method: 'post',
    path: '/files/organization',
    auth: { permission: 'documents.upload' },
    body: z.object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      fileBase64: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(['ORGANISATION', 'POLICY', 'COMPLIANCE', 'EMPLOYEE']).default('ORGANISATION'),
      securityClassification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).default('INTERNAL'),
      folderId: z.string().uuid().optional().nullable(),
      expiryDate: z.string().optional().nullable(),
      locationId: z.string().uuid().optional().nullable(),
      departmentId: z.string().uuid().optional().nullable(),
      shareScope: z.enum(['ORG', 'SPECIFIC', 'ROLE', 'EMPLOYEE']).default('ORG'),
      sharedRoleKeys: z.array(z.string()).optional(),
      sharedDepartmentIds: z.array(z.string()).optional(),
      sharedLocationIds: z.array(z.string()).optional(),
      sharedEmployeeIds: z.array(z.string()).optional(),
      employeeId: z.string().uuid().optional().nullable(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req, deps }) => {
      return uploadOrganizationFile(deps.prisma, auth, req, body);
    },
  });

  // 8. Bulk Actions (Delete, Archive, Unarchive, Copy, Move — with Legal Hold guard)
  registerRoute(router, deps, {
    method: 'post',
    path: '/files/bulk',
    auth: { permission: 'documents.upload' },
    body: z.object({
      action: z.enum(['DELETE', 'ARCHIVE', 'UNARCHIVE', 'COPY', 'MOVE']),
      documentIds: z.array(z.string().uuid()).min(1),
      targetFolderId: z.string().uuid().optional().nullable(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      return bulkFilesAction(deps.prisma, auth, req, body);
    },
  });

  // 9. Export Files (Matches current view or filter)
  registerRoute(router, deps, {
    method: 'post',
    path: '/files/export',
    auth: { permission: 'documents.view' },
    body: fileFilterQuerySchema,
    handler: async ({ body, auth, req, deps }) => {
      return exportFilesCsv(deps.prisma, auth, req, body || {});
    },
  });

  // 10. HR Forms & Templates List + Native Form -> Backend PDF Compiler
  registerRoute(router, deps, {
    method: 'get',
    path: '/files/templates',
    auth: { permission: 'documents.view' },
    handler: async ({ deps }) => {
      const templates = await deps.prisma.hrTemplate.findMany({
        where: { isActive: true },
        include: {
          document: { select: { id: true, fileName: true, mimeType: true, updatedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return templates.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        category: t.category,
        fields: (() => {
          try {
            return JSON.parse(t.schemaJson);
          } catch {
            return [];
          }
        })(),
        documentId: t.documentId,
        createdAt: t.createdAt,
      }));
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/files/templates/:id/generate-pdf',
    auth: { permission: 'documents.view' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      formValues: z.record(z.string()),
      employeeId: z.string().uuid().optional().nullable(),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req, deps }) => {
      return generateTemplatePdf(deps.prisma, auth, req, params.id, body);
    },
  });

  // 11. Zero-Trust Inline Preview Token & Stream
  registerRoute(router, deps, {
    method: 'post',
    path: '/files/:id/token',
    auth: { permission: 'documents.view' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const doc = await assertCanAccessDocument(deps.prisma, auth, params.id);
      const token = generateSignedDownloadToken(doc.id, 300, auth.userId);
      return {
        documentId: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        token,
        expiresInSeconds: 300,
        inlineUrl: `/api/v1/files/${doc.id}/inline?token=${token}`,
        downloadUrl: `/api/v1/documents/download?token=${token}`,
      };
    },
  });

  router.get('/files/:id/inline', async (req, res, next) => {
    try {
      const token = req.query.token as string;
      if (!token) throw forbidden('Inline preview token missing');

      const { documentId } = verifySignedDownloadToken(token, req.auth?.userId);
      if (documentId !== req.params.id) {
        throw forbidden('Token document mismatch');
      }

      const doc = await deps.prisma.documentRecord.findUnique({ where: { id: documentId } });
      if (!doc) throw notFound('Document', documentId);

      const { buffer, source } = await readDocumentStreamBuffer(deps.prisma, doc);

      await writeAudit(
        deps.prisma,
        {
          userId: req.auth?.userId,
          email: req.auth?.email,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          correlationId: req.requestId,
        },
        {
          action: 'DOCUMENT_INLINE_PREVIEW',
          targetType: 'DocumentRecord',
          targetId: doc.id,
          outcome: 'SUCCESS',
          after: { fileName: doc.fileName, storageSource: source },
        },
      );

      res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  // 12. Manual Trigger for Cold Storage Archival Job (> coldArchiveMonths, default 6)
  registerRoute(router, deps, {
    method: 'post',
    path: '/files/cold-archive/run',
    auth: { permission: 'integrations.manage' },
    body: z
      .object({
        overrideMonths: z.number().int().min(1).max(120).optional(),
        force: z.boolean().optional(),
      })
      .optional(),
    handler: async ({ body, auth, deps }) => {
      return runColdStorageArchival(deps.prisma, auth.userId, {
        overrideMonths: body?.overrideMonths,
        force: body?.force ?? true,
      });
    },
  });

  return router;
}
