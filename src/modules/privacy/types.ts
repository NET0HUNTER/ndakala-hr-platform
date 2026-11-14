/**
 * Phase 7: Privacy, Data Protection & Data Subject Rights (DSR) Types
 * Compliant with Kenya Data Protection Act 2019 & GDPR Article 25 (Privacy by Design)
 */

export type DSRRequestType = 'ACCESS' | 'RECTIFICATION' | 'ERASURE' | 'OBJECTION' | 'PORTABILITY';

export type DSRStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'FULFILLED';

export type LegalHoldCategory = 'LITIGATION' | 'ER_INVESTIGATION' | 'TAX_AUDIT' | 'REGULATORY';

export type LegalHoldStatus = 'ACTIVE' | 'RELEASED';

export interface SubmitDSRInput {
  employeeId: string;
  requestType: DSRRequestType;
  lawfulJustification: string;
  details?: string;
  requesterEmail: string;
}

export interface ReviewDSRInput {
  requestId: string;
  action: 'APPROVE' | 'REJECT' | 'FULFILL';
  rejectionReason?: string;
  details?: string;
  handlerUserId: string;
}

export interface ApplyLegalHoldInput {
  employeeId: string;
  matterTitle: string;
  reasonCategory: LegalHoldCategory;
  notes?: string;
}

export interface ReleaseLegalHoldInput {
  holdId: string;
  notes?: string;
}

export interface DPIARecord {
  processingActivity: string;
  lawfulBasis: string;
  dataCategories: string[];
  sensitiveDataCategories: string[];
  dataMinimisationSafeguards: string;
  retentionPeriod: string;
  crossBorderTransfers: string;
  residualRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface EmployeeDataPortabilityPackage {
  metadata: {
    exportId: string;
    exportedAt: string;
    employeeNumber: string;
    workEmail: string;
    jurisdiction: string;
    lawfulBasis: string;
    redactionNotice: string;
  };
  personalProfile: {
    fullName: string;
    personalEmail?: string;
    phoneNumber?: string;
    residentialAddress?: string;
    emergencyContact?: string;
    dateOfBirth?: string;
    nationality?: string;
  };
  employmentHistory: Array<{
    jobTitle: string;
    department: string;
    employmentType: string;
    startDate: string;
    endDate?: string | null;
    status: string;
  }>;
  leaveSummary: {
    leaveLedgerEntriesCount: number;
    approvedLeaveDaysTaken: number;
    currentAnnualBalance: number;
  };
  trainingAndCertifications: Array<{
    programmeCode: string;
    programmeName: string;
    completedAt?: string | null;
    passed?: boolean;
    certificateNumber?: string | null;
  }>;
  performanceAppraisals: Array<{
    cycleName: string;
    period: string;
    rating?: string | number | null;
    employeeComments?: string | null;
    managerComments?: string | null;
  }>;
  remunerationSummary: {
    payFrequency: string;
    currency: string;
    recordedPayslipsCount: number;
    statutoryDeductionsComplied: string[];
  };
}
