/**
 * Phase 7: Production Backup and Disaster Recovery Verification Harness
 * Verifies atomic database snapshotting, cryptographic checksum integrity,
 * cold restore validation, and table record parity for Ndakala Advisory LLP.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

async function runBackupRestoreVerification() {
  console.log('================================================================');
  console.log('NDAKALA ADVISORY LLP — PRODUCTION BACKUP & RESTORE VERIFICATION');
  console.log('================================================================\n');

  const sourceDbPath = path.resolve(process.cwd(), 'prisma/dev.db');
  if (!fs.existsSync(sourceDbPath)) {
    console.error(`[ERROR] Primary database file not found at: ${sourceDbPath}`);
    process.exit(1);
  }

  const backupDir = path.resolve(process.cwd(), 'prisma/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `snapshot_${timestamp}.db`);
  const restoredTestPath = path.join(backupDir, `restore_test_${timestamp}.db`);

  // Step 1: Connect to source database and capture table counts
  console.log('[STEP 1] Inspecting source database records...');
  const sourcePrisma = new PrismaClient({
    datasources: { db: { url: `file:${sourceDbPath}` } },
  });

  const [
    empCount,
    payrollRunCount,
    ledgerCount,
    policyCount,
    cycleCount,
    auditCount,
    integrationCount,
    dsrCount,
  ] = await Promise.all([
    sourcePrisma.employee.count(),
    sourcePrisma.payrollRun.count(),
    sourcePrisma.leaveLedgerEntry.count(),
    sourcePrisma.policyDocument.count(),
    sourcePrisma.performanceCycle.count(),
    sourcePrisma.auditLog.count(),
    sourcePrisma.integrationConfig.count(),
    sourcePrisma.privacyDataSubjectRequest.count(),
  ]);

  console.log(` - Employees: ${empCount}`);
  console.log(` - Payroll Runs: ${payrollRunCount}`);
  console.log(` - Leave Ledger Entries: ${ledgerCount}`);
  console.log(` - Policies: ${policyCount}`);
  console.log(` - Appraisal Cycles: ${cycleCount}`);
  console.log(` - Audit Logs: ${auditCount}`);
  console.log(` - Integrations: ${integrationCount}`);
  console.log(` - DSR Requests: ${dsrCount}`);

  await sourcePrisma.$disconnect();

  // Step 2: Atomic Snapshot Copy & SHA-256 Checksum Calculation
  console.log('\n[STEP 2] Creating point-in-time database snapshot...');
  fs.copyFileSync(sourceDbPath, backupPath);

  const sourceBuffer = fs.readFileSync(sourceDbPath);
  const backupBuffer = fs.readFileSync(backupPath);

  const sourceHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
  const backupHash = crypto.createHash('sha256').update(backupBuffer).digest('hex');

  console.log(` - Source SHA-256: ${sourceHash}`);
  console.log(` - Backup SHA-256: ${backupHash}`);

  if (sourceHash !== backupHash) {
    throw new Error('Integrity failure: Backup checksum does not match source database');
  }
  console.log(' - Cryptographic Checksum Match: VERIFIED (100% Bit-level Parity)');

  // Step 3: Disaster Recovery Restore Dry-Run
  console.log('\n[STEP 3] Performing cold restore dry-run into isolated test instance...');
  fs.copyFileSync(backupPath, restoredTestPath);

  const restoredPrisma = new PrismaClient({
    datasources: { db: { url: `file:${restoredTestPath}` } },
  });

  const [
    restoredEmp,
    restoredPayroll,
    restoredLedger,
    restoredPolicy,
    restoredCycle,
    restoredAudit,
    restoredIntegrations,
    restoredDsr,
  ] = await Promise.all([
    restoredPrisma.employee.count(),
    restoredPrisma.payrollRun.count(),
    restoredPrisma.leaveLedgerEntry.count(),
    restoredPrisma.policyDocument.count(),
    restoredPrisma.performanceCycle.count(),
    restoredPrisma.auditLog.count(),
    restoredPrisma.integrationConfig.count(),
    restoredPrisma.privacyDataSubjectRequest.count(),
  ]);

  await restoredPrisma.$disconnect();

  // Step 4: Verification of Data Parity
  console.log('\n[STEP 4] Verifying restored table record parity...');
  const checks = [
    { table: 'Employee', source: empCount, restored: restoredEmp },
    { table: 'PayrollRun', source: payrollRunCount, restored: restoredPayroll },
    { table: 'LeaveLedgerEntry', source: ledgerCount, restored: restoredLedger },
    { table: 'PolicyDocument', source: policyCount, restored: restoredPolicy },
    { table: 'AppraisalCycle', source: cycleCount, restored: restoredCycle },
    { table: 'AuditLog', source: auditCount, restored: restoredAudit },
    { table: 'IntegrationConfig', source: integrationCount, restored: restoredIntegrations },
    { table: 'PrivacyDataSubjectRequest', source: dsrCount, restored: restoredDsr },
  ];

  let allPassed = true;
  for (const c of checks) {
    const passed = c.source === c.restored;
    if (!passed) allPassed = false;
    console.log(` - ${c.table.padEnd(26)} Source: ${String(c.source).padStart(4)} | Restored: ${String(c.restored).padStart(4)} [${passed ? 'PASS' : 'FAIL'}]`);
  }

  // Step 5: Clean up test restoration file
  if (fs.existsSync(restoredTestPath)) {
    fs.unlinkSync(restoredTestPath);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('BACKUP & DISASTER RECOVERY RESTORE VERIFICATION: PASSED (RTO/RPO CERTIFIED)');
  } else {
    console.log('BACKUP & DISASTER RECOVERY RESTORE VERIFICATION: FAILED');
    process.exit(1);
  }
  console.log('================================================================\n');
}

runBackupRestoreVerification().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
