import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { conflict, forbidden, notFound, validation } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import {
  generateSignedDownloadToken,
  localFileExists,
  purgeLocalFile,
  readFile as readLocalEncryptedFile,
  storeFile,
  validateUploadFile,
} from '../../core/storage/storage.js';
import { buildStructuredPdf } from '../../core/documents/pdfBuilder.js';
import {
  downloadSharePointFile,
  getActiveM365Config,
  resolveSharePointFolderForCategory,
  uploadFileToSharePoint,
} from '../m365/client.js';

export interface AuthActor {
  userId: string;
  email: string;
  roles: string[];
  permissions: Set<string>;
}

export interface FileFilterQuery {
  tab?: 'shared_with_me' | 'shared_with_role' | 'org' | 'employee' | 'templates';
  fileName?: string;
  fileFormat?: string;
  folderId?: string;
  fileAccess?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
  locationId?: string;
  departmentId?: string;
  updatedFrom?: string;
  updatedTo?: string;
  expiryFrom?: string;
  expiryTo?: string;
}

function parseJsonStringArray(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function getFileExtensionFormat(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName).replace(/^\./, '').toUpperCase();
  if (ext) return ext;
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('wordprocessingml')) return 'DOCX';
  if (mimeType.includes('spreadsheetml')) return 'XLSX';
  if (mimeType.includes('csv')) return 'CSV';
  if (mimeType.includes('png')) return 'PNG';
  if (mimeType.includes('jpeg')) return 'JPEG';
  return 'FILE';
}

function isHrOrAdmin(auth: AuthActor): boolean {
  return (
    auth.permissions.has('documents.upload') ||
    auth.permissions.has('org.manage') ||
    auth.roles.some((r) => ['ict_admin', 'system_admin', 'managing_partner', 'head_of_hr', 'operations_director'].includes(r))
  );
}

async function resolveActorProfile(db: PrismaClient, auth: AuthActor) {
  const emp = await db.employee.findFirst({
    where: { OR: [{ userId: auth.userId }, { workEmail: auth.email }] },
    select: { id: true, departmentId: true, locationId: true, employeeNumber: true, firstName: true, lastName: true },
  });
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: { departmentId: true },
  });
  return {
    employeeId: emp?.id || null,
    employeeNumber: emp?.employeeNumber || null,
    departmentId: emp?.departmentId || user?.departmentId || null,
    locationId: emp?.locationId || null,
  };
}

export async function assertCanAccessDocument(
  db: PrismaClient,
  auth: AuthActor,
  docId: string,
): Promise<any> {
  const doc = await db.documentRecord.findUnique({
    where: { id: docId },
    include: {
      folder: { select: { id: true, name: true, scope: true } },
      employeeDocuments: {
        include: {
          employee: { select: { id: true, userId: true, employeeNumber: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!doc) throw notFound('Document', docId);

  const admin = isHrOrAdmin(auth);
  if (admin) return doc;

  // Non-admin employees can never bypass restricted classification or inactive archived org docs unless owner
  if (doc.securityClassification === 'RESTRICTED') {
    throw forbidden('Access denied: document carries RESTRICTED classification');
  }

  const profile = await resolveActorProfile(db, auth);
  if (doc.category === 'EMPLOYEE') {
    const owns = doc.employeeDocuments.some(
      (ed) => ed.employee.userId === auth.userId || (profile.employeeId && ed.employeeId === profile.employeeId),
    );
    const sharedEmpIds = parseJsonStringArray(doc.sharedEmployeeIdsJson);
    const explicitlyShared = profile.employeeId ? sharedEmpIds.includes(profile.employeeId) : false;
    if (!owns && !explicitlyShared) {
      throw forbidden('Access denied: you do not have permission to view this employee file');
    }
    return doc;
  }

  if (doc.isArchived) {
    throw forbidden('Access denied: this file has been archived');
  }

  if (doc.shareScope === 'ORG') return doc;

  const sharedRoles = parseJsonStringArray(doc.sharedRoleKeysJson);
  const sharedDepts = parseJsonStringArray(doc.sharedDepartmentIdsJson);
  const sharedLocs = parseJsonStringArray(doc.sharedLocationIdsJson);
  const sharedEmps = parseJsonStringArray(doc.sharedEmployeeIdsJson);

  const matches =
    sharedRoles.some((r) => auth.roles.includes(r)) ||
    (profile.departmentId && sharedDepts.includes(profile.departmentId)) ||
    (profile.locationId && sharedLocs.includes(profile.locationId)) ||
    (profile.employeeId && sharedEmps.includes(profile.employeeId));

  if (!matches) {
    throw forbidden('Access denied: this document is not shared with your role, department, or account');
  }

  return doc;
}

export async function dualWriteToSharePointIfEnabled(
  db: PrismaClient,
  docId: string,
  buffer: Buffer,
  folderPath: string,
  fileName: string,
  mimeType: string,
) {
  const m365Config = await getActiveM365Config(db);
  if (!m365Config || !m365Config.sharepointSiteUrl) return null;

  try {
    const uploaded = await uploadFileToSharePoint(m365Config, folderPath, fileName, buffer, mimeType);
    await db.documentRecord.update({
      where: { id: docId },
      data: {
        externalProvider: 'DUAL_WRITE_SHAREPOINT',
        sharepointSiteId: uploaded.siteId,
        sharepointDriveId: uploaded.driveId,
        sharepointItemId: uploaded.itemId,
        sharepointETag: uploaded.eTag || null,
        lastSyncedAt: new Date(),
      },
    });
    return uploaded;
  } catch {
    // Hybrid resilience: local encrypted file remains authoritative if Graph temporarily unavailable
    return null;
  }
}

export async function readDocumentStreamBuffer(
  db: PrismaClient,
  doc: {
    id: string;
    storageKey: string;
    localStoragePurged?: boolean;
    sharepointDriveId?: string | null;
    sharepointItemId?: string | null;
  },
): Promise<{ buffer: Buffer; source: 'LOCAL_AES256' | 'SHAREPOINT_ARCHIVE' }> {
  await db.documentRecord.update({
    where: { id: doc.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  if (!doc.localStoragePurged && localFileExists(doc.storageKey)) {
    return { buffer: readLocalEncryptedFile(doc.storageKey), source: 'LOCAL_AES256' };
  }

  if (doc.sharepointItemId && doc.sharepointDriveId) {
    const m365 = await getActiveM365Config(db);
    if (m365) {
      const buffer = await downloadSharePointFile(m365, doc.sharepointDriveId, doc.sharepointItemId);
      return { buffer, source: 'SHAREPOINT_ARCHIVE' };
    }
  }

  return { buffer: readLocalEncryptedFile(doc.storageKey), source: 'LOCAL_AES256' };
}

export async function listUnifiedFiles(
  db: PrismaClient,
  auth: AuthActor,
  query: FileFilterQuery,
) {
  const tab = query.tab || 'org';
  const admin = isHrOrAdmin(auth);
  const profile = await resolveActorProfile(db, auth);

  const [departments, locations] = await Promise.all([
    db.department.findMany({ select: { id: true, name: true } }),
    db.location.findMany({ select: { id: true, name: true } }),
  ]);
  const deptNameMap = new Map(departments.map((d) => [d.id, d.name]));
  const locNameMap = new Map(locations.map((l) => [l.id, l.name]));

  const where: any = {};

  if (query.fileAccess === 'ARCHIVED') {
    where.isArchived = true;
  } else if (query.fileAccess !== 'ALL') {
    where.isArchived = false;
  }

  if (query.folderId && query.folderId !== 'ALL') {
    where.folderId = query.folderId;
  }
  if (query.locationId && query.locationId !== 'ALL') {
    where.locationId = query.locationId;
  }
  if (query.departmentId && query.departmentId !== 'ALL') {
    where.departmentId = query.departmentId;
  }
  if (query.updatedFrom || query.updatedTo) {
    where.updatedAt = {};
    if (query.updatedFrom) where.updatedAt.gte = new Date(query.updatedFrom);
    if (query.updatedTo) {
      const d = new Date(query.updatedTo);
      d.setHours(23, 59, 59, 999);
      where.updatedAt.lte = d;
    }
  }
  if (query.expiryFrom || query.expiryTo) {
    where.expiryDate = {};
    if (query.expiryFrom) where.expiryDate.gte = new Date(query.expiryFrom);
    if (query.expiryTo) {
      const d = new Date(query.expiryTo);
      d.setHours(23, 59, 59, 999);
      where.expiryDate.lte = d;
    }
  }

  if (tab === 'employee') {
    where.category = 'EMPLOYEE';
  } else if (tab === 'org') {
    where.category = { in: ['ORGANISATION', 'POLICY', 'COMPLIANCE'] };
  }

  const allDocs = await db.documentRecord.findMany({
    where,
    include: {
      folder: { select: { id: true, name: true, scope: true } },
      employeeDocuments: {
        include: {
          employee: { select: { id: true, userId: true, employeeNumber: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const nameTerm = (query.fileName || '').trim().toLowerCase();
  const formatFilter = (query.fileFormat || 'ALL').toUpperCase();

  const filtered = allDocs.filter((doc) => {
    // Filter drawer text & format match
    if (nameTerm) {
      const hay = `${doc.fileName} ${doc.description || ''} ${doc.folder?.name || ''}`.toLowerCase();
      if (!hay.includes(nameTerm)) return false;
    }
    const fmt = getFileExtensionFormat(doc.fileName, doc.mimeType);
    if (formatFilter && formatFilter !== 'ALL' && fmt !== formatFilter) {
      return false;
    }

    const sharedEmps = parseJsonStringArray(doc.sharedEmployeeIdsJson);
    const sharedRoles = parseJsonStringArray(doc.sharedRoleKeysJson);
    const sharedDepts = parseJsonStringArray(doc.sharedDepartmentIdsJson);
    const sharedLocs = parseJsonStringArray(doc.sharedLocationIdsJson);

    // Tab visibility rules
    if (tab === 'shared_with_me') {
      const ownsEmp =
        profile.employeeId &&
        doc.employeeDocuments.some((ed) => ed.employeeId === profile.employeeId || ed.employee.userId === auth.userId);
      const explicitMe = profile.employeeId ? sharedEmps.includes(profile.employeeId) : false;
      return Boolean(ownsEmp || explicitMe) && doc.securityClassification !== 'RESTRICTED';
    }

    if (tab === 'shared_with_role') {
      if (doc.category === 'EMPLOYEE' || doc.securityClassification === 'RESTRICTED') return false;
      if (doc.shareScope === 'ORG') return true;
      return (
        sharedRoles.some((r) => auth.roles.includes(r)) ||
        Boolean(profile.departmentId && sharedDepts.includes(profile.departmentId)) ||
        Boolean(profile.locationId && sharedLocs.includes(profile.locationId))
      );
    }

    if (tab === 'employee') {
      if (admin) return true;
      return Boolean(
        profile.employeeId &&
          doc.employeeDocuments.some((ed) => ed.employeeId === profile.employeeId || ed.employee.userId === auth.userId),
      );
    }

    // tab === 'org'
    if (admin) return true;
    if (doc.securityClassification === 'RESTRICTED') return false;
    if (doc.shareScope === 'ORG') return true;
    return (
      sharedRoles.some((r) => auth.roles.includes(r)) ||
      Boolean(profile.departmentId && sharedDepts.includes(profile.departmentId)) ||
      Boolean(profile.locationId && sharedLocs.includes(profile.locationId)) ||
      Boolean(profile.employeeId && sharedEmps.includes(profile.employeeId))
    );
  });

  return filtered.map((doc) => {
    const sharedRoles = parseJsonStringArray(doc.sharedRoleKeysJson);
    const sharedDepts = parseJsonStringArray(doc.sharedDepartmentIdsJson);
    const sharedLocs = parseJsonStringArray(doc.sharedLocationIdsJson);
    const empLink = doc.employeeDocuments[0];

    let sharedWithLabel = 'Entire Organization';
    if (doc.category === 'EMPLOYEE' && empLink) {
      sharedWithLabel = `${empLink.employee.firstName} ${empLink.employee.lastName} (${empLink.employee.employeeNumber})`;
    } else if (doc.shareScope !== 'ORG') {
      const badges: string[] = [];
      if (sharedRoles.length) badges.push(`Roles: ${sharedRoles.join(', ')}`);
      if (sharedDepts.length) badges.push(sharedDepts.map((id) => deptNameMap.get(id) || id).join(', '));
      if (sharedLocs.length) badges.push(sharedLocs.map((id) => locNameMap.get(id) || id).join(', '));
      if (doc.departmentId && !sharedDepts.length) badges.push(deptNameMap.get(doc.departmentId) || 'Department');
      if (doc.locationId && !sharedLocs.length) badges.push(locNameMap.get(doc.locationId) || 'Location');
      sharedWithLabel = badges.join(' • ') || 'Selected Audience';
    }

    return {
      id: doc.id,
      fileName: doc.fileName,
      description: doc.description,
      mimeType: doc.mimeType,
      fileFormat: getFileExtensionFormat(doc.fileName, doc.mimeType),
      fileSizeBytes: doc.fileSizeBytes,
      category: doc.category,
      securityClassification: doc.securityClassification,
      version: doc.version,
      folderId: doc.folderId,
      folderName: doc.folder?.name || 'Root',
      sharedWith: sharedWithLabel,
      shareScope: doc.shareScope,
      locationId: doc.locationId,
      locationName: doc.locationId ? locNameMap.get(doc.locationId) || null : null,
      departmentId: doc.departmentId,
      departmentName: doc.departmentId ? deptNameMap.get(doc.departmentId) || null : null,
      expiryDate: doc.expiryDate,
      isArchived: doc.isArchived,
      externalProvider: doc.externalProvider,
      sharepointItemId: doc.sharepointItemId,
      lastSyncedAt: doc.lastSyncedAt,
      localStoragePurged: doc.localStoragePurged,
      inlinePreviewOnly: doc.category === 'EMPLOYEE' || doc.securityClassification !== 'PUBLIC',
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt,
    };
  });
}

export async function uploadOrganizationFile(
  db: PrismaClient,
  auth: AuthActor,
  req: Request,
  input: {
    fileName: string;
    mimeType: string;
    fileBase64: string;
    description?: string;
    category?: 'ORGANISATION' | 'POLICY' | 'COMPLIANCE' | 'EMPLOYEE';
    securityClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    folderId?: string | null;
    expiryDate?: string | null;
    locationId?: string | null;
    departmentId?: string | null;
    shareScope?: 'ORG' | 'SPECIFIC' | 'ROLE' | 'EMPLOYEE';
    sharedRoleKeys?: string[];
    sharedDepartmentIds?: string[];
    sharedLocationIds?: string[];
    sharedEmployeeIds?: string[];
    employeeId?: string | null;
  },
) {
  const buffer = Buffer.from(input.fileBase64, 'base64');
  validateUploadFile(input.fileName, input.mimeType, buffer.length);

  const { storageKey, storagePath, checksumSha256 } = storeFile(buffer, input.fileName);

  const folder = input.folderId
    ? await db.documentFolder.findUnique({ where: { id: input.folderId } })
    : null;

  const category = input.category || 'ORGANISATION';
  const record = await db.documentRecord.create({
    data: {
      fileName: input.fileName,
      description: input.description || null,
      mimeType: input.mimeType,
      fileSizeBytes: buffer.length,
      storageKey,
      storagePath,
      checksumSha256,
      category,
      securityClassification: input.securityClassification || 'INTERNAL',
      uploadedById: auth.userId,
      updatedById: auth.userId,
      folderId: folder ? folder.id : null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      locationId: input.locationId || null,
      departmentId: input.departmentId || null,
      shareScope: input.shareScope || 'ORG',
      sharedRoleKeysJson: input.sharedRoleKeys?.length ? JSON.stringify(input.sharedRoleKeys) : null,
      sharedDepartmentIdsJson: input.sharedDepartmentIds?.length ? JSON.stringify(input.sharedDepartmentIds) : null,
      sharedLocationIdsJson: input.sharedLocationIds?.length ? JSON.stringify(input.sharedLocationIds) : null,
      sharedEmployeeIdsJson: input.sharedEmployeeIds?.length ? JSON.stringify(input.sharedEmployeeIds) : null,
      lastAccessedAt: new Date(),
    },
  });

  let employeeNumber: string | null = null;
  if (category === 'EMPLOYEE' && input.employeeId) {
    const emp = await db.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, employeeNumber: true },
    });
    if (emp) {
      employeeNumber = emp.employeeNumber;
      await db.employeeDocument.create({
        data: {
          employeeId: emp.id,
          documentRecordId: record.id,
          documentType: 'OTHER',
          visibility: 'HR_AND_EMPLOYEE',
          notes: input.fileName,
          uploadedById: auth.userId,
        },
      });
    }
  }

  const spFolder = resolveSharePointFolderForCategory(category, folder?.name, employeeNumber);
  const spResult = await dualWriteToSharePointIfEnabled(db, record.id, buffer, spFolder, input.fileName, input.mimeType);

  await writeAudit(
    db,
    { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId, ip: req.ip },
    {
      action: 'FILE_HUB_UPLOAD',
      targetType: 'DocumentRecord',
      targetId: record.id,
      outcome: 'SUCCESS',
      after: {
        fileName: record.fileName,
        category,
        folderName: folder?.name || 'Root',
        shareScope: record.shareScope,
        sharepointSynced: Boolean(spResult),
        sharepointItemId: spResult?.itemId || null,
      },
    },
  );

  return {
    id: record.id,
    fileName: record.fileName,
    checksumSha256: record.checksumSha256,
    sharepointSynced: Boolean(spResult),
    sharepointItemId: spResult?.itemId || null,
  };
}

export async function bulkFilesAction(
  db: PrismaClient,
  auth: AuthActor,
  req: Request,
  input: {
    action: 'DELETE' | 'ARCHIVE' | 'UNARCHIVE' | 'COPY' | 'MOVE';
    documentIds: string[];
    targetFolderId?: string | null;
  },
) {
  if (!input.documentIds.length) {
    throw validation('Select at least one file to perform a bulk action');
  }

  const docs = await db.documentRecord.findMany({
    where: { id: { in: input.documentIds } },
    include: {
      employeeDocuments: { select: { employeeId: true } },
    },
  });
  if (docs.length === 0) {
    throw notFound('DocumentRecord', input.documentIds[0]);
  }

  // Enforce Privacy Legal Hold on DELETE
  if (input.action === 'DELETE') {
    const activeHolds = await db.privacyLegalHold.findMany({
      where: { status: 'ACTIVE' },
      select: { employeeId: true, holdReference: true },
    });
    const heldMap = new Map(activeHolds.map((h) => [h.employeeId, h.holdReference]));

    for (const doc of docs) {
      const empIds = [
        ...doc.employeeDocuments.map((ed) => ed.employeeId),
        ...parseJsonStringArray(doc.sharedEmployeeIdsJson),
      ];
      const holdRef = empIds.map((eid) => heldMap.get(eid)).find(Boolean);
      if (holdRef) {
        throw conflict(
          `Legal Hold block: File '${doc.fileName}' cannot be deleted while active PrivacyLegalHold (${holdRef}) applies.`,
        );
      }
    }
  }

  let affected = 0;
  const createdCopies: string[] = [];

  for (const doc of docs) {
    if (input.action === 'ARCHIVE') {
      await db.documentRecord.update({
        where: { id: doc.id },
        data: { isArchived: true, updatedById: auth.userId },
      });
      affected++;
    } else if (input.action === 'UNARCHIVE') {
      await db.documentRecord.update({
        where: { id: doc.id },
        data: { isArchived: false, updatedById: auth.userId },
      });
      affected++;
    } else if (input.action === 'MOVE') {
      await db.documentRecord.update({
        where: { id: doc.id },
        data: { folderId: input.targetFolderId ?? null, updatedById: auth.userId },
      });
      affected++;
    } else if (input.action === 'COPY') {
      const { buffer } = await readDocumentStreamBuffer(db, doc);
      const copyName = `Copy of ${doc.fileName}`;
      const stored = storeFile(buffer, copyName);
      const copyRec = await db.documentRecord.create({
        data: {
          fileName: copyName,
          description: doc.description,
          mimeType: doc.mimeType,
          fileSizeBytes: doc.fileSizeBytes,
          storageKey: stored.storageKey,
          storagePath: stored.storagePath,
          checksumSha256: stored.checksumSha256,
          category: doc.category,
          securityClassification: doc.securityClassification,
          uploadedById: auth.userId,
          updatedById: auth.userId,
          folderId: input.targetFolderId !== undefined ? input.targetFolderId : doc.folderId,
          expiryDate: doc.expiryDate,
          locationId: doc.locationId,
          departmentId: doc.departmentId,
          shareScope: doc.shareScope,
          sharedRoleKeysJson: doc.sharedRoleKeysJson,
          sharedDepartmentIdsJson: doc.sharedDepartmentIdsJson,
          sharedLocationIdsJson: doc.sharedLocationIdsJson,
          sharedEmployeeIdsJson: doc.sharedEmployeeIdsJson,
          lastAccessedAt: new Date(),
        },
      });
      createdCopies.push(copyRec.id);
      affected++;
    } else if (input.action === 'DELETE') {
      await db.hrTemplate.updateMany({ where: { documentId: doc.id }, data: { documentId: null } });
      await db.policyVersion.updateMany({ where: { documentId: doc.id }, data: { documentId: null } });
      await db.documentException.deleteMany({ where: { employeeDocument: { documentRecordId: doc.id } } });
      await db.employeeDocument.deleteMany({ where: { documentRecordId: doc.id } });
      if (localFileExists(doc.storageKey)) {
        purgeLocalFile(doc.storageKey);
      }
      await db.documentRecord.delete({ where: { id: doc.id } });
      affected++;
    }
  }

  await writeAudit(
    db,
    { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
    {
      action: `FILES_BULK_${input.action}`,
      targetType: 'DocumentRecord',
      targetId: input.documentIds[0],
      outcome: 'SUCCESS',
      after: { count: affected, documentIds: input.documentIds, targetFolderId: input.targetFolderId ?? null },
    },
  );

  return { action: input.action, affected, createdCopies };
}

function csvCell(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportFilesCsv(
  db: PrismaClient,
  auth: AuthActor,
  req: Request,
  query: FileFilterQuery,
) {
  const rows = await listUnifiedFiles(db, auth, query);
  const headers = [
    'Name',
    'Format',
    'Category',
    'Shared with',
    'Folder',
    'Updated on',
    'Expiry',
    'Access Status',
    'Storage Sync',
    'Size (Bytes)',
  ];
  const lines = [headers.map(csvCell).join(',')];

  for (const r of rows) {
    lines.push(
      [
        r.fileName,
        r.fileFormat,
        r.category,
        r.sharedWith,
        r.folderName,
        new Date(r.updatedAt).toISOString().slice(0, 10),
        r.expiryDate ? new Date(r.expiryDate).toISOString().slice(0, 10) : 'No Expiry',
        r.isArchived ? 'Archived' : 'Active',
        r.externalProvider,
        r.fileSizeBytes,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  await writeAudit(
    db,
    { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
    {
      action: 'FILES_EXPORT_CSV',
      targetType: 'DocumentRecord',
      outcome: 'SUCCESS',
      after: { rowCount: rows.length, tab: query.tab || 'org' },
    },
  );

  return {
    fileName: `ndakala_files_${query.tab || 'organization'}_${new Date().toISOString().slice(0, 10)}.csv`,
    rowCount: rows.length,
    csvContent: lines.join('\r\n'),
  };
}

export async function generateTemplatePdf(
  db: PrismaClient,
  auth: AuthActor,
  req: Request,
  templateId: string,
  input: {
    formValues: Record<string, string>;
    employeeId?: string | null;
    saveToVault?: boolean;
  },
) {
  const template = await db.hrTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw notFound('HrTemplate', templateId);

  const org = await db.organisation.findFirst();
  let targetEmp: any = null;
  if (input.employeeId) {
    targetEmp = await db.employee.findUnique({
      where: { id: input.employeeId },
      include: { department: true, position: true },
    });
  }

  const sections: Array<{ heading: string; body: string }> = [];
  if (template.bodyTemplate) {
    let rendered = template.bodyTemplate;
    for (const [key, val] of Object.entries(input.formValues || {})) {
      rendered = rendered.replaceAll(`{{${key}}}`, String(val || ''));
    }
    if (targetEmp) {
      rendered = rendered
        .replaceAll('{{employeeName}}', `${targetEmp.firstName} ${targetEmp.lastName}`)
        .replaceAll('{{employeeNumber}}', targetEmp.employeeNumber)
        .replaceAll('{{department}}', targetEmp.department?.name || 'Advisory')
        .replaceAll('{{position}}', targetEmp.position?.title || 'Staff');
    }
    sections.push({ heading: 'Document Content', body: rendered });
  }

  const fieldEntries = Object.entries(input.formValues || {}).filter(([, v]) => String(v || '').trim() !== '');
  if (fieldEntries.length > 0) {
    sections.push({
      heading: 'Submitted Form Fields (PostgreSQL Verified)',
      body: fieldEntries.map(([k, v]) => `${k}: ${v}`).join('\n'),
    });
  }

  const pdfBuffer = buildStructuredPdf({
    title: input.formValues?.documentTitle || template.name,
    subtitle: template.description,
    organizationName: org?.legalName || 'Ndakala Advisory LLP',
    referenceNumber: `NDK-FRM-${Date.now().toString().slice(-6)}`,
    generatedBy: `${auth.email}`,
    sections,
    footerNote:
      'Generated natively inside Ndakala HR Portal (Zero-Trust Backend Compiler). Recorded cleanly in immutable AuditLog; Word Online cloud editing disabled for PII protection.',
  });

  const safeSlug = (input.formValues?.documentTitle || template.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const fileName = `${safeSlug || 'hr_document'}_${new Date().toISOString().slice(0, 10)}.pdf`;

  const stored = storeFile(pdfBuffer, fileName);
  const category = targetEmp ? 'EMPLOYEE' : 'ORGANISATION';

  let templatesFolder = await db.documentFolder.findFirst({ where: { code: 'FOLDER-HR-TEMPLATES' } });
  if (!templatesFolder) {
    templatesFolder = await db.documentFolder.create({
      data: {
        code: 'FOLDER-HR-TEMPLATES',
        name: 'HR Forms & Templates',
        scope: 'ORG',
        description: 'Compiled HR Forms, Handbooks and Letters',
        createdById: auth.userId,
      },
    });
  }

  const doc = await db.documentRecord.create({
    data: {
      fileName,
      description: `Compiled from template: ${template.name}`,
      mimeType: 'application/pdf',
      fileSizeBytes: pdfBuffer.length,
      storageKey: stored.storageKey,
      storagePath: stored.storagePath,
      checksumSha256: stored.checksumSha256,
      category,
      securityClassification: targetEmp ? 'CONFIDENTIAL' : 'INTERNAL',
      uploadedById: auth.userId,
      updatedById: auth.userId,
      folderId: targetEmp ? null : templatesFolder.id,
      shareScope: targetEmp ? 'EMPLOYEE' : 'ORG',
      sharedEmployeeIdsJson: targetEmp ? JSON.stringify([targetEmp.id]) : null,
      lastAccessedAt: new Date(),
    },
  });

  if (targetEmp) {
    await db.employeeDocument.create({
      data: {
        employeeId: targetEmp.id,
        documentRecordId: doc.id,
        documentType: 'STATUTORY_FORM',
        visibility: 'HR_AND_EMPLOYEE',
        notes: fileName,
        uploadedById: auth.userId,
      },
    });
  }

  const spFolder = resolveSharePointFolderForCategory(
    targetEmp ? 'EMPLOYEE' : 'TEMPLATE',
    'HR Forms & Templates',
    targetEmp?.employeeNumber,
  );
  const spSync = await dualWriteToSharePointIfEnabled(db, doc.id, pdfBuffer, spFolder, fileName, 'application/pdf');

  await writeAudit(
    db,
    { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
    {
      action: 'HR_FORM_PDF_GENERATED',
      targetType: 'DocumentRecord',
      targetId: doc.id,
      outcome: 'SUCCESS',
      after: { templateCode: template.code, templateName: template.name, fileName, targetEmployeeId: targetEmp?.id || null },
    },
  );

  const downloadToken = generateSignedDownloadToken(doc.id, 300, auth.userId);
  return {
    documentId: doc.id,
    fileName,
    downloadToken,
    inlineUrl: `/api/v1/files/${doc.id}/inline?token=${downloadToken}`,
    downloadUrl: `/api/v1/documents/download?token=${downloadToken}`,
    sharepointSynced: Boolean(spSync),
  };
}
