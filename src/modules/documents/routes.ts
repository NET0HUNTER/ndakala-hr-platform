import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, forbidden, validation } from '../../core/errors/errors.js';
import {
  validateUploadFile,
  storeFile,
  readFile,
  generateSignedDownloadToken,
  verifySignedDownloadToken,
} from '../../core/storage/storage.js';
import { writeAudit } from '../../core/audit/audit.js';

export function createDocumentsRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. List Documents
  registerRoute(router, deps, {
    method: 'get',
    path: '/documents',
    auth: { permission: 'documents.view' },
    query: z.object({
      category: z.string().optional(),
    }).optional(),
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
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 2. Upload Document (Multipart/Raw Base64 Buffer)
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
        },
      });

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

  // 3. Request Short-Lived Signed Download Link
  registerRoute(router, deps, {
    method: 'post',
    path: '/documents/:id/token',
    auth: { permission: 'documents.download' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const doc = await deps.prisma.documentRecord.findUnique({
        where: { id: params.id },
      });
      if (!doc || doc.isArchived) throw notFound('Document', params.id);

      // Generate 5-minute signed token
      const downloadToken = generateSignedDownloadToken(doc.id, 300);
      return {
        documentId: doc.id,
        fileName: doc.fileName,
        downloadToken,
        expiresInSeconds: 300,
        downloadUrl: `/api/v1/documents/download?token=${downloadToken}`,
      };
    },
  });

  // 4. Download file with signed token
  router.get('/documents/download', async (req, res, next) => {
    try {
      const token = req.query.token as string;
      if (!token) throw forbidden('Download token missing');

      const { documentId } = verifySignedDownloadToken(token);
      const doc = await deps.prisma.documentRecord.findUnique({
        where: { id: documentId },
      });

      if (!doc || doc.isArchived) throw notFound('Document', documentId);

      const fileBuffer = readFile(doc.storageKey);

      await writeAudit(
        deps.prisma,
        { ip: req.ip, userAgent: req.get('user-agent'), correlationId: req.requestId },
        {
          action: 'DOCUMENT_DOWNLOAD',
          targetType: 'DocumentRecord',
          targetId: doc.id,
          outcome: 'SUCCESS',
          after: { fileName: doc.fileName },
        },
      );

      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
