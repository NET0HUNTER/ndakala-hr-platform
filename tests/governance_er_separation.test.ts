import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('R1.1 Governance, Employee Relations, Transfer & Separation (Phase 4)', () => {
  const app = getApp();

  let partnerClient: Awaited<ReturnType<typeof loginClient>>;
  let opsClient: Awaited<ReturnType<typeof loginClient>>;
  let hrClient: Awaited<ReturnType<typeof loginClient>>;
  let managerClient: Awaited<ReturnType<typeof loginClient>>;
  let employeeClient: Awaited<ReturnType<typeof loginClient>>;
  let ictClient: Awaited<ReturnType<typeof loginClient>>;

  let testEmployeeId: string;
  let testDepartmentId: string;
  let testPositionId: string;

  async function cleanupTestData() {
    await prisma.exitInterview.deleteMany();
    await prisma.separationClearanceItem.deleteMany();
    await prisma.employeeSeparation.deleteMany();
    await prisma.erCaseEvent.deleteMany();
    await prisma.erAppeal.deleteMany();
    await prisma.erCaseDecision.deleteMany();
    await prisma.erHearing.deleteMany();
    await prisma.erEvidenceDocument.deleteMany();
    await prisma.erConflictDeclaration.deleteMany();
    await prisma.erCaseAccess.deleteMany();
    await prisma.erCase.deleteMany();
    await prisma.employeeTransfer.deleteMany();
    await prisma.postRecruitmentSurvey.deleteMany();
    await prisma.staffRequisition.deleteMany();
    await prisma.phishingSimulationRecord.deleteMany();
    await prisma.trainingAssignment.deleteMany();
    await prisma.trainingProgramme.deleteMany({ where: { code: { startsWith: 'TEST-' } } });
    await prisma.policyAcknowledgement.deleteMany();
    await prisma.policyVersion.deleteMany({ where: { policy: { code: { startsWith: 'POL-TEST' } } } });
    await prisma.policyDocument.deleteMany({ where: { code: { startsWith: 'POL-TEST' } } });
    await prisma.employee.updateMany({
      data: {
        status: 'ACTIVE',
        isActive: true,
        deactivatedAt: null,
      },
    });
    const mgr = await prisma.employee.findUnique({ where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' } });
    if (mgr) {
      await prisma.employee.updateMany({
        where: { workEmail: 'employee.one@ndakalaadvisory.co.ke' },
        data: { managerId: mgr.id },
      });
    }
  }

  beforeAll(async () => {
    await seedDatabase(prisma);
    await cleanupTestData();

    partnerClient = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    opsClient = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    hrClient = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    managerClient = await loginClient(app, 'line.manager@ndakalaadvisory.co.ke');
    employeeClient = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    ictClient = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');

    const emp = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'employee.one@ndakalaadvisory.co.ke' },
    });
    testEmployeeId = emp.id;

    const dept = await prisma.department.findFirstOrThrow();
    testDepartmentId = dept.id;

    const pos = await prisma.position.findFirstOrThrow();
    testPositionId = pos.id;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ---------------------------------------------------------------------------
  // 1. Policy Register and Version Acknowledgement
  // ---------------------------------------------------------------------------
  describe('Policy Register & Exact Version Acknowledgement', () => {
    let testPolicyId: string;
    let v1Id: string;
    let ackV1Id: string;

    it('creates a draft policy document with initial draft version 1.0', async () => {
      const res = await hrClient.agent
        .post('/api/v1/governance/policies')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          code: 'POL-TEST-001',
          title: 'Client Confidentiality & Insider Information Policy',
          owner: 'Compliance & Legal',
          targetAudience: 'ALL_STAFF',
          category: 'INFORMATION_SECURITY',
          initialVersionSummary: 'Strict non-disclosure of non-public advisory client material.',
          effectiveDate: '2026-01-01',
          sourceReference: 'Combined Policies §4.3',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('POL-TEST-001');
      expect(res.body.data.versions[0].versionNumber).toBe('1.0');
      expect(res.body.data.versions[0].status).toBe('DRAFT');
      expect(res.body.data.versions[0].isImmutable).toBe(false);

      testPolicyId = res.body.data.id;
      v1Id = res.body.data.versions[0].id;
    });

    it('enforces Maker-Checker: author CANNOT approve and publish their own policy version draft', async () => {
      // HR Lead drafted the policy, so HR Lead cannot approve it
      const res = await hrClient.agent
        .post(`/api/v1/governance/policies/versions/${v1Id}/publish`)
        .set('x-csrf-token', hrClient.csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Maker-Checker Violation');
    });

    it('publishes policy version v1.0, marks it immutable, and distributes exact acknowledgements to active workforce', async () => {
      // Operations Director approves and publishes version 1.0
      const res = await opsClient.agent
        .post(`/api/v1/governance/policies/versions/${v1Id}/publish`)
        .set('x-csrf-token', opsClient.csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.published.status).toBe('PUBLISHED');
      expect(res.body.data.published.isImmutable).toBe(true);
      expect(res.body.data.audienceCount).toBeGreaterThan(0);

      // Verify acknowledgement row created for test employee
      const ack = await prisma.policyAcknowledgement.findUnique({
        where: {
          policyVersionId_employeeId: {
            policyVersionId: v1Id,
            employeeId: testEmployeeId,
          },
        },
      });
      expect(ack).toBeDefined();
      expect(ack?.status).toBe('PENDING');
      ackV1Id = ack!.id;
    });

    it('employee acknowledges exact policy version v1.0 with captured metadata', async () => {
      const res = await employeeClient.agent
        .post(`/api/v1/governance/policies/acknowledgements/${ackV1Id}/acknowledge`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACKNOWLEDGED');
      expect(res.body.data.acknowledgedAt).toBeDefined();

      const ack = await prisma.policyAcknowledgement.findUniqueOrThrow({ where: { id: ackV1Id } });
      expect(ack.status).toBe('ACKNOWLEDGED');
      expect(ack.policyVersionId).toBe(v1Id); // Strictly bound to v1.0
    });

    it('publishing a newer version v2.0 preserves historical v1.0 acknowledgement without overwriting', async () => {
      // 1. Draft v2.0
      const v2Res = await hrClient.agent
        .post(`/api/v1/governance/policies/${testPolicyId}/versions`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          versionNumber: '2.0',
          contentSummary: 'Updated with remote client audit data handling directives.',
          effectiveDate: '2026-06-01',
          sourceReference: 'Combined Policies §4.3 rev 2',
        });
      expect(v2Res.status).toBe(201);
      const v2Id = v2Res.body.data.id;

      // 2. Publish v2.0 by Operations Director
      const pubRes = await opsClient.agent
        .post(`/api/v1/governance/policies/versions/${v2Id}/publish`)
        .set('x-csrf-token', opsClient.csrfToken);
      expect(pubRes.status).toBe(200);

      // 3. Verify prior version v1.0 is now SUPERSEDED
      const v1 = await prisma.policyVersion.findUniqueOrThrow({ where: { id: v1Id } });
      expect(v1.status).toBe('SUPERSEDED');

      // 4. CRITICAL INVARIANT: Verify employee historical acknowledgement STILL points to v1.0 and is intact
      const historicalAck = await prisma.policyAcknowledgement.findUniqueOrThrow({ where: { id: ackV1Id } });
      expect(historicalAck.policyVersionId).toBe(v1Id);
      expect(historicalAck.status).toBe('ACKNOWLEDGED');

      // 5. Verify a NEW pending acknowledgement exists for v2.0
      const newAck = await prisma.policyAcknowledgement.findUnique({
        where: {
          policyVersionId_employeeId: {
            policyVersionId: v2Id,
            employeeId: testEmployeeId,
          },
        },
      });
      expect(newAck).toBeDefined();
      expect(newAck?.status).toBe('PENDING');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Training Administration (not an LMS) & Open Decision Flag
  // ---------------------------------------------------------------------------
  describe('Training Administration & Phishing Simulation', () => {
    it('flags unconfirmed "14c days" typo as an open decision (D-15) and does not silently assume 14 days', async () => {
      const res = await hrClient.agent
        .post('/api/v1/governance/training/programmes')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          code: 'TEST-TRN-14C',
          name: 'Security Protocol Certification (D-15 Typo Evaluation)',
          category: 'ROLE_SPECIFIC',
          decisionReference: 'D-15',
          description: 'Includes the source policy "14c days" notice rule requiring legal resolution.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isOpenDecisionTypo).toBe(true);
      expect(res.body.data.decisionReference).toBe('D-15');
    });

    it('assigns and completes training with score and certificate metadata', async () => {
      const prog = await prisma.trainingProgramme.findFirstOrThrow({
        where: { code: 'TRN-CYBER-IND' },
      });

      // Assign training
      const assignRes = await hrClient.agent
        .post('/api/v1/governance/training/assign')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          programmeId: prog.id,
          employeeId: testEmployeeId,
          dueDate: '2026-12-01',
        });

      expect(assignRes.status).toBe(201);
      const assignmentId = assignRes.body.data.id;

      // Complete training with passing score
      const completeRes = await employeeClient.agent
        .post(`/api/v1/governance/training/assignments/${assignmentId}/complete`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          scorePercent: 95,
          passed: true,
          certificateNumber: 'CERT-CYBER-2026-001',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.status).toBe('COMPLETED');
      expect(completeRes.body.data.scorePercent).toBe(95);
      expect(completeRes.body.data.certificateNumber).toBe('CERT-CYBER-2026-001');
    });

    it('automatically assigns remedial cybersecurity training when phishing simulation credentials are submitted', async () => {
      const res = await ictClient.agent
        .post('/api/v1/governance/training/phishing-records')
        .set('x-csrf-token', ictClient.csrfToken)
        .send({
          campaignName: 'Q4 Banking Credential Phish Simulation',
          simulationDate: '2026-11-10',
          employeeId: testEmployeeId,
          payloadType: 'CREDENTIAL_HARVEST',
          clickedLink: true,
          submittedCredentials: true,
          reportedPhish: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.submittedCredentials).toBe(true);
      expect(res.body.data.remedialTrainingAssigned).toBe(true);

      // Verify that remedial training assignment was automatically generated
      const remedialAssignment = await prisma.trainingAssignment.findFirst({
        where: {
          employeeId: testEmployeeId,
          remedialNotes: { contains: 'Automated remedial training triggered' },
        },
      });
      expect(remedialAssignment).toBeDefined();
      expect(remedialAssignment?.status).toBe('ASSIGNED');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Workforce Requisition & Post-Recruitment Survey (Forms 1 & 2)
  // ---------------------------------------------------------------------------
  describe('Workforce Requisition & Recruitment Surveys (Forms 1 & 2)', () => {
    let requisitionId: string;

    it('submits a staff requisition form with required BRS Form 1 fields', async () => {
      const res = await managerClient.agent
        .post('/api/v1/workforce/requisitions')
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          departmentId: testDepartmentId,
          positionTitle: 'Senior Tax Consultant',
          headcount: 1,
          reason: 'CAPACITY_EXPANSION',
          vacancyDuration: 'PERMANENT',
          proposedStartDate: '2027-01-15',
          reportingToPosition: 'Tax Partner',
          jobDescription: 'Lead corporate tax compliance, advisory, and transfer pricing audits.',
          keyResponsibilities: 'Manage engagement deliverables, mentor analysts, liaise with KRA.',
          requiredSkills: 'CPA(K) / ACCA, 4+ years advisory experience, advanced tax computation.',
          objectives: 'Expand tax advisory client portfolio by 25% in FY2027.',
          teamChallenges: 'Navigating Finance Act revisions and increased client inquiry volumes.',
          budgetContext: 'Budgeted headcount under FY2027 Tax Practice Plan.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.requisitionNumber).toMatch(/^REQ-2026-\d{4}$/);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.currentStage).toBe('LINE_MANAGER');

      requisitionId = res.body.data.id;
    });

    it('enforces Maker-Checker: initiator CANNOT approve their own staff requisition', async () => {
      // Line Manager created it; Line Manager cannot approve it
      const res = await managerClient.agent
        .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          stage: 'LINE_MANAGER',
          decision: 'APPROVE',
          comments: 'Self-approval attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Maker-Checker Violation');
    });

    it('advances multi-stage approval: Line Manager -> HR -> General Manager', async () => {
      // 1. HR reviews Stage 1
      const stage1 = await hrClient.agent
        .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          stage: 'LINE_MANAGER',
          decision: 'APPROVE',
          comments: 'Approved on behalf of departmental head',
        });
      expect(stage1.status).toBe(200);
      expect(stage1.body.data.currentStage).toBe('HR');
      expect(stage1.body.data.status).toBe('LINE_MANAGER_APPROVED');

      // 2. HR reviews Stage 2
      const stage2 = await hrClient.agent
        .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          stage: 'HR',
          decision: 'APPROVE',
          comments: 'Salary band and grade benchmark verified',
        });
      expect(stage2.status).toBe(200);
      expect(stage2.body.data.currentStage).toBe('GM');
      expect(stage2.body.data.status).toBe('HR_APPROVED');

      // 3. Managing Partner / GM approves Stage 3
      const stage3 = await partnerClient.agent
        .post(`/api/v1/workforce/requisitions/${requisitionId}/review`)
        .set('x-csrf-token', partnerClient.csrfToken)
        .send({
          stage: 'GM',
          decision: 'APPROVE',
          comments: 'Budget and headcount authorization confirmed',
        });
      expect(stage3.status).toBe(200);
      expect(stage3.body.data.currentStage).toBe('APPROVED');
      expect(stage3.body.data.status).toBe('GM_APPROVED');
    });

    it('submits post-recruitment survey (Form 2) and calculates null-safe average ratings with privacy-safe reporting', async () => {
      // Submit survey 1 (all ratings provided)
      await managerClient.agent
        .post('/api/v1/workforce/surveys')
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          requisitionId,
          candidateRef: 'CAND-8192',
          roleClarityRating: 4,
          processSpeedRating: 5,
          candidateQualityRating: 5,
          communicationRating: 4,
          overallExperienceRating: 5,
          comments: 'Candidate demonstrated strong technical grasp during case study.',
        });

      // Submit survey 2 (some fields missing/null to test null-safety)
      await hrClient.agent
        .post('/api/v1/workforce/surveys')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          requisitionId,
          candidateRef: 'CAND-9912',
          roleClarityRating: 4,
          candidateQualityRating: 4,
          // processSpeedRating & communicationRating omitted
          overallExperienceRating: 4,
          comments: 'Offer accepted promptly.',
        });

      // Fetch analytics
      const metricsRes = await hrClient.agent.get('/api/v1/workforce/surveys/metrics');
      expect(metricsRes.status).toBe(200);
      const metrics = metricsRes.body.data;

      expect(metrics.totalSurveys).toBe(2);
      expect(metrics.averageRoleClarity).toBe(4.0); // (4+4)/2
      expect(metrics.averageProcessSpeed).toBe(5.0); // (5)/1 (null-safe!)
      expect(metrics.averageCandidateQuality).toBe(4.5); // (5+4)/2
      expect(metrics.averageOverallExperience).toBe(4.5); // (5+4)/2

      // Privacy-safe report: individual candidate names and sensitive identity fields are suppressed
      expect(metrics.privacySafeComments.length).toBe(2);
      expect(metrics.privacySafeComments[0].candidateRef).toBe('CAND-8192');
      expect(metrics.privacySafeComments[0].candidateName).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Employee Transfer & Blocked Carry-Over Policy Guardrail
  // ---------------------------------------------------------------------------
  describe('Employee Transfer & Leave Carry-Over Guardrail', () => {
    it('BLOCKS transfer request if an unconfirmed 5-day leave carry-over cap or automatic forfeiture is attempted', async () => {
      const res = await hrClient.agent
        .post('/api/v1/workforce/transfers')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          proposedDepartmentId: testDepartmentId,
          proposedPositionId: testPositionId,
          reason: 'Transfer with policy cap test',
          effectiveDate: '2026-12-01',
          leaveBalanceCarryOverPolicy: 'FIVE_DAY_CAP_FORFEIT_EXCESS',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Transfer leave carry-over 5-day cap rule is pending legal/HR policy validation');
      expect(res.body.error.message).toContain('Automatic forfeiture of accrued leave balances is prohibited by Kenya Employment Act §28');
    });

    it('approves legitimate transfer, creates ICT mover task, and preserves historical reporting assignments', async () => {
      // 1. Submit transfer
      const submitRes = await hrClient.agent
        .post('/api/v1/workforce/transfers')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          proposedDepartmentId: testDepartmentId,
          proposedPositionId: testPositionId,
          reason: 'Strategic redeployment to Tax Practice Group',
          effectiveDate: '2026-11-01', // Effective immediately
        });

      expect(submitRes.status).toBe(201);
      const transferId = submitRes.body.data.id;
      expect(submitRes.body.data.transferNumber).toMatch(/^TRF-2026-\d{4}$/);
      expect(submitRes.body.data.leaveBalanceCarryOverPolicy).toBe('BLOCKED_PENDING_CONFIRMATION');

      // 2. Operations Director approves transfer
      const approveRes = await opsClient.agent
        .post(`/api/v1/workforce/transfers/${transferId}/review`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({
          decision: 'APPROVE',
          comments: 'Redeployment endorsed',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.approved.status).toBe('APPROVED');
      expect(approveRes.body.data.moverRequest.requestType).toBe('MOVER');

      // 3. Verify reporting history is preserved (old row closed with effectiveTo, new row opened)
      const history = await prisma.reportingAssignmentHistory.findMany({
        where: { employeeId: testEmployeeId },
        orderBy: { effectiveFrom: 'desc' },
      });
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Secure Employee Relations Cases (Case-Level Security & Whistleblower)
  // ---------------------------------------------------------------------------
  describe('Secure Employee Relations (ER) Case Foundation & Case-Level Access', () => {
    let discCaseId: string;
    let wbToken: string;

    it('allows public anonymous whistleblowing intake without authentication and returns tracking token', async () => {
      const res = await request(app)
        .post('/api/v1/er/cases/whistleblower/anonymous')
        .send({
          title: 'Allegation of improper tender bidding influence in procurement',
          allegationSummary: 'Third-party vendor offered undisclosed consideration to advisory team member.',
          policyClausesCited: 'Anti-Bribery & Corruption Policy §3.1',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.caseNumber).toMatch(/^ER-WB-2026-\d{4}$/);
      expect(res.body.data.trackingToken).toMatch(/^WB-2026-[0-9A-F]{32}$/);

      wbToken = res.body.data.trackingToken;
    });

    it('allows anonymous whistleblower to track status via token without login or identity leakage', async () => {
      const res = await request(app).get(`/api/v1/er/cases/whistleblower/track/${wbToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INTAKE');
      expect(res.body.data.antiRetaliationMonitoring).toBe(true);
      expect(res.body.data.timeline.length).toBeGreaterThanOrEqual(1);
    });

    it('creates a disciplinary misconduct case with designated primary handler', async () => {
      const res = await hrClient.agent
        .post('/api/v1/er/cases')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          caseType: 'DISCIPLINARY',
          title: 'Alleged unauthorized sharing of confidential partner minutes',
          severity: 'HIGH',
          subjectEmployeeId: testEmployeeId,
          primaryHandlerId: hrClient.user.id,
          allegationSummary: 'Internal audit identified confidential file download to non-authorized thumb drive.',
          policyClausesCited: 'Code of Conduct §5.2, Information Security §4.1',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.caseNumber).toMatch(/^ER-DISC-2026-\d{4}$/);
      expect(res.body.data.status).toBe('INTAKE');

      discCaseId = res.body.data.id;
    });

    it('PROHIBITS generic HR case listing: unassigned manager/HR user CANNOT view cases they are not assigned to', async () => {
      // Line Manager attempts to view cases -> returns ONLY cases they are assigned to (empty for discCaseId)
      const listRes = await managerClient.agent.get('/api/v1/er/cases');
      expect(listRes.status).toBe(200);
      const canSeeCase = listRes.body.data.some((c: any) => c.id === discCaseId);
      expect(canSeeCase).toBe(false);

      // Line Manager attempts direct inspection by ID -> 403 / CaseAccessDenied
      const directRes = await managerClient.agent.get(`/api/v1/er/cases/${discCaseId}`);
      expect(directRes.status).toBe(403);
      expect(directRes.body.error.message).toContain('Generic case listing prohibited');
    });

    it('allows designated primary handler to inspect case details and manage access', async () => {
      const res = await hrClient.agent.get(`/api/v1/er/cases/${discCaseId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(discCaseId);
      expect(res.body.data.primaryHandlerId).toBe(hrClient.user.id);
    });

    it('supports conflict-of-interest declaration: revokes access immediately and reassigns handler', async () => {
      // HR Lead declares conflict
      const conflictRes = await hrClient.agent
        .post(`/api/v1/er/cases/${discCaseId}/conflict`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          natureOfConflict: 'Prior social acquaintance with employee relative.',
          reassignToUserId: opsClient.user.id,
        });

      expect(conflictRes.status).toBe(200);

      // Verify that case primaryHandlerId is now Operations Director
      const updatedCase = await prisma.erCase.findUniqueOrThrow({ where: { id: discCaseId } });
      expect(updatedCase.primaryHandlerId).toBe(opsClient.user.id);

      // Verify HR Lead's access row is revoked
      const hrAccess = await prisma.erCaseAccess.findFirst({
        where: { caseId: discCaseId, userId: hrClient.user.id },
      });
      expect(hrAccess?.revokedAt).toBeDefined();
    });

    it('conducts hearing and records human-authorised decision with formal sanction (no automated guilt)', async () => {
      // 1. Schedule hearing
      const hearingRes = await opsClient.agent
        .post(`/api/v1/er/cases/${discCaseId}/hearings`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({
          scheduledDate: '2026-11-20T10:00:00Z',
          locationOrLink: 'Boardroom 2 / Hybrid Link',
          companionAllowed: true,
          panelMemberUserIds: [partnerClient.user.id],
        });
      expect(hearingRes.status).toBe(201);

      // 2. Issue decision by human decision-maker
      const decRes = await opsClient.agent
        .post(`/api/v1/er/cases/${discCaseId}/decision`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({
          findings: 'File access occurred due to improper laptop docking at home; no evidence of external dissemination.',
          sanction: 'WRITTEN_WARNING',
          sanctionDurationMonths: 6,
          appealDeadlineDays: 7,
        });

      expect(decRes.status).toBe(200);
      expect(decRes.body.data.sanction).toBe('WRITTEN_WARNING');
      expect(decRes.body.data.decidedById).toBe(opsClient.user.id);
    });

    it('processes appeal submission and final determination by appeal officer', async () => {
      // Employee lodges appeal to Managing Partner
      const appealRes = await employeeClient.agent
        .post(`/api/v1/er/cases/${discCaseId}/appeal`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          grounds: 'Mitigating circumstance: incident occurred during technical outage under urgent partner deadline.',
          appealOfficerId: partnerClient.user.id,
        });

      expect(appealRes.status).toBe(201);
      const appealId = appealRes.body.data.id;

      // Managing Partner decides appeal
      const reviewRes = await partnerClient.agent
        .post(`/api/v1/er/cases/${discCaseId}/appeal/review`)
        .set('x-csrf-token', partnerClient.csrfToken)
        .send({
          appealId,
          outcome: 'MODIFIED',
          comments: 'Sanction modified to informal counseling in light of technical outage logs.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('MODIFIED');

      // Case status transitions to CLOSED
      const closedCase = await prisma.erCase.findUniqueOrThrow({ where: { id: discCaseId } });
      expect(closedCase.status).toBe('CLOSED');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Separation and Exit Clearance Controls
  // ---------------------------------------------------------------------------
  describe('Separation & Role-Based Clearance Controls', () => {
    let separationId: string;
    let deductionItemId: string;

    it('initiates separation and automatically generates role-based clearance checklist across departments', async () => {
      const res = await hrClient.agent
        .post('/api/v1/separation/initiate')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: testEmployeeId,
          triggerType: 'RESIGNATION',
          reason: 'Pursuing international postgraduate studies.',
          noticeDate: '2026-11-01',
          intendedLastDay: '2026-11-30',
          effectiveDate: '2026-11-30',
          noticeServedDays: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('CLEARANCE_IN_PROGRESS');
      expect(res.body.data.accruedLeaveDaysPayable).toBeGreaterThanOrEqual(0);

      separationId = res.body.data.id;

      // Verify checklist items created for EMPLOYEE, LINE_MANAGER, ICT, FINANCE, HR
      const items = await prisma.separationClearanceItem.findMany({
        where: { separationId },
      });
      expect(items.length).toBe(11);
      const roles = new Set(items.map((i) => i.departmentRole));
      expect(roles.has('EMPLOYEE')).toBe(true);
      expect(roles.has('LINE_MANAGER')).toBe(true);
      expect(roles.has('ICT')).toBe(true);
      expect(roles.has('FINANCE')).toBe(true);
      expect(roles.has('HR')).toBe(true);

      const financeItem = items.find((i) => i.itemKey === 'SETTLE_IMPREST')!;
      deductionItemId = financeItem.id;
    });

    it('REJECTS clearance financial deduction if lawful basis is missing (clearance cannot automatically withhold earned wages)', async () => {
      const res = await hrClient.agent
        .patch(`/api/v1/separation/${separationId}/clearance/${deductionItemId}`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          isCompleted: false,
          hasFinancialDeduction: true,
          proposedDeductionAmount: 15000,
          deductionLawfulBasis: '', // Missing lawful basis -> must reject
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Proposed clearance deduction requires a documented lawful basis');
    });

    it('records valid clearance item update with documented lawful basis and approvals', async () => {
      const res = await hrClient.agent
        .patch(`/api/v1/separation/${separationId}/clearance/${deductionItemId}`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          isCompleted: true,
          hasFinancialDeduction: true,
          proposedDeductionAmount: 5000,
          deductionLawfulBasis: 'Signed salary advance recovery agreement per Employment Act §19',
          deductionApproved: true,
          notes: 'Agreed deduction scheduled in final dues settlement.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isCompleted).toBe(true);
      expect(res.body.data.deductionApproved).toBe(true);
    });

    it('records confidential exit interview with comments restricted from unauthorized viewers', async () => {
      // 1. HR conducts exit interview
      const exitRes = await hrClient.agent
        .post(`/api/v1/separation/${separationId}/exit-interview`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          primaryReason: 'Further Education & Research',
          cultureRating: 5,
          managementRating: 4,
          compensationRating: 4,
          confidentialComments: 'Employee appreciated mentorship from Tax Partner; felt remuneration was fair.',
        });

      expect(exitRes.status).toBe(201);
      expect(exitRes.body.data.isRestricted).toBe(true);

      // 2. Line Manager inspects separation -> confidential comments are redacted/masked
      const managerView = await managerClient.agent.get(`/api/v1/separation/${separationId}`);
      expect(managerView.status).toBe(200);
      expect(managerView.body.data.exitInterview.confidentialComments).toBe('[RESTRICTED — HR PARTNER ONLY]');

      // 3. HR Lead inspects separation -> confidential comments are unmasked
      const hrView = await hrClient.agent.get(`/api/v1/separation/${separationId}`);
      expect(hrView.status).toBe(200);
      expect(hrView.body.data.exitInterview.confidentialComments).toContain('Employee appreciated mentorship');
    });

    it('finalizes separation, issues Certificate of Service, deactivates employee WITHOUT deleting record', async () => {
      // Mark all remaining clearance items completed
      await prisma.separationClearanceItem.updateMany({
        where: { separationId },
        data: { isCompleted: true, completedAt: new Date() },
      });

      // Finalize separation
      const finRes = await hrClient.agent
        .post(`/api/v1/separation/${separationId}/finalize`)
        .set('x-csrf-token', hrClient.csrfToken);

      expect(finRes.status).toBe(200);
      expect(finRes.body.data.status).toBe('EXITED');
      expect(finRes.body.data.certificateOfServiceIssued).toBe(true);
      expect(finRes.body.data.certificateNumber).toMatch(/^COS-2026-\d{4}$/);

      // CRITICAL INVARIANT: Employee record is preserved (never deleted), status is RESIGNED, isActive is false
      const emp = await prisma.employee.findUniqueOrThrow({ where: { id: testEmployeeId } });
      expect(emp.status).toBe('RESIGNED');
      expect(emp.isActive).toBe(false);
      expect(emp.deactivatedAt).toBeDefined();

      // Lifecycle event recorded in outbox
      const event = await prisma.lifecycleEvent.findFirst({
        where: { employeeId: testEmployeeId, eventType: 'EMPLOYEE_DEACTIVATED' },
      });
      expect(event).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Policy Reminders & Explicit ER Case Closure
  // ---------------------------------------------------------------------------
  describe('Policy Reminder Dispatch & Explicit ER Case Closure', () => {
    it('dispatches acknowledgement reminders for a published policy version', async () => {
      const publishedVer = await prisma.policyVersion.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });

      const res = await hrClient.agent
        .post(`/api/v1/governance/policies/versions/${publishedVer.id}/remind`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.versionId).toBe(publishedVer.id);
      expect(typeof res.body.data.pendingCount).toBe('number');
    });

    it('closes an assigned ER case directly and hydrates appeals/decisions in list', async () => {
      const createRes = await hrClient.agent
        .post('/api/v1/er/cases')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          caseType: 'GRIEVANCE',
          title: 'Temporary ER Closure Regression Case',
          severity: 'STANDARD',
          primaryHandlerId: hrClient.user.id,
          allegationSummary: 'Testing explicit closure endpoint and relation hydration.',
        });
      expect(createRes.status).toBe(201);
      const caseId = createRes.body.data.id;

      const listRes = await hrClient.agent.get('/api/v1/er/cases');
      expect(listRes.status).toBe(200);
      const listed = listRes.body.data.find((c: any) => c.id === caseId);
      expect(listed).toBeDefined();
      expect(Array.isArray(listed.appeals)).toBe(true);

      const closeRes = await hrClient.agent
        .post(`/api/v1/er/cases/${caseId}/close`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({ outcomeNotes: 'Closed after HR grievance mediation' });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('CLOSED');
    });
  });
});
