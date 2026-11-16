import type { PrismaClient } from '@prisma/client';
import { writeAudit } from '../../core/audit/audit.js';
import { localFileExists, purgeLocalFile } from '../../core/storage/storage.js';
import { getActiveM365Config, verifySharePointItem } from './client.js';
import type { ColdArchiveReport } from './types.js';

/**
 * Cold Storage Archival Sweep (Default 6 Months / Configurable):
 * Safely offloads cold or archived files from the local VPS encrypted vault,
 * leaving SharePoint Online as the sole long-term master archive ONLY IF:
 *  1. The file already holds a verified SharePoint item reference (sharepointItemId + sharepointDriveId)
 *  2. Live Graph API check confirms remote item exists and matches byte size / SHA-256
 *  3. No ACTIVE PrivacyLegalHold blocks disposal/purging of that employee's records
 */
export async function runColdStorageArchival(
  db: PrismaClient,
  actorId: string,
  options: { overrideMonths?: number; force?: boolean } = {},
): Promise<ColdArchiveReport> {
  const org = await db.organisation.findFirst();
  const months = options.overrideMonths ?? org?.coldArchiveMonths ?? 6;
  const enabled = options.force || Boolean(org?.coldArchiveEnabled);

  const report: ColdArchiveReport = {
    checkedCount: 0,
    archivedCount: 0,
    skippedLegalHoldCount: 0,
    skippedNoRemoteCount: 0,
    skippedRemoteMismatchCount: 0,
    archivedDocumentIds: [],
    details: [],
  };

  if (!enabled) {
    return report;
  }

  const m365Config = await getActiveM365Config(db);
  if (!m365Config) {
    return report;
  }

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - Math.max(1, months));

  const candidates = await db.documentRecord.findMany({
    where: {
      localStoragePurged: false,
      OR: [
        { isArchived: true },
        { lastAccessedAt: { lt: cutoffDate } },
        { AND: [{ lastAccessedAt: null }, { createdAt: { lt: cutoffDate } }] },
      ],
    },
    include: {
      employeeDocuments: { select: { employeeId: true } },
    },
    take: 200,
  });

  // Load active legal holds once
  const activeHolds = await db.privacyLegalHold.findMany({
    where: { status: 'ACTIVE' },
    select: { employeeId: true, holdReference: true },
  });
  const heldEmployeeMap = new Map(activeHolds.map((h) => [h.employeeId, h.holdReference]));

  for (const doc of candidates) {
    report.checkedCount += 1;

    // 1. Check active legal holds linked to this document
    const linkedEmployees = doc.employeeDocuments.map((ed) => ed.employeeId);
    if (doc.sharedEmployeeIdsJson) {
      try {
        const extraIds = JSON.parse(doc.sharedEmployeeIdsJson);
        if (Array.isArray(extraIds)) {
          for (const id of extraIds) linkedEmployees.push(String(id));
        }
      } catch {
        // ignore invalid json
      }
    }
    const blockingHoldRef = linkedEmployees.map((empId) => heldEmployeeMap.get(empId)).find(Boolean);
    if (blockingHoldRef) {
      report.skippedLegalHoldCount += 1;
      report.details.push({
        documentId: doc.id,
        fileName: doc.fileName,
        status: 'SKIPPED_LEGAL_HOLD',
        reason: `Blocked by active PrivacyLegalHold ${blockingHoldRef}`,
      });
      continue;
    }

    // 2. Ensure remote SharePoint metadata exists
    if (!doc.sharepointItemId || !doc.sharepointDriveId) {
      report.skippedNoRemoteCount += 1;
      report.details.push({
        documentId: doc.id,
        fileName: doc.fileName,
        status: 'SKIPPED_NO_SHAREPOINT',
        reason: 'Missing SharePoint remote item reference; local copy retained for safety',
      });
      continue;
    }

    // 3. Live Graph API verification of remote master file
    try {
      const verify = await verifySharePointItem(
        m365Config,
        doc.sharepointDriveId,
        doc.sharepointItemId,
        doc.fileSizeBytes,
        doc.checksumSha256,
      );
      if (!verify.exists || !verify.sizeMatch || !verify.checksumMatch) {
        report.skippedRemoteMismatchCount += 1;
        report.details.push({
          documentId: doc.id,
          fileName: doc.fileName,
          status: 'SKIPPED_VERIFICATION_FAILED',
          reason: verify.reason || 'Remote SharePoint verification mismatch',
        });
        continue;
      }

      if (localFileExists(doc.storageKey)) {
        purgeLocalFile(doc.storageKey);
      }

      await db.documentRecord.update({
        where: { id: doc.id },
        data: {
          localStoragePurged: true,
          localPurgedAt: new Date(),
          externalProvider: 'SHAREPOINT_ARCHIVE',
        },
      });

      await writeAudit(
        db,
        { userId: actorId },
        {
          action: 'COLD_ARCHIVE_LOCAL_PURGED',
          targetType: 'DocumentRecord',
          targetId: doc.id,
          outcome: 'SUCCESS',
          reason: `Cold archival > ${months} months verified against SharePoint item ${doc.sharepointItemId}`,
          after: {
            localStoragePurged: true,
            sharepointItemId: doc.sharepointItemId,
            externalProvider: 'SHAREPOINT_ARCHIVE',
          },
        },
      );

      report.archivedCount += 1;
      report.archivedDocumentIds.push(doc.id);
      report.details.push({
        documentId: doc.id,
        fileName: doc.fileName,
        status: 'PURGED_LOCAL',
        reason: `Archived to SharePoint master ${doc.sharepointItemId}`,
      });
    } catch (err: any) {
      report.details.push({
        documentId: doc.id,
        fileName: doc.fileName,
        status: 'ERROR',
        reason: err?.message || 'Unexpected error during cold archive check',
      });
    }
  }

  return report;
}
