import crypto from 'node:crypto';
import { decrypt } from '../../core/crypto/vault.js';
import { canAccessDocument, type EmployeeAccess } from './access.js';

const ENCRYPTED_FIELDS = [
  'nationalIdEncrypted',
  'kraPinEncrypted',
  'nssfNumberEncrypted',
  'shifNumberEncrypted',
  'bankNameEncrypted',
  'bankBranchEncrypted',
  'bankAccountNumberEncrypted',
] as const;

const PERSONAL_FIELDS = [
  'dateOfBirth',
  'gender',
  'personalEmail',
  'nextOfKinName',
  'nextOfKinPhone',
  'nextOfKinRelationship',
] as const;

/** Fields safe to return in list/search results. Sensitive data is never selected for lists. */
export const EMPLOYEE_LIST_SELECT = {
  id: true,
  employeeNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  preferredName: true,
  workEmail: true,
  status: true,
  isActive: true,
  profileCompletionStatus: true,
  departmentId: true,
  positionId: true,
  gradeId: true,
  locationId: true,
  managerId: true,
  createdAt: true,
  department: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, title: true, code: true } },
  grade: { select: { id: true, name: true, code: true, level: true } },
  location: { select: { id: true, name: true, code: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
} as const;

/** Keyed hash of a national ID for duplicate detection without storing plaintext. */
export function hashIdentifier(value: string): string {
  const secret = process.env.IDENTIFIER_HASH_SECRET || 'ndakala-identifier-hash-dev-secret-2026';
  return crypto.createHmac('sha256', secret).update(value.trim().toUpperCase()).digest('hex');
}

function maskTail(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '****' : `****${value.slice(-4)}`;
}

/**
 * Projects an employee record for a specific actor, applying field-level permissions.
 * - Encrypted columns and the identifier hash are never returned.
 * - Statutory identifiers and bank details are returned in a separate `sensitive` block:
 *   unmasked only for self or `employees.view_sensitive`; otherwise national ID is tail-masked
 *   and the remainder is RESTRICTED. Values are not even decrypted for unauthorised viewers.
 * - Personal fields (DOB, gender, personal email, next of kin) are hidden from team managers.
 * - Documents are filtered by per-document visibility.
 */
export function projectEmployee(employee: any, access: EmployeeAccess): any {
  if (!employee) return employee;
  const copy: any = { ...employee };

  const enc: Record<string, string | null> = {};
  for (const f of ENCRYPTED_FIELDS) {
    enc[f] = copy[f] ?? null;
    delete copy[f];
  }
  delete copy.nationalIdHash;

  if (access.canViewSensitive) {
    copy.sensitive = {
      masked: false,
      nationalId: decrypt(enc.nationalIdEncrypted),
      kraPin: decrypt(enc.kraPinEncrypted),
      nssfNumber: decrypt(enc.nssfNumberEncrypted),
      shifNumber: decrypt(enc.shifNumberEncrypted),
      bankName: decrypt(enc.bankNameEncrypted),
      bankBranch: decrypt(enc.bankBranchEncrypted),
      bankAccountNumber: decrypt(enc.bankAccountNumberEncrypted),
    };
  } else {
    copy.sensitive = {
      masked: true,
      nationalId: enc.nationalIdEncrypted ? maskTail(decrypt(enc.nationalIdEncrypted)) : null,
      kraPin: '[RESTRICTED]',
      nssfNumber: '[RESTRICTED]',
      shifNumber: '[RESTRICTED]',
      bankName: '[RESTRICTED]',
      bankBranch: '[RESTRICTED]',
      bankAccountNumber: '[RESTRICTED]',
    };
  }

  if (!access.canViewPersonal) {
    for (const f of PERSONAL_FIELDS) delete copy[f];
  }

  if (Array.isArray(copy.documents)) {
    copy.documents = copy.documents.filter((d: any) => canAccessDocument(access, d.visibility));
  }

  // Remuneration references are HR/payroll only
  if (Array.isArray(copy.agreements) && !access.canViewSensitive) {
    copy.agreements = copy.agreements.map((a: any) => ({ ...a, remunerationReference: a.remunerationReference ? '[RESTRICTED]' : null }));
  }

  return copy;
}
