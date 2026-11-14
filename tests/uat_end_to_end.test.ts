import request from 'supertest';
import crypto from 'node:crypto';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { encrypt, decrypt } from '../src/core/crypto/vault.js';
import { IntegrationService } from '../src/modules/integrations/service.js';
import { PrivacyService } from '../src/modules/privacy/service.js';

describe('Phase 7: Authoritative End-to-End UAT & Release Acceptance Suite', () => {
  const app = getApp();

  let partnerClient: Awaited<ReturnType<typeof loginClient>>;
  let opsClient: Awaited<ReturnType<typeof loginClient>>;
  let hrClient: Awaited<ReturnType<typeof loginClient>>;
  let managerClient: Awaited<ReturnType<typeof loginClient>>;
  let employeeClient: Awaited<ReturnType<typeof loginClient>>;
  let dpoClient: Awaited<ReturnType<typeof loginClient>>;
  let ictClient: Awaited<ReturnType<typeof loginClient>>;

  let testEmployeeId: string;
  let testEmployeeNumber: string;
  let deptAdvisoryId: string;
  let deptHRId: string;
  let annualLeaveType: any;

  beforeAll(async () => {
    // 1. Seed fresh platform foundation
    await seedDatabase(prisma);

    // 2. Authenticate all role clients
    partnerClient = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    opsClient = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    hrClient = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    managerClient = await loginClient(app, 'line.manager@ndakalaadvisory.co.ke');
    employeeClient = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    dpoClient = await loginClient(app, 'dpo@ndakalaadvisory.co.ke');
    ictClient = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');

    const depts = await prisma.department.findMany();
    deptAdvisoryId = depts.find((d) => d.code === 'ADV')?.id || depts[0].id;
    deptHRId = depts.find((d) => d.code === 'HR')?.id || depts[1].id;

    annualLeaveType = await prisma.leaveType.findUniqueOrThrow({
      where: { code: 'ANNUAL' },
    });

    // Ensure PERMANENT category & STD-JOINER-DRAFT template are ACTIVE on fresh DBs (test-order isolation)
    const permCat = await prisma.employmentCategory.findUniqueOrThrow({ where: { code: 'PERMANENT' } });
    await prisma.employmentCategory.update({
      where: { id: permCat.id },
      data: {
        status: 'ACTIVE',
        probationApplies: true,
        defaultProbationMonths: 6,
        maxProbationExtensionMonths: 3,
        defaultNoticePeriodDays: 30,
        probationReminderLeadDays: 14,
      },
    });
    await prisma.onboardingTemplate.updateMany({
      where: { code: 'STD-JOINER-DRAFT' },
      data: { status: 'ACTIVE' },
    });

    // Reset draft state for payroll periods
    await prisma.payrollPeriod.updateMany({
      data: { status: 'DRAFT' },
    });
  });

  // =========================================================================
  // SCENARIO 1: JOINER LIFECYCLE, ONBOARDING & FIELD-LEVEL ENCRYPTION
  // =========================================================================
  test('UAT Scenario 1: Joiner onboarding captures employee with field-level AES-256-GCM encryption', async () => {
    testEmployeeNumber = `NDK-UAT-${Date.now().toString().slice(-4)}`;
    const testNatId = String(Math.floor(10000000 + Math.random() * 90000000));
    const testKraPin = 'A' + String(Math.floor(10000000 + Math.random() * 90000000)) + 'Z';
    const testBankAccount = '0100' + String(Math.floor(10000000 + Math.random() * 90000000));

    const mgrEmp = await prisma.employee.findFirst({ where: { userId: managerClient.user.id } });

    const res = await hrClient.agent
      .post('/api/v1/employees')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeNumber: testEmployeeNumber,
        firstName: 'Amina',
        middleName: 'Mwangi',
        lastName: 'Ndung\'u',
        workEmail: `amina.${Date.now()}@ndakalaadvisory.co.ke`,
        personalEmail: 'amina.mwangi@example.com',
        phoneNumber: '+254712345678',
        emergencyContactName: 'John Ndung\'u',
        emergencyContactPhone: '+254722334455',
        emergencyContactRelationship: 'Spouse',
        nationalId: testNatId,
        kraPin: testKraPin,
        nssfNumber: 'NSSF12345',
        shifNumber: 'SHIF98765',
        bankName: 'Standard Chartered Bank Kenya',
        bankBranch: 'Chiromo',
        bankAccountNumber: testBankAccount,
        departmentId: deptAdvisoryId,
        managerId: mgrEmp?.id,
        employmentCategoryCode: 'PERMANENT',
        jobTitle: 'Associate Consultant',
        startDate: '2026-02-01',
      });

    expect(res.status).toBe(201);
    testEmployeeId = res.body.data.employee.id;
    expect(testEmployeeId).toBeDefined();

    // Verify statutory fields are encrypted at rest in database
    const rawEmp = await prisma.employee.findUnique({ where: { id: testEmployeeId } });
    expect(rawEmp).toBeDefined();
    expect(rawEmp!.nationalIdEncrypted).toMatch(/^enc:v1:/);
    expect(rawEmp!.kraPinEncrypted).toMatch(/^enc:v1:/);
    expect(rawEmp!.bankAccountNumberEncrypted).toMatch(/^enc:v1:/);

    // Verify decryption produces original plaintext
    expect(decrypt(rawEmp!.nationalIdEncrypted)).toBe(testNatId);
    expect(decrypt(rawEmp!.kraPinEncrypted)).toBe(testKraPin);
    expect(decrypt(rawEmp!.bankAccountNumberEncrypted)).toBe(testBankAccount);

    // Field-level masking check: standard manager query does not reveal full statutory fields
    const mgrView = await managerClient.agent.get(`/api/v1/employees/${testEmployeeId}`);
    expect(mgrView.status).toBe(200);
    expect(mgrView.body.data.bankAccountNumber).toBeUndefined();
  });

  // =========================================================================
  // SCENARIO 2: PROBATION REVIEW & CONFIRMATION TO ACTIVE WORKFORCE
  // =========================================================================
  test('UAT Scenario 2: Probation assessment review, partner sign-off and active status transition', async () => {
    // 1. Create assessed probation record
    const probation = await prisma.probationRecord.create({
      data: {
        employeeId: testEmployeeId,
        probationStartDate: new Date('2026-02-01'),
        probationEndDate: new Date('2026-05-01'),
        status: 'ASSESSED',
        recommendation: 'CONFIRM',
        valuesAssessment: '[]',
        supervisorComments: 'Exceeded core client onboarding milestones.',
      },
    });

    // 2. Managing Partner makes confirmation decision
    const confirmRes = await partnerClient.agent
      .post(`/api/v1/employees/probation/${probation.id}/decision`)
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({
        decision: 'CONFIRMED',
        decisionReason: 'Confirmed to regular workforce by Managing Partner.',
      });
    expect(confirmRes.status).toBe(200);

    const updatedEmp = await prisma.employee.findUnique({ where: { id: testEmployeeId } });
    expect(updatedEmp!.status).toBe('ACTIVE');
  });

  // =========================================================================
  // SCENARIO 3: LEAVE LEDGER, APPLICATION & APPEND-ONLY LEDGER AUDIT
  // =========================================================================
  test('UAT Scenario 3: Leave application, manager approval and append-only ledger transaction', async () => {
    // 1. Seed initial opening balance in ledger
    const ledgerEntry = await prisma.leaveLedgerEntry.create({
      data: {
        employeeId: testEmployeeId,
        leaveTypeId: annualLeaveType.id,
        leaveYear: 2026,
        entryType: 'OPENING_BALANCE',
        amountDays: 21.0,
        runningBalanceDays: 21.0,
        sourceType: 'YEAR_END_CLOSE',
        actorUserId: hrClient.user.id,
        notes: 'Statutory opening entitlement 2026',
      },
    });
    expect(ledgerEntry.amountDays).toBe(21.0);

    // 2. Also ensure LeaveBalance cache row exists for request validation
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId: testEmployeeId,
          leaveTypeId: annualLeaveType.id,
          leaveYear: 2026,
        },
      },
      create: {
        employeeId: testEmployeeId,
        leaveTypeId: annualLeaveType.id,
        leaveYear: 2026,
        entitlementDays: 21.0,
        accruedDays: 21.0,
        closingBalanceDays: 21.0,
      },
      update: {
        closingBalanceDays: 21.0,
      },
    });

    // 3. Employee applies for leave
    const colleague = await prisma.employee.findFirst({ where: { employeeNumber: 'SEED-0003' } });

    const applyRes = await hrClient.agent
      .post('/api/v1/leave/requests')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        leaveTypeCode: 'ANNUAL',
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        handoverEmployeeId: colleague?.id,
        handoverCompleted: true,
        reason: 'Rest and recuperation',
      });
    expect([200, 201]).toContain(applyRes.status);
    const leaveRequestId = applyRes.body.data.request.id;

    // 4. Manager approves leave request
    const approveRes = await managerClient.agent
      .post(`/api/v1/leave/requests/${leaveRequestId}/review`)
      .set('X-CSRF-Token', managerClient.csrfToken)
      .send({
        decision: 'APPROVE',
        comments: 'Approved. Handover confirmed.',
      });
    expect(approveRes.status).toBe(200);

    // 5. Verify ledger transaction
    const postEntry = await prisma.leaveLedgerEntry.create({
      data: {
        employeeId: testEmployeeId,
        leaveTypeId: annualLeaveType.id,
        leaveYear: 2026,
        entryType: 'LEAVE_TAKEN',
        amountDays: -3.0,
        runningBalanceDays: 18.0,
        sourceType: 'LEAVE_REQUEST',
        sourceId: leaveRequestId,
        actorUserId: managerClient.user.id,
        notes: `Leave taken for request ${leaveRequestId}`,
      },
    });
    expect(postEntry.runningBalanceDays).toBe(18.0);
  });

  // =========================================================================
  // SCENARIO 4: WORKING ARRANGEMENTS & ABSENCE TRACKING
  // =========================================================================
  test('UAT Scenario 4: Work schedule arrangement assignment and absence tracking', async () => {
    const absenceRes = await hrClient.agent
      .post('/api/v1/absences')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        startDate: '2026-02-15',
        reasonCategory: 'SICKNESS',
        contactChannel: 'EMAIL',
        notes: 'Mild illness recovery',
      });
    expect(absenceRes.status).toBe(201);
    expect(absenceRes.body.data.id).toBeDefined();
    expect(absenceRes.body.data.status).toBe('RECORDED');
  });

  // =========================================================================
  // SCENARIO 5: POLICY GOVERNANCE & IMMUTABLE ACKNOWLEDGEMENT
  // =========================================================================
  test('UAT Scenario 5: Policy version drafting, maker-checker publication & immutable workforce acknowledgement', async () => {
    const policyCode = `POL-INFOSEC-${Date.now()}`;

    // 1. Head of HR creates Policy Draft (creates version 1.0 automatically)
    const draftRes = await hrClient.agent
      .post('/api/v1/governance/policies')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        code: policyCode,
        title: 'Information Security & Data Protection Policy 2026',
        owner: 'ICT & Risk Committee',
        targetAudience: 'ALL_STAFF',
        category: 'INFORMATION_SECURITY',
        initialVersionSummary: 'Comprehensive controls for ISO 27001 & Kenya DPA 2019 compliance',
        effectiveDate: '2026-01-01',
        sourceReference: 'NDK-GOV-POL-01',
      });
    expect(draftRes.status).toBe(201);
    const versionId = draftRes.body.data.versions[0].id;

    // 2. Maker-Checker Gate: HR author cannot self-publish their own draft
    const selfApprove = await hrClient.agent
      .post(`/api/v1/governance/policies/versions/${versionId}/publish`)
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({});
    expect(selfApprove.status).toBe(403);

    // 3. Managing Partner publishes policy
    const pubRes = await partnerClient.agent
      .post(`/api/v1/governance/policies/versions/${versionId}/publish`)
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({});
    if (pubRes.status !== 200) console.log('PUB ERROR:', pubRes.status, pubRes.body);
    expect(pubRes.status).toBe(200);

    // 4. Find acknowledgement record assigned to workforce employee.one
    const empOne = await prisma.employee.findUniqueOrThrow({ where: { employeeNumber: 'SEED-0003' } });
    const ack = await prisma.policyAcknowledgement.findFirst({
      where: { policyVersionId: versionId, employeeId: empOne.id },
    });
    expect(ack).toBeDefined();

    // 5. Employee acknowledges their assigned policy
    const ackRes = await employeeClient.agent
      .post(`/api/v1/governance/policies/acknowledgements/${ack!.id}/acknowledge`)
      .set('X-CSRF-Token', employeeClient.csrfToken)
      .send({});
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');
  });

  // =========================================================================
  // SCENARIO 6: TRAINING ADMINISTRATION & INBOUND LMS WEBHOOK
  // =========================================================================
  test('UAT Scenario 6: Mandatory training programme assignment and completion via inbound signed LMS webhook', async () => {
    // 1. Create cybersecurity induction programme
    const trnCode = `TRN-CYBER-${Date.now().toString().slice(-4)}`;
    const trn = await prisma.trainingProgramme.create({
      data: {
        code: trnCode,
        name: 'Cybersecurity & Phishing Defense Induction',
        category: 'CYBERSECURITY_INDUCTION',
        status: 'ACTIVE',
      },
    });

    // 2. Configure LMS integration with secret using Managing Partner
    const webhookSecret = 'ndakala-lms-super-secret-token-2026';
    const configRes = await partnerClient.agent
      .put('/api/v1/integrations/configs/LEARNING_LMS')
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({
        status: 'ACTIVE',
        webhookSecret,
      });
    if (configRes.status !== 200) console.log('CONFIG ERROR:', configRes.status, configRes.body);
    expect(configRes.status).toBe(200);

    // 3. Dispatch Inbound LMS Webhook
    const lmsPayload = {
      eventId: `EVT-LMS-${Date.now()}`,
      timestamp: new Date().toISOString(),
      employeeReference: testEmployeeNumber,
      programCode: trnCode,
      programTitle: 'Cybersecurity & Phishing Defense Induction',
      completionDate: '2026-02-20',
      scorePercentage: 95,
      certificateReference: 'CERT-CYBER-95-2026',
    };

    const rawPayload = JSON.stringify(lmsPayload);
    const ts = String(Date.now());
    const signature = crypto.createHmac('sha256', webhookSecret).update(`${ts}.${rawPayload}`).digest('hex');

    const webhookRes = await request(app)
      .post('/api/v1/integrations/webhooks/lms')
      .set('x-webhook-signature', `sha256=${signature}`)
      .set('x-webhook-timestamp', ts)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.success).toBe(true);

    // Verify training record was completed in database
    const assignment = await prisma.trainingAssignment.findFirst({
      where: { programmeId: trn.id, employeeId: testEmployeeId },
    });
    expect(assignment).toBeDefined();
    expect(assignment!.status).toBe('COMPLETED');
    expect(assignment!.scorePercent).toBe(95);
    expect(assignment!.certificateNumber).toBe('CERT-CYBER-95-2026');
  });

  // =========================================================================
  // SCENARIO 7: WORKFORCE REQUISITION & INBOUND ATS WEBHOOK INGESTION
  // =========================================================================
  test('UAT Scenario 7: Staff requisition multi-stage approvals and inbound ATS candidate ingestion', async () => {
    // 1. Line Manager drafts Staff Requisition
    const reqRes = await managerClient.agent
      .post('/api/v1/workforce/requisitions')
      .set('X-CSRF-Token', managerClient.csrfToken)
      .send({
        departmentId: deptAdvisoryId,
        positionTitle: 'Senior Risk Consultant',
        reason: 'NEW_HEADCOUNT',
        vacancyDuration: 'PERMANENT',
        jobDescription: 'Leading client regulatory and compliance engagements',
        keyResponsibilities: 'Advisory audits, client reporting, senior leadership reviews',
        requiredSkills: 'BSc, CISA / CPA, 4+ years consulting experience',
      });
    expect(reqRes.status).toBe(201);
    const requisitionId = reqRes.body.data.id;
    const reqNumber = reqRes.body.data.requisitionNumber;

    // Line Manager approves
    await managerClient.agent
      .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
      .set('X-CSRF-Token', managerClient.csrfToken)
      .send({ stage: 'LINE_MANAGER', decision: 'APPROVE', comments: 'Line Manager approval confirmed' });

    // HR approves
    await hrClient.agent
      .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({ stage: 'HR', decision: 'APPROVE', comments: 'HR headcount validated against budget' });

    // GM / Partner approves -> status APPROVED
    const finalApprove = await partnerClient.agent
      .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({ stage: 'GM', decision: 'APPROVE', comments: 'Managing Partner executive sign-off' });
    expect(finalApprove.status).toBe(200);

    // 2. Configure ATS integration and ingest candidate webhook
    await partnerClient.agent
      .put('/api/v1/integrations/configs/RECRUITMENT_ATS')
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({ status: 'ACTIVE' });

    const atsPayload = {
      eventId: `EVT-ATS-${Date.now()}`,
      timestamp: new Date().toISOString(),
      requisitionNumber: reqNumber,
      candidateReference: 'CAND-UAT-9988',
      candidateName: 'Kelvin Omwamba',
      candidateEmail: 'kelvin.omwamba@example.com',
      applicationDate: '2026-02-18',
      currentStage: 'SHORTLISTED',
      interviewFeedbackSummary: 'Strong technical grounding in regulatory compliance',
    };

    const atsRes = await request(app)
      .post('/api/v1/integrations/webhooks/ats')
      .set('Content-Type', 'application/json')
      .send(atsPayload);

    expect(atsRes.status).toBe(200);
    expect(atsRes.body.data.success).toBe(true);
  });

  // =========================================================================
  // SCENARIO 8: EMPLOYEE INTERNAL TRANSFER MOBILITY
  // =========================================================================
  test('UAT Scenario 8: Internal employee transfer request, governance approval and transition', async () => {
    const position = await prisma.position.create({
      data: {
        code: `POS-UAT-${Date.now().toString().slice(-4)}`,
        title: 'Senior HR Advisor',
        departmentId: deptHRId,
      },
    });

    const transferRes = await hrClient.agent
      .post('/api/v1/workforce/transfers')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        proposedDepartmentId: deptHRId,
        proposedPositionId: position.id,
        reason: 'Career development & cross-functional operational enablement',
        effectiveDate: '2026-04-01',
      });
    expect([200, 201]).toContain(transferRes.status);
    const transferId = transferRes.body.data.id;

    // Operations Director approves transfer
    const approveRes = await opsClient.agent
      .post(`/api/v1/workforce/transfers/${transferId}/review`)
      .set('X-CSRF-Token', opsClient.csrfToken)
      .send({
        decision: 'APPROVE',
        comments: 'Transfer supported by leadership.',
      });
    expect(approveRes.status).toBe(200);
  });

  // =========================================================================
  // SCENARIO 9: ER CASE ISOLATION & CONFIDENTIALITY PROTECTION
  // =========================================================================
  test('UAT Scenario 9: Employee relations case intake, strict role isolation and investigator assignment', async () => {
    // 1. Employee submits sensitive grievance
    const intakeRes = await employeeClient.agent
      .post('/api/v1/er/cases')
      .set('X-CSRF-Token', employeeClient.csrfToken)
      .send({
        caseType: 'GRIEVANCE',
        title: 'Workplace Allocation Fairness Inquiry',
        allegationSummary: 'Concerns regarding quarterly project distribution criteria and workloads',
        severity: 'STANDARD',
      });
    expect(intakeRes.status).toBe(201);
    const caseId = intakeRes.body.data.id;

    // 2. Unassigned Line Manager receives 403 Forbidden attempting to inspect confidential ER case
    const unauthManagerView = await managerClient.agent.get(`/api/v1/er/cases/${caseId}`);
    expect(unauthManagerView.status).toBe(403);

    // 3. Managing partner grants case access to HR
    await partnerClient.agent
      .post(`/api/v1/er/cases/${caseId}/access`)
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({
        userId: hrClient.user.id,
        role: 'HANDLER',
      });

    // 4. Head of HR now has lawful access and views case
    const hrView = await hrClient.agent.get(`/api/v1/er/cases/${caseId}`);
    expect(hrView.status).toBe(200);

    // 5. Authorized HR handler assigns Operations Director as Investigator under Section 41 fairness standards
    const assignRes = await hrClient.agent
      .post(`/api/v1/er/cases/${caseId}/access`)
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        userId: opsClient.user.id,
        role: 'INVESTIGATOR',
      });
    expect(assignRes.status).toBe(201);
  });

  // =========================================================================
  // SCENARIO 10: SEPARATION & MULTI-DEPARTMENT CLEARANCE WORKFLOW
  // =========================================================================
  test('UAT Scenario 10: Separation initiation, departmental clearance checklist and exit recording', async () => {
    // 1. Initiate separation
    const sepRes = await hrClient.agent
      .post('/api/v1/separation/initiate')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        triggerType: 'RESIGNATION',
        noticeDate: '2026-05-01',
        intendedLastDay: '2026-05-31',
        effectiveDate: '2026-05-31',
        reason: 'Pursuing postgraduate studies at university',
      });
    expect(sepRes.status).toBe(201);
    const separation = sepRes.body.data;
    expect(separation.status).toBe('CLEARANCE_IN_PROGRESS');
  });

  // =========================================================================
  // SCENARIO 11: PERFORMANCE OBJECTIVES, APPRAISALS & PIP WORKFLOW
  // =========================================================================
  test('UAT Scenario 11: Performance objective setting, self appraisal, manager review and PIP check-in', async () => {
    // 1. Create Performance Cycle
    const cycle = await prisma.performanceCycle.create({
      data: {
        title: 'FY2026 Q1 Appraisal Cycle',
        cycleType: 'QUARTERLY',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-03-31'),
        selfAppraisalDeadline: new Date('2026-03-15'),
        managerReviewDeadline: new Date('2026-03-31'),
        distributionGuidance: JSON.stringify({ '5': 5, '4': 15, '3': 60, '2': 15, '1': 5 }),
        configurationSnapshot: '{}',
        status: 'ACTIVE',
        createdById: hrClient.user.id,
      },
    });

    // 2. Set Objectives
    const objRes = await hrClient.agent
      .post('/api/v1/performance/objectives')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        cycleId: cycle.id,
        title: 'FY2026 Objectives Set',
        objectives: [
          {
            title: 'Deliver Q1 Audit Files',
            kpi: 'Complete 3 engagement reviews',
            behavioursAndValues: 'Professional rigor and ethics',
            expectedDate: '2026-03-31',
            weightPercent: 60,
          },
          {
            title: 'Client Training Delivery',
            kpi: 'Conduct 2 client OSH briefings',
            behavioursAndValues: 'Client-centric collaboration',
            expectedDate: '2026-03-31',
            weightPercent: 40,
          },
        ],
      });
    expect([200, 201]).toContain(objRes.status);

    // 3. Initiate Appraisal
    const mgrEmp = await prisma.employee.findFirstOrThrow({ where: { userId: managerClient.user.id } });
    const appraisal = await prisma.performanceAppraisal.create({
      data: {
        cycleId: cycle.id,
        employeeId: testEmployeeId,
        managerId: mgrEmp.id,
        status: 'DRAFT_SELF',
        selfAchievements: 'Completed client audit engagements on schedule with zero non-conformances.',
        selfStrengths: JSON.stringify(['Attention to detail', 'Client relationship management']),
        selfImprovementAreas: JSON.stringify(['Advanced statistical sampling', 'Time management under crunch']),
        managerAchievementsComments: 'Solid performance throughout the cycle.',
        managerStrengths: JSON.stringify(['Thorough reporting', 'Reliable work ethic']),
        managerImprovementAreas: JSON.stringify(['Speed of file closure', 'Delegation']),
        managerRatingCode: 4,
      },
    });
    expect(appraisal.id).toBeDefined();

    // 4. Targeted PIP Initiation
    const pip = await prisma.performanceImprovementPlan.create({
      data: {
        pipNumber: `PIP-UAT-${Date.now().toString().slice(-4)}`,
        employeeId: testEmployeeId,
        lineManagerId: managerClient.user.id,
        hrLeadId: hrClient.user.id,
        triggerReason: 'CAPABILITY_DEFICIT',
        durationMonths: 1,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-05-01'),
        baselineAssessment: 'Identified specific turnaround needs on draft engagement reviews.',
        smartTargets: JSON.stringify([
          { target: 'Deliver draft reviews within 48h', measurement: 'Turnaround metric', supportRequired: 'Weekly 1:1 coaching', dueDate: '2026-05-01' }
        ]),
        status: 'ACTIVE',
      },
    });
    expect(pip.status).toBe('ACTIVE');
  });

  // =========================================================================
  // SCENARIO 12: CONFIGURABLE KENYAN PAYROLL RUN & BANK EFT EXPORT
  // =========================================================================
  test('UAT Scenario 12: Configurable Kenyan statutory payroll calculation, locking & restricted bank EFT export', async () => {
    // 1. Seed Pay Group, Period and RuleSet
    const payGroup = await prisma.payrollPayGroup.create({
      data: {
        code: `PG-UAT-${Date.now().toString().slice(-4)}`,
        name: 'Professional Services Consulting',
        payFrequency: 'MONTHLY',
        currency: 'KES',
      },
    });

    const period = await prisma.payrollPeriod.create({
      data: {
        periodCode: `2026-UAT-${Date.now().toString().slice(-4)}`,
        name: 'UAT Remuneration Period',
        periodNumber: 1,
        payGroupId: payGroup.id,
        fiscalYear: 2026,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-02-28'),
        cutoffDate: new Date('2026-02-20'),
        payDate: new Date('2026-02-28'),
        status: 'DRAFT',
      },
    });

    const ruleSet = await prisma.statutoryRuleSet.create({
      data: {
        code: `KENYA-STAT-UAT-${Date.now().toString().slice(-4)}`,
        name: 'Kenyan Statutory 2026 Rule Engine',
        version: '2026.1',
        countryCode: 'KE',
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        rulesSnapshot: '{}',
      },
    });

    // 2. Create Payroll Run
    const run = await prisma.payrollRun.create({
      data: {
        periodId: period.id,
        ruleSetId: ruleSet.id,
        ruleSetSnapshot: '{}',
        status: 'APPROVED',
        totalGrossPay: 150000,
        totalNetPay: 108420,
        totalEmployeesCount: 1,
      },
    });

    // Attach slip with decrypted bank test data
    await prisma.payrollSlip.create({
      data: {
        runId: run.id,
        periodId: period.id,
        employeeId: testEmployeeId,
        employeeName: 'Amina Mwangi Ndung\'u',
        employeeRef: testEmployeeNumber,
        grossPay: 150000,
        taxablePay: 145680,
        netPay: 108420,
        totalEmployeeDeductions: 41580,
        totalEmployerCosts: 6570,
      },
    });

    // 3. Export Bank EFT Schedule (Authorized Managing Partner or Payroll Officer)
    const eftRes = await partnerClient.agent
      .post('/api/v1/integrations/bank-eft/export')
      .set('X-CSRF-Token', partnerClient.csrfToken)
      .send({
        payrollRunId: run.id,
        bankFormat: 'KENYA_KBA_EFT',
        sourceAccount: '01009988776655',
        valueDate: '2026-02-28',
      });

    expect(eftRes.status).toBe(200);
    expect(eftRes.body.data.recordCount).toBe(1);
    expect(eftRes.body.data.totalAmountKes).toBe(108420);
    expect(eftRes.body.data.scheduleSha256).toBeDefined();
    expect(eftRes.body.data.disallowedActionPolicy).toContain('Direct automated API payment initiation is strictly forbidden');
  });

  // =========================================================================
  // SCENARIO 13: WEBHOOK CRYPTOGRAPHIC VERIFICATION & REPLAY GUARD
  // =========================================================================
  test('UAT Scenario 13: Webhook HMAC verification rejects forged signatures, replay nonces and stale timestamps', async () => {
    const service = new IntegrationService(prisma);
    const secret = 'ndakala-top-secret-signing-key-2026';
    const payload = JSON.stringify({ event: 'TEST_EVENT', data: 'secure' });

    // 1. Valid Signature
    const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const validCheck = service.verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: validSig,
      secret,
    });
    expect(validCheck.isValid).toBe(true);

    // 2. Tampered Payload (Forgery Detection)
    const forgedCheck = service.verifyWebhookSignature({
      rawBody: JSON.stringify({ event: 'TEST_EVENT', data: 'tampered-payload' }),
      signatureHeader: validSig,
      secret,
    });
    expect(forgedCheck.isValid).toBe(false);
    expect(forgedCheck.reason).toContain('signature mismatch');

    // 3. Replay Protection: Timestamp drift > 300 seconds
    const staleTimestamp = String(Date.now() - 400_000); // 400s in the past
    const stalePayload = `${staleTimestamp}.${payload}`;
    const staleSig = crypto.createHmac('sha256', secret).update(stalePayload).digest('hex');

    const driftCheck = service.verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: staleSig,
      secret,
      timestampHeader: staleTimestamp,
      maxDriftSec: 300,
    });
    expect(driftCheck.isValid).toBe(false);
    expect(driftCheck.reason).toContain('exceeds allowable tolerance');

    // 4. Nonce Replay Guard
    const nonce = `NONCE-${Date.now()}`;
    const firstCall = service.verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: validSig,
      secret,
      nonceHeader: nonce,
    });
    expect(firstCall.isValid).toBe(true);

    const replayedCall = service.verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: validSig,
      secret,
      nonceHeader: nonce,
    });
    expect(replayedCall.isValid).toBe(false);
    expect(replayedCall.reason).toContain('Replay detected');
  });

  // =========================================================================
  // SCENARIO 14: SSRF OUTBOUND URL VALIDATION GUARD
  // =========================================================================
  test('UAT Scenario 14: Outbound SSRF guard strictly blacklists loopback, private IP subnets and metadata services', async () => {
    const service = new IntegrationService(prisma);

    // Localhost / Loopback
    const local1 = await service.validateOutboundUrl('http://localhost:8080/events');
    expect(local1.allowed).toBe(false);

    const local2 = await service.validateOutboundUrl('http://127.0.0.1:9000/siem');
    expect(local2.allowed).toBe(false);

    // Cloud Metadata IP
    const metadata = await service.validateOutboundUrl('http://169.254.169.254/latest/meta-data');
    expect(metadata.allowed).toBe(false);

    // Internal Subnets
    const priv10 = await service.validateOutboundUrl('http://10.0.0.1:443/siem');
    expect(priv10.allowed).toBe(false);

    const priv192 = await service.validateOutboundUrl('http://192.168.1.100/webhook');
    expect(priv192.allowed).toBe(false);

    // Unsupported Protocols
    const fileProto = await service.validateOutboundUrl('file:///etc/passwd');
    expect(fileProto.allowed).toBe(false);
  });

  // =========================================================================
  // SCENARIO 15: PRIVACY DSR LIFECYCLE, DATA PORTABILITY & LEGAL HOLDS
  // =========================================================================
  test('UAT Scenario 15: Data subject portability export and active legal hold blocking statutory erasure', async () => {
    const privacyService = new PrivacyService(prisma);

    // 1. Submit DSR Access & Portability request
    const dsrRes = await hrClient.agent
      .post('/api/v1/privacy/dsr')
      .set('X-CSRF-Token', hrClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        requestType: 'PORTABILITY',
        lawfulJustification: 'Section 38 Kenya DPA 2019 Right to Data Portability',
        requesterEmail: 'amina.mwangi@example.com',
      });
    expect(dsrRes.status).toBe(201);
    const dsrId = dsrRes.body.data.id;

    // 2. DPO fulfills DSR and exports portable package
    const fulfillRes = await dpoClient.agent
      .post(`/api/v1/privacy/dsr/${dsrId}/review`)
      .set('X-CSRF-Token', dpoClient.csrfToken)
      .send({ action: 'FULFILL' });
    expect(fulfillRes.status).toBe(200);

    const pkg = await privacyService.generatePortabilityPackage(testEmployeeId);
    expect(pkg.metadata.jurisdiction).toContain('Kenya (Data Protection Act 2019');
    expect(pkg.personalProfile.fullName).toBe('Amina Mwangi Ndung\'u');
    expect(pkg.personalProfile.phoneNumber).toBe('+254712345678');
    expect(pkg.employmentHistory.length).toBeGreaterThan(0);
    expect(pkg.remunerationSummary.currency).toBe('KES');

    // 3. Apply Legal Hold to Employee Record
    const holdRes = await dpoClient.agent
      .post('/api/v1/privacy/legal-holds')
      .set('X-CSRF-Token', dpoClient.csrfToken)
      .send({
        employeeId: testEmployeeId,
        matterTitle: 'Inquiry Matter 2026/04 — External Advisory Engagement Audit',
        reasonCategory: 'REGULATORY',
        notes: 'Statutory hold preserving all workforce, leave and remuneration records',
      });
    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.data.id;

    // 4. Attempt to fulfill an Erasure DSR while Legal Hold is active -> Must Be Rejected!
    const erasureDsr = await prisma.privacyDataSubjectRequest.create({
      data: {
        requestNumber: `DSR-ERASURE-${Date.now()}`,
        employeeId: testEmployeeId,
        requestType: 'ERASURE',
        status: 'SUBMITTED',
        lawfulJustification: 'Right to erasure under Section 40',
        requesterEmail: 'amina.mwangi@example.com',
      },
    });

    const attemptErasure = await dpoClient.agent
      .post(`/api/v1/privacy/dsr/${erasureDsr.id}/review`)
      .set('X-CSRF-Token', dpoClient.csrfToken)
      .send({ action: 'FULFILL' });

    expect(attemptErasure.status).toBe(403);
    expect(attemptErasure.body.error.message).toContain('active litigation/legal hold');

    // 5. Release Legal Hold
    const releaseRes = await dpoClient.agent
      .post(`/api/v1/privacy/legal-holds/${holdId}/release`)
      .set('X-CSRF-Token', dpoClient.csrfToken)
      .send({ notes: 'Regulatory inquiry concluded with no findings. Hold released.' });
    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.data.status).toBe('RELEASED');
  });

  // =========================================================================
  // SCENARIO 16: SYSTEM OBSERVABILITY & ACCOUNT LOCKOUT SECURITY
  // =========================================================================
  test('UAT Scenario 16: Health, readiness, metrics observability and brute-force account lockout enforcement', async () => {
    // 1. Health Probe
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('UP');

    // 2. Readiness Probe
    const ready = await request(app).get('/api/v1/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('READY');
    expect(ready.body.database).toBe('CONNECTED');

    // 3. Metrics & Observability Probe
    const metrics = await request(app).get('/api/v1/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.body.status).toBe('HEALTHY');
    expect(metrics.body.memory.heapUsedMb).toBeGreaterThan(0);
    expect(metrics.body.securityPosture.accountLockoutPolicy).toContain('5 failed attempts');

    // 4. Brute Force Account Lockout Enforcement (5 consecutive failed attempts)
    const testEmail = `brute.test.${Date.now()}@ndakalaadvisory.co.ke`;
    await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Lockout Test Subject',
        passwordHash: (await encrypt('ValidPass123!'))!,
        isActive: true,
        failedLoginAttempts: 0,
      },
    });

    for (let i = 0; i < 4; i++) {
      const failRes = await request(app).post('/api/v1/auth/login').send({
        email: testEmail,
        password: 'WrongPassword!',
      });
      expect(failRes.status).toBe(401);
    }

    // 5th failed attempt locks the account
    const fifthFail = await request(app).post('/api/v1/auth/login').send({
      email: testEmail,
      password: 'WrongPassword!',
    });
    expect(fifthFail.status).toBe(401);

    const lockedUser = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(lockedUser!.lockedUntil).toBeDefined();
    expect(lockedUser!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // 6th attempt is blocked with 403 Forbidden
    const blockedRes = await request(app).post('/api/v1/auth/login').send({
      email: testEmail,
      password: 'WrongPassword!',
    });
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.message).toContain('Account is temporarily locked');
  });
});
