import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { calculateWorkingDays } from '../src/modules/leave/calculator.js';

describe('Leave Management, Ledger Invariants & Work Arrangements (Phase 3)', () => {
  const app = getApp();

  let hrClient: Awaited<ReturnType<typeof loginClient>>;
  let opsClient: Awaited<ReturnType<typeof loginClient>>;
  let managerClient: Awaited<ReturnType<typeof loginClient>>;
  let employeeClient: Awaited<ReturnType<typeof loginClient>>;
  let auditorClient: Awaited<ReturnType<typeof loginClient>>;

  let testEmployeeId: string;
  let annualLeaveTypeId: string;
  let sickLeaveTypeId: string;

  async function cleanupLeaveTestData() {
    await prisma.absenceRecord.deleteMany();
    await prisma.leaveReservation.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.leaveLedgerEntry.deleteMany();
    await prisma.leaveBalance.deleteMany();
    await prisma.leaveType.deleteMany({ where: { code: { in: ['SUB_STATUTORY', 'TEST_CUSTOM_LEAVE'] } } });
    const mgr = await prisma.employee.findUnique({ where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' } });
    if (mgr) {
      await prisma.employee.updateMany({
        where: { workEmail: 'employee.one@ndakalaadvisory.co.ke' },
        data: { managerId: mgr.id, status: 'ACTIVE', isActive: true },
      });
    }
  }

  beforeAll(async () => {
    await seedDatabase(prisma);
    await cleanupLeaveTestData();

    hrClient = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    opsClient = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    managerClient = await loginClient(app, 'line.manager@ndakalaadvisory.co.ke');
    employeeClient = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    auditorClient = await loginClient(app, 'auditor@ndakalaadvisory.co.ke');

    const emp = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'employee.one@ndakalaadvisory.co.ke' },
    });
    testEmployeeId = emp.id;

    const annualType = await prisma.leaveType.findUniqueOrThrow({ where: { code: 'ANNUAL' } });
    const sickType = await prisma.leaveType.findUniqueOrThrow({ where: { code: 'SICK' } });
    annualLeaveTypeId = annualType.id;
    sickLeaveTypeId = sickType.id;
  });

  afterAll(async () => {
    await cleanupLeaveTestData();
  });

  // -------------------------------------------------------------------------
  // 1. Working-Day Calculation Engine
  // -------------------------------------------------------------------------
  describe('Working-Day Calculation Engine', () => {
    const stdMonFriSchedule = {
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      restDays: ['Saturday', 'Sunday'],
    };

    const stdMonSatSchedule = {
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      restDays: ['Sunday'],
    };

    it('correctly deducts rest days on standard 5-day week vs 6-day week', () => {
      // 2026-06-08 (Mon) to 2026-06-14 (Sun) = 7 calendar days
      // Mon-Fri schedule: 5 working days, 2 rest days
      const calc5Day = calculateWorkingDays('2026-06-08', '2026-06-14', stdMonFriSchedule, []);
      expect(calc5Day.calendarDays).toBe(7);
      expect(calc5Day.restDaysExcluded).toBe(2); // Sat & Sun
      expect(calc5Day.holidaysExcluded).toBe(0);
      expect(calc5Day.netWorkingDays).toBe(5.0);

      // Mon-Sat schedule: 6 working days, 1 rest day
      const calc6Day = calculateWorkingDays('2026-06-08', '2026-06-14', stdMonSatSchedule, []);
      expect(calc6Day.calendarDays).toBe(7);
      expect(calc6Day.restDaysExcluded).toBe(1); // Sun only
      expect(calc6Day.netWorkingDays).toBe(6.0);
    });

    it('excludes gazetted Kenya public holidays from working day deductions', () => {
      // 2026-05-01 is Labour Day (Friday)
      // Range: 2026-04-30 (Thursday) to 2026-05-04 (Monday) = 5 calendar days
      // Dates: Thu 30th (work), Fri 1st (Holiday: Labour Day), Sat 2nd (Rest), Sun 3rd (Rest), Mon 4th (work)
      const holidays = [{ date: new Date('2026-05-01'), name: 'Labour Day' }];
      const calc = calculateWorkingDays('2026-04-30', '2026-05-04', stdMonFriSchedule, holidays);

      expect(calc.calendarDays).toBe(5);
      expect(calc.restDaysExcluded).toBe(2);
      expect(calc.holidaysExcluded).toBe(1);
      expect(calc.netWorkingDays).toBe(2.0); // Only Thursday and Monday
    });

    it('accurately computes single half-day requests (0.5 working day)', () => {
      const calcHalf = calculateWorkingDays(
        '2026-06-10',
        '2026-06-10',
        stdMonFriSchedule,
        [],
        true,
        'MORNING',
      );
      expect(calcHalf.calendarDays).toBe(1);
      expect(calcHalf.netWorkingDays).toBe(0.5);
    });

    it('correctly handles cross-year boundaries and leap years', () => {
      // Leap year test: 2028 is a leap year; 2028-02-28 (Mon) to 2028-03-01 (Wed) = 3 working days (Feb 29th included)
      const calcLeap = calculateWorkingDays('2028-02-28', '2028-03-01', stdMonFriSchedule, []);
      expect(calcLeap.calendarDays).toBe(3);
      expect(calcLeap.netWorkingDays).toBe(3.0);
      expect(calcLeap.breakdown.some((d) => d.date === '2028-02-29')).toBe(true);

      // Cross-year test: 2026-12-30 (Wed) to 2027-01-04 (Mon) with New Year's Day (2027-01-01 Fri)
      const holidays = [{ date: new Date('2027-01-01'), name: "New Year's Day" }];
      const calcCrossYear = calculateWorkingDays('2026-12-30', '2027-01-04', stdMonFriSchedule, holidays);
      expect(calcCrossYear.calendarDays).toBe(6);
      expect(calcCrossYear.holidaysExcluded).toBe(1); // Jan 1st
      expect(calcCrossYear.restDaysExcluded).toBe(2); // Jan 2nd (Sat), Jan 3rd (Sun)
      expect(calcCrossYear.netWorkingDays).toBe(3.0); // Dec 30 (Wed), Dec 31 (Thu), Jan 4 (Mon)
    });
  });

  // -------------------------------------------------------------------------
  // 2. Leave Configuration & Statutory Floor Guardrails
  // -------------------------------------------------------------------------
  describe('Leave Configuration & Statutory Floor Guardrails', () => {
    it('blocks configuration of leave types that attempt to reduce Kenya statutory floor', async () => {
      // Kenya Employment Act 2007: Annual leave statutory floor is 21 working days
      // Attempting to configure defaultEntitlementDays = 15 while statutoryFloor = 21 -> 400
      const res = await hrClient.agent
        .post('/api/v1/leave/types')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          code: 'SUB_STATUTORY',
          name: 'Sub-Statutory Annual Leave',
          statutoryFloorDays: 21.0,
          defaultEntitlementDays: 15.0, // Illegal reduction below statutory floor
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Statutory floor violation');
    });

    it('enforces Maker-Checker on leave type activation (author cannot activate own draft)', async () => {
      // Ops Director drafts a custom leave type
      const draftRes = await opsClient.agent
        .post('/api/v1/leave/types')
        .set('x-csrf-token', opsClient.csrfToken)
        .send({
          code: 'TEST_CUSTOM_LEAVE',
          name: 'Custom Research Fellowship Leave',
          category: 'COMPANY_ENHANCED',
          defaultEntitlementDays: 10.0,
          accrualMethod: 'NONE',
        });
      expect(draftRes.status).toBe(201);
      const leaveTypeId = draftRes.body.data.id;
      expect(draftRes.body.data.isActive).toBe(false);

      // Ops Director attempts self-activation -> 403 Forbidden Maker-Checker violation
      const selfActRes = await opsClient.agent
        .post(`/api/v1/leave/types/${leaveTypeId}/activate`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send();
      expect(selfActRes.status).toBe(403);
      expect(selfActRes.body.error.message).toContain('Maker-Checker violation');

      // Managing Partner (different user with config.approve) activates -> 200 OK
      const mpClient = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
      const mpActRes = await mpClient.agent
        .post(`/api/v1/leave/types/${leaveTypeId}/activate`)
        .set('x-csrf-token', mpClient.csrfToken)
        .send();
      expect(mpActRes.status).toBe(200);
      expect(mpActRes.body.data.isActive).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Authoritative Leave Ledger Invariants, Adjustments & Reconciliations
  // -------------------------------------------------------------------------
  describe('Authoritative Leave Ledger Invariants & Reconciliations', () => {
    it('posts opening balance and accrual entries, asserting immutable running balances', async () => {
      // 1. Post Opening Balance: +10.0 days
      const openRes = await hrClient.agent
        .post('/api/v1/leave/adjustments')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          leaveTypeId: annualLeaveTypeId,
          leaveYear: 2026,
          amountDays: 10.0,
          reason: 'Initial opening balance for test year 2026',
        });
      expect(openRes.status).toBe(200);
      expect(openRes.body.data.entry.runningBalanceDays).toBe(10.0);
      expect(openRes.body.data.balance.closingBalanceDays).toBe(10.0);

      // 2. Post Monthly Accrual: +1.75 days (statutory monthly rate for annual leave)
      const accrualRes = await hrClient.agent
        .post('/api/v1/leave/adjustments')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          leaveTypeId: annualLeaveTypeId,
          leaveYear: 2026,
          amountDays: 1.75,
          reason: 'January 2026 monthly accrual',
        });
      expect(accrualRes.status).toBe(200);
      expect(accrualRes.body.data.entry.runningBalanceDays).toBe(11.75);
      expect(accrualRes.body.data.balance.closingBalanceDays).toBe(11.75);

      // 3. Verify balance reconciliation report is 100% in agreement with ledger sums
      const recRes = await hrClient.agent
        .post('/api/v1/leave/reconcile')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          leaveYear: 2026,
          leaveTypeId: annualLeaveTypeId,
        });
      expect(recRes.status).toBe(200);
      expect(recRes.body.data[0].isReconciled).toBe(true);
      expect(recRes.body.data[0].ledgerSum).toBe(11.75);
      expect(recRes.body.data[0].projectedClosingBalance).toBe(11.75);
      expect(recRes.body.data[0].difference).toBe(0);
    });

    it('rejects deductions that exceed available balance when negative balance is prohibited', async () => {
      // Current balance is 11.75. Attempting to deduct 20.0 days -> 400 Validation Error
      const res = await hrClient.agent
        .post('/api/v1/leave/adjustments')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          leaveTypeId: annualLeaveTypeId,
          leaveYear: 2026,
          amountDays: -20.0,
          reason: 'Excessive deduction exceeding balance',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Leave ledger policy violation: Insufficient balance');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Leave Request Lifecycle, Handover, Reservations & Concurrent Safety
  // -------------------------------------------------------------------------
  describe('Leave Request Lifecycle, Handover & Concurrency', () => {
    let activeRequestId: string;

    it('submits leave request with working day calculation, handover colleague and balance reservation', async () => {
      const manager = await prisma.employee.findUniqueOrThrow({
        where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
      });

      // Submit request: 2026-12-07 (Mon) to 2026-12-09 (Wed) = 3 working days
      // Notice: >14 days in advance from Nov 12, 2026. Handover: manager.id
      const res = await employeeClient.agent
        .post('/api/v1/leave/requests')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          leaveTypeCode: 'ANNUAL',
          startDate: '2026-12-07',
          endDate: '2026-12-09',
          handoverEmployeeId: manager.id,
          handoverNotes: 'Cover client inquiries for advisory practice',
          reason: 'Family summer holiday',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.request.requestNumber).toMatch(/^LV-2026-\d{4}$/);
      expect(res.body.data.request.status).toBe('PENDING_APPROVAL');
      expect(res.body.data.calculation.netWorkingDays).toBe(3.0);

      activeRequestId = res.body.data.request.id;

      // Verify that LeaveBalance.pendingReservedDays is now 3.0
      const bal = await prisma.leaveBalance.findUniqueOrThrow({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: testEmployeeId,
            leaveTypeId: annualLeaveTypeId,
            leaveYear: 2026,
          },
        },
      });
      expect(bal.pendingReservedDays).toBe(3.0);
      // Available balance is closingBalance (11.75) - pendingReserved (3.0) = 8.75 days
      expect(bal.closingBalanceDays - bal.pendingReservedDays).toBe(8.75);
    });

    it('rejects overlapping leave requests submitted for the same employee', async () => {
      const manager = await prisma.employee.findUniqueOrThrow({
        where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
      });

      // Attempt overlapping request: 2026-12-08 to 2026-12-10 (overlaps 12-08 and 12-09) -> 409 Conflict
      const overlapRes = await employeeClient.agent
        .post('/api/v1/leave/requests')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          leaveTypeCode: 'ANNUAL',
          startDate: '2026-12-08',
          endDate: '2026-12-10',
          handoverEmployeeId: manager.id,
        });

      expect(overlapRes.status).toBe(409);
      expect(overlapRes.body.error.message).toContain('Leave request overlaps an existing PENDING_APPROVAL');
    });

    it('enforces self-approval prevention: applicant CANNOT approve their own leave request', async () => {
      // Employee attempts to review their own request -> 403 Forbidden
      const selfApproveRes = await employeeClient.agent
        .post(`/api/v1/leave/requests/${activeRequestId}/review`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          decision: 'APPROVE',
          comments: 'Self-approving my own request',
        });

      expect(selfApproveRes.status).toBe(403);
    });

    it('approves leave request atomically: commits reservation and debits authoritative ledger', async () => {
      // Line Manager approves the request
      const approveRes = await managerClient.agent
        .post(`/api/v1/leave/requests/${activeRequestId}/review`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          decision: 'APPROVE',
          comments: 'Handover verified and approved',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.request.status).toBe('APPROVED');
      expect(approveRes.body.data.ledgerEntry.entryType).toBe('LEAVE_TAKEN');
      expect(approveRes.body.data.ledgerEntry.amountDays).toBe(-3.0);

      // Verify balance:
      // pendingReservedDays decremented back to 0
      // takenDays incremented by 3.0
      // closingBalanceDays decremented from 11.75 to 8.75
      const bal = await prisma.leaveBalance.findUniqueOrThrow({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: testEmployeeId,
            leaveTypeId: annualLeaveTypeId,
            leaveYear: 2026,
          },
        },
      });
      expect(bal.pendingReservedDays).toBe(0);
      expect(bal.takenDays).toBe(3.0);
      expect(bal.closingBalanceDays).toBe(8.75);

      // Verify reservation status is COMMITTED_TO_LEDGER
      const resv = await prisma.leaveReservation.findFirst({
        where: { leaveRequestId: activeRequestId },
      });
      expect(resv?.status).toBe('COMMITTED_TO_LEDGER');
    });

    it('cancels approved leave and posts reversal entry to the immutable ledger', async () => {
      // HR cancels approved leave
      const cancelRes = await hrClient.agent
        .post(`/api/v1/leave/requests/${activeRequestId}/cancel`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          reason: 'Client audit engagement brought forward; holiday postponed',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.request.status).toBe('CANCELLED');
      expect(cancelRes.body.data.reversalEntry.entryType).toBe('REVERSAL');
      expect(cancelRes.body.data.reversalEntry.amountDays).toBe(3.0); // Credit back 3.0 days

      // Closing balance restored to 11.75
      const bal = await prisma.leaveBalance.findUniqueOrThrow({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: testEmployeeId,
            leaveTypeId: annualLeaveTypeId,
            leaveYear: 2026,
          },
        },
      });
      expect(bal.closingBalanceDays).toBe(11.75);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Privacy, Redaction & Team Calendar
  // -------------------------------------------------------------------------
  describe('Privacy & Evidence Protection', () => {
    it('redacts confidential leave reason from team calendar when viewed by manager/peers', async () => {
      const manager = await prisma.employee.findUniqueOrThrow({
        where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
      });

      // Employee submits request with confidential personal reason
      const subRes = await employeeClient.agent
        .post('/api/v1/leave/requests')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          leaveTypeCode: 'ANNUAL',
          startDate: '2026-12-14',
          endDate: '2026-12-16',
          handoverEmployeeId: manager.id,
          reason: 'Confidential personal family matter requiring privacy',
        });
      expect(subRes.status).toBe(201);
      const reqId = subRes.body.data.request.id;

      // 1. Employee sees their own reason
      const ownView = await employeeClient.agent.get('/api/v1/leave/requests');
      const ownReq = ownView.body.data.find((r: any) => r.id === reqId);
      expect(ownReq.reason).toBe('Confidential personal family matter requiring privacy');

      // 2. Line Manager views team calendar -> reason is redacted/undefined
      const teamView = await managerClient.agent.get('/api/v1/leave/requests?teamOnly=true');
      const teamReq = teamView.body.data.find((r: any) => r.id === reqId);
      expect(teamReq).toBeDefined();
      expect(teamReq.reason).toBeUndefined(); // Redacted for team privacy

      // Clean up request
      await employeeClient.agent
        .post(`/api/v1/leave/requests/${reqId}/withdraw`)
        .set('x-csrf-token', employeeClient.csrfToken);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Unexpected Absence & Retrospective Follow-up (D-11)
  // -------------------------------------------------------------------------
  describe('Unexpected Absence Tracking (D-11)', () => {
    it('records unexpected absence without automated misconduct or automatic termination', async () => {
      // Employee calls in sick
      const res = await employeeClient.agent
        .post('/api/v1/absences')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          startDate: '2026-06-15',
          reasonCategory: 'SICKNESS',
          contactChannel: 'PHONE',
          notes: 'Down with severe influenza; doctor visit scheduled',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('RECORDED');

      // Verify that employee status remains intact (ACTIVE) and is NOT terminated or sanctioned
      const emp = await prisma.employee.findUniqueOrThrow({ where: { id: testEmployeeId } });
      expect(emp.status).toBe('ACTIVE');
      expect(emp.isActive).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Evidence Upload/Download, Return/Resubmit & Absence Review E2E
  // -------------------------------------------------------------------------
  describe('Evidence Upload, Return/Resubmit, Manager Visibility & Absence Review', () => {
    it('enforces evidence on SICK leave, allows employee PDF upload & signed HR download', async () => {
      // 1. SICK leave without evidenceDocumentId is rejected (400)
      const missingEv = await employeeClient.agent
        .post('/api/v1/leave/requests')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          leaveTypeCode: 'SICK',
          startDate: '2026-07-06',
          endDate: '2026-07-06',
          isHalfDay: true,
          halfDayType: 'MORNING',
          handoverNotes: 'Doctor visit in the morning',
        });
      expect(missingEv.status).toBe(400);
      expect(missingEv.body.error.message).toContain('requires supporting');

      // 2. Employee uploads medical certificate PDF via /api/v1/leave/evidence
      const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
      const upRes = await employeeClient.agent
        .post('/api/v1/leave/evidence')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          fileName: 'medical-note.pdf',
          mimeType: 'application/pdf',
          evidenceType: 'MEDICAL',
          fileBase64: pdfBytes.toString('base64'),
        });
      expect(upRes.status).toBe(201);
      expect(upRes.body.data.documentRecordId).toBeDefined();

      // 3. Submit half-day SICK leave with evidence attached
      const subRes = await employeeClient.agent
        .post('/api/v1/leave/requests')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          leaveTypeCode: 'SICK',
          startDate: '2026-07-06',
          endDate: '2026-07-06',
          isHalfDay: true,
          halfDayType: 'MORNING',
          handoverNotes: 'Half-day medical recovery',
          evidenceDocumentId: upRes.body.data.documentRecordId,
        });
      expect(subRes.status).toBe(201);
      expect(subRes.body.data.calculation.netWorkingDays).toBe(0.5);
      const sickReqId = subRes.body.data.request.id;

      // 4. HR generates signed token & downloads PDF (while ordinary manager cannot access MEDICAL evidence)
      const mgrTokenRes = await managerClient.agent
        .post(`/api/v1/leave/requests/${sickReqId}/evidence-token`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send();
      expect(mgrTokenRes.status).toBe(403);

      const hrTokenRes = await hrClient.agent
        .post(`/api/v1/leave/requests/${sickReqId}/evidence-token`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send();
      expect(hrTokenRes.status).toBe(200);
      expect(hrTokenRes.body.data.fileName).toBe('medical-note.pdf');

      const dlRes = await hrClient.agent.get(hrTokenRes.body.data.downloadUrl);
      expect(dlRes.status).toBe(200);

      // Cleanup
      await employeeClient.agent
        .post(`/api/v1/leave/requests/${sickReqId}/withdraw`)
        .set('x-csrf-token', employeeClient.csrfToken);
    });

    it('supports Line Manager visibility, RETURN -> resubmit -> APPROVE, and Absence review', async () => {
      // 1. Employee submits ANNUAL leave
      const subRes = await employeeClient.agent
        .post('/api/v1/leave/requests')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          leaveTypeCode: 'ANNUAL',
          startDate: '2026-08-03',
          endDate: '2026-08-05',
          handoverNotes: 'Planned break',
        });
      expect(subRes.status).toBe(201);
      const reqId = subRes.body.data.request.id;

      // 2. Line Manager sees report's request in default /api/v1/leave/requests list (no teamOnly query needed)
      const mgrList = await managerClient.agent.get('/api/v1/leave/requests');
      expect(mgrList.status).toBe(200);
      expect(mgrList.body.data.some((r: any) => r.id === reqId)).toBe(true);

      // 3. Line Manager returns request for edit
      const retRes = await managerClient.agent
        .post(`/api/v1/leave/requests/${reqId}/review`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({ decision: 'RETURN', comments: 'Please add handover colleague details' });
      expect(retRes.status).toBe(200);
      expect(retRes.body.data.request.status).toBe('RETURNED_FOR_EDIT');

      // 4. Employee revises dates & resubmits
      const resubRes = await employeeClient.agent
        .post(`/api/v1/leave/requests/${reqId}/resubmit`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          startDate: '2026-08-04',
          endDate: '2026-08-05',
          handoverNotes: 'Handover assigned to colleague; 2 days only',
        });
      expect(resubRes.status).toBe(200);
      expect(resubRes.body.data.request.status).toBe('PENDING_APPROVAL');
      expect(resubRes.body.data.calculation.netWorkingDays).toBe(2);

      // 5. Manager approves resubmitted request
      const appRes = await managerClient.agent
        .post(`/api/v1/leave/requests/${reqId}/review`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({ decision: 'APPROVE', comments: 'Approved after update' });
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.request.status).toBe('APPROVED');

      // 6. Log & review unexpected absence -> EXCUSED
      const absRes = await employeeClient.agent
        .post('/api/v1/absences')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          startDate: '2026-08-10',
          reasonCategory: 'FAMILY_EMERGENCY',
          contactChannel: 'WHATSAPP',
          notes: 'Family emergency in the morning',
        });
      expect(absRes.status).toBe(201);
      const revAbs = await managerClient.agent
        .post(`/api/v1/absences/${absRes.body.data.id}/review`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({ status: 'EXCUSED', notes: 'Approved by line manager' });
      expect(revAbs.status).toBe(200);
      expect(revAbs.body.data.status).toBe('EXCUSED');
    });
  });
});
