import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { hashPassword } from '../src/core/auth/password.js';

describe('Performance, Objectives, Development and PIP (Phase 5)', () => {
  const app = getApp();

  let partnerClient: Awaited<ReturnType<typeof loginClient>>;
  let opsClient: Awaited<ReturnType<typeof loginClient>>;
  let hrClient: Awaited<ReturnType<typeof loginClient>>;
  let managerClient: Awaited<ReturnType<typeof loginClient>>;
  let employeeClient: Awaited<ReturnType<typeof loginClient>>;
  let peerClient: Awaited<ReturnType<typeof loginClient>>;

  let employeeOneId: string;
  let managerEmpId: string;
  let peerEmpId: string;
  let activeCycleId: string;

  async function cleanupPerformanceData() {
    await prisma.pipCheckIn.deleteMany();
    await prisma.performanceImprovementPlan.deleteMany();
    await prisma.developmentAction.deleteMany();
    await prisma.developmentPlan.deleteMany();
    await prisma.performancePeerFeedback.deleteMany();
    await prisma.appraisalObjectiveScore.deleteMany();
    await prisma.performanceAppraisal.deleteMany();
    await prisma.performanceObjective.deleteMany();
    await prisma.performanceObjectiveSet.deleteMany();
    await prisma.performanceCycle.deleteMany({
      where: { title: { startsWith: 'TEST-' } },
    });
  }

  beforeAll(async () => {
    await seedDatabase(prisma);
    await cleanupPerformanceData();

    partnerClient = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');
    opsClient = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    hrClient = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    managerClient = await loginClient(app, 'line.manager@ndakalaadvisory.co.ke');
    employeeClient = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const empOne = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'employee.one@ndakalaadvisory.co.ke' },
    });
    employeeOneId = empOne.id;

    const mgr = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
    });
    managerEmpId = mgr.id;

    // Create or find peer user with 'employee' role (which possesses peer_feedback.submit)
    let peerUser = await prisma.user.findUnique({
      where: { email: 'employee.two@ndakalaadvisory.co.ke' },
    });
    if (!peerUser) {
      const pwdHash = await hashPassword('Ndakala@Secure2026!');
      peerUser = await prisma.user.create({
        data: {
          email: 'employee.two@ndakalaadvisory.co.ke',
          name: 'Advisory Associate Two',
          passwordHash: pwdHash,
          departmentId: mgr.departmentId,
          isActive: true,
        },
      });
      const empRole = await prisma.role.findUniqueOrThrow({ where: { key: 'employee' } });
      await prisma.userRoleAssignment.create({
        data: {
          userId: peerUser.id,
          roleId: empRole.id,
          assignedById: hrClient.user.id,
          effectiveFrom: new Date('2024-01-01'),
        },
      });
    }

    let peerEmp = await prisma.employee.findUnique({
      where: { workEmail: 'employee.two@ndakalaadvisory.co.ke' },
    });
    if (!peerEmp) {
      peerEmp = await prisma.employee.create({
        data: {
          employeeNumber: 'SEED-0005',
          userId: peerUser.id,
          firstName: 'Advisory',
          lastName: 'Two',
          workEmail: 'employee.two@ndakalaadvisory.co.ke',
          phoneNumber: '+254700000005',
          status: 'ACTIVE',
          departmentId: mgr.departmentId,
          gradeId: mgr.gradeId,
          locationId: mgr.locationId,
          managerId: mgr.id,
          createdById: hrClient.user.id,
        },
      });
    }
    peerEmpId = peerEmp.id;

    peerClient = await loginClient(app, 'employee.two@ndakalaadvisory.co.ke');

    // Get active cycle from seed
    const activeCycle = await prisma.performanceCycle.findFirst({
      where: { status: 'ACTIVE' },
    });
    if (activeCycle) {
      activeCycleId = activeCycle.id;
    }
  });

  afterAll(async () => {
    await cleanupPerformanceData();
  });

  // ---------------------------------------------------------------------------
  // 1. Performance Rating Scale Reference Data
  // ---------------------------------------------------------------------------
  describe('Performance Rating Scales & Reference Data', () => {
    it('returns the 6 configured rating scales with rating 1 flagged as non-numeric', async () => {
      const res = await employeeClient.agent.get('/api/v1/performance/rating-scales');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(6);

      const scale1 = res.body.data.find((s: any) => s.code === 1);
      expect(scale1.label).toBe('Too Early to Assess');
      expect(scale1.isNumericScore).toBe(false);

      const scale2 = res.body.data.find((s: any) => s.code === 2);
      expect(scale2.label).toBe('Unsatisfactory / Needs Significant Improvement');
      expect(scale2.isNumericScore).toBe(true);

      const scale4 = res.body.data.find((s: any) => s.code === 4);
      expect(scale4.label).toContain('Good');
      expect(scale4.isNumericScore).toBe(true);

      const scale6 = res.body.data.find((s: any) => s.code === 6);
      expect(scale6.label).toContain('Outstanding');
      expect(scale6.isNumericScore).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Cycle Configuration, Guidance & Unapproved Formula Guardrail
  // ---------------------------------------------------------------------------
  describe('Cycle Management, Distribution Guidance & Unapproved Formula Guardrail', () => {
    let testCycleId: string;

    it('creates a performance cycle with 5/10/70/10/5 guidance and non-mandatory quota', async () => {
      const res = await hrClient.agent
        .post('/api/v1/performance/cycles')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          title: 'TEST-FY2026 Q2 Performance Cycle',
          cycleType: 'QUARTERLY',
          periodStart: '2026-04-01',
          periodEnd: '2026-06-30',
          selfAppraisalDeadline: '2026-07-07',
          managerReviewDeadline: '2026-07-15',
          moderationDeadline: '2026-07-22',
          maxObjectivesGuideline: 6,
          allowPeerFeedback: true,
          peerFeedbackPrivacyModel: 'HR_RESTRICTED',
          distributionGuidance: {
            '1': 5,
            '2': 10,
            '3': 70,
            '4': 10,
            '5': 5,
          },
          isDistributionMandatory: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('TEST-FY2026 Q2 Performance Cycle');
      expect(res.body.data.isDistributionMandatory).toBe(false);
      testCycleId = res.body.data.id;
    });

    it('enforces Decision Register guardrail: annualCompositeScore returns null and annualFormulaStatus is PENDING_APPROVAL', async () => {
      const res = await hrClient.agent.get(`/api/v1/performance/cycles/${testCycleId}/metrics`);
      expect(res.status).toBe(200);
      expect(res.body.data.annualFormulaStatus).toBe('PENDING_APPROVAL');
      expect(res.body.data.annualCompositeScore).toBeNull();
      expect(res.body.data.guidanceDistributionPercentages).toBeDefined();
    });

    it('simulates all 4 formula models side-by-side in leadership dry-run sandbox without mutating cycle', async () => {
      const res = await hrClient.agent
        .post(`/api/v1/performance/cycles/${testCycleId}/formula-config/simulate`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          sampleScores: [3, 4, 4, 5],
          customWeights: { Q1: 15, Q2: 20, Q3: 25, Q4: 40 },
          roundingMethod: 'NEAREST_HALF',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.modelsCompared).toHaveLength(4);

      const simple = res.body.data.modelsCompared.find((m: any) => m.model === 'SIMPLE_AVERAGE');
      expect(simple.compositeScore).toBe(4); // (3+4+4+5)/4 = 4.0

      const weighted = res.body.data.modelsCompared.find((m: any) => m.model === 'QUARTERLY_WEIGHTED');
      expect(weighted.compositeScore).toBe(4.5); // 3*0.15 + 4*0.2 + 4*0.25 + 5*0.4 = 0.45 + 0.8 + 1.0 + 2.0 = 4.25 -> 4.5

      const annual = res.body.data.modelsCompared.find((m: any) => m.model === 'ANNUAL_ONLY');
      expect(annual.compositeScore).toBe(5);

      const hybrid = res.body.data.modelsCompared.find((m: any) => m.model === 'HYBRID_SPLIT');
      expect(hybrid.compositeScore).toBe(4.5); // 4.0*0.4 + 5.0*0.6 = 4.6 -> 4.5

      // Dry run must NOT modify status
      expect(res.body.data.currentActiveStatus).toBe('PENDING_APPROVAL');
    });

    it('rejects quarterly formula proposal when weights do not sum to 100%', async () => {
      const res = await hrClient.agent
        .post(`/api/v1/performance/cycles/${testCycleId}/formula-config`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          model: 'QUARTERLY_WEIGHTED',
          weights: { Q1: 20, Q2: 20, Q3: 20, Q4: 20 }, // Sums to 80%!
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Quarterly formula weights must sum to exactly 100%');
    });

    it('successfully records annual formula proposal by Operations Director and keeps score null until partner approval', async () => {
      const res = await opsClient.agent
        .post(`/api/v1/performance/cycles/${testCycleId}/formula-config`)
        .set('x-csrf-token', opsClient.csrfToken)
        .send({
          model: 'QUARTERLY_WEIGHTED',
          weights: { Q1: 15, Q2: 20, Q3: 25, Q4: 40 },
          roundingMethod: 'NEAREST_HALF',
          minCyclesRequired: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.annualFormulaStatus).toBe('PROPOSED');
      expect(res.body.data.annualFormulaModel).toBe('QUARTERLY_WEIGHTED');

      // Metric still null until approved
      const metricsRes = await hrClient.agent.get(`/api/v1/performance/cycles/${testCycleId}/metrics`);
      expect(metricsRes.body.data.annualFormulaStatus).toBe('PROPOSED');
      expect(metricsRes.body.data.annualCompositeScore).toBeNull();
    });

    it('enforces Maker-Checker: Operations Director (author of proposal) CANNOT approve the formula', async () => {
      const res = await opsClient.agent
        .post(`/api/v1/performance/cycles/${testCycleId}/formula-config/approve`)
        .set('x-csrf-token', opsClient.csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Maker-Checker Violation: Author of the annual formula proposal cannot approve it.');
    });

    it('allows Managing Partner to approve and activate the formula', async () => {
      const res = await partnerClient.agent
        .post(`/api/v1/performance/cycles/${testCycleId}/formula-config/approve`)
        .set('x-csrf-token', partnerClient.csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.annualFormulaStatus).toBe('APPROVED');
      expect(res.body.data.formulaApprovedById).toBe(partnerClient.user.id);
    });

    it('evaluates annual composite score live once formula is approved by partner', async () => {
      // Create 2 completed appraisals in this cycle (Rating 4 and Rating 5)
      await prisma.performanceAppraisal.create({
        data: {
          cycleId: testCycleId,
          employeeId: employeeOneId,
          managerId: managerEmpId,
          status: 'PARTNER_APPROVED',
          managerRatingCode: 4,
          moderatedRatingCode: 4,
          selfAchievements: 'Valuation models',
          selfStrengths: JSON.stringify(['Modeling', 'Quality']),
          selfImprovementAreas: JSON.stringify(['Time', 'Speed']),
        },
      });

      await prisma.performanceAppraisal.create({
        data: {
          cycleId: testCycleId,
          employeeId: managerEmpId,
          managerId: managerEmpId,
          status: 'PARTNER_APPROVED',
          managerRatingCode: 5,
          moderatedRatingCode: 5,
          selfAchievements: 'Practice expansion',
          selfStrengths: JSON.stringify(['Leadership', 'Client']),
          selfImprovementAreas: JSON.stringify(['Pacing', 'Scale']),
        },
      });

      const metricsRes = await hrClient.agent.get(`/api/v1/performance/cycles/${testCycleId}/metrics`);
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.body.data.annualFormulaStatus).toBe('APPROVED');
      expect(metricsRes.body.data.annualFormulaModel).toBe('QUARTERLY_WEIGHTED');
      // Numeric ratings are [4, 5]. Weights [15, 20] -> 4*(15/35) + 5*(20/35) = 1.714 + 2.857 = 4.57 -> nearest half = 4.5
      expect(metricsRes.body.data.annualCompositeScore).toBe(4.5);
      expect(metricsRes.body.data.annualCompositeRatingCode).toBe(5);
      expect(metricsRes.body.data.annualCompositeRatingLabel).toContain('Very Good');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Objective Setting Form, Weights, Guidelines & Maker-Checker
  // ---------------------------------------------------------------------------
  describe('Objective Setting Form & Maker-Checker Governance', () => {
    let objectiveSetId: string;

    it('rejects objective set creation when weight percentages do not sum to 100%', async () => {
      const res = await employeeClient.agent
        .post('/api/v1/performance/objectives')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          cycleId: activeCycleId,
          title: 'FY2026 Individual Objectives',
          objectives: [
            {
              title: 'Deliver Project Alpha',
              kpi: 'Complete client deliverables on schedule with 95% stakeholder sign-off',
              behavioursAndValues: 'Client Excellence and Team Collaboration',
              expectedDate: '2026-06-30',
              weightPercent: 40,
              isRealistic: true,
            },
            {
              title: 'Client Satisfaction Score',
              kpi: 'Achieve CSAT of 4.5/5.0 across assigned engagements',
              behavioursAndValues: 'Integrity and Quality Focus',
              expectedDate: '2026-09-30',
              weightPercent: 40, // Sum = 80%, not 100%
              isRealistic: true,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('must sum to exactly 100%');
    });

    it('issues guideline warning when objectives count exceeds 6, while permitting creation', async () => {
      const sevenObjectives = Array.from({ length: 7 }, (_, i) => ({
        title: `Objective ${i + 1}`,
        kpi: `Key performance indicator ${i + 1}`,
        behavioursAndValues: 'Professionalism and Excellence',
        expectedDate: '2026-12-31',
        isRealistic: true,
      }));

      const res = await employeeClient.agent
        .post('/api/v1/performance/objectives')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          cycleId: activeCycleId,
          title: 'FY2026 Extended Objectives (Guideline Test)',
          objectives: sevenObjectives,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.guidelineWarning).toBe(true);
      expect(res.body.data.warningMessage).toContain('exceeds the recommended guideline of 6');
    });

    it('creates a compliant objective set with valid weights and support deadlines', async () => {
      const res = await employeeClient.agent
        .post('/api/v1/performance/objectives')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          cycleId: activeCycleId,
          title: 'FY2026 Advisory Goals - Core Set',
          objectives: [
            {
              title: 'Deliver Financial Advisory Engagements',
              kpi: 'Deliver 3 mid-tier client valuation models within agreed SLA and budget',
              behavioursAndValues: 'Technical Rigour and Transparency',
              expectedDate: '2026-06-30',
              weightPercent: 50,
              isRealistic: true,
              supportRequired: 'Senior Manager quality review on draft model',
              supportAgreedDeadline: '2026-05-15',
            },
            {
              title: 'Business Development & Practice Growth',
              kpi: 'Draft 2 advisory proposals leading to active engagement conversion',
              behavioursAndValues: 'Commercial Acumen and Initiative',
              expectedDate: '2026-09-30',
              weightPercent: 30,
              isRealistic: true,
              supportRequired: 'Access to proposal repository and partner guidance',
              supportAgreedDeadline: '2026-07-01',
            },
            {
              title: 'Professional Learning & Technical Certification',
              kpi: 'Pass advanced financial modeling examination',
              behavioursAndValues: 'Continuous Learning',
              expectedDate: '2026-11-30',
              weightPercent: 20,
              isRealistic: true,
              supportRequired: 'Study leave allowance of 2 days',
              supportAgreedDeadline: '2026-10-15',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.objectives).toHaveLength(3);
      objectiveSetId = res.body.data.id;
    });

    it('allows employee to submit their draft objective set', async () => {
      const res = await employeeClient.agent
        .post(`/api/v1/performance/objectives/${objectiveSetId}/submit`)
        .set('x-csrf-token', employeeClient.csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUBMITTED');
    });

    it('enforces Maker-Checker: Line Manager cannot approve their own objective set', async () => {
      // 1. Manager creates objective set for themselves
      const mgrSetRes = await managerClient.agent
        .post('/api/v1/performance/objectives')
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          employeeId: managerEmpId,
          cycleId: activeCycleId,
          title: 'Manager FY2026 Leadership Objectives',
          objectives: [
            {
              title: 'Practice Leadership',
              kpi: 'Deliver practice targets',
              behavioursAndValues: 'Leadership',
              expectedDate: '2026-12-31',
              weightPercent: 100,
              isRealistic: true,
            },
          ],
        });

      expect(mgrSetRes.status).toBe(201);
      const mgrSetId = mgrSetRes.body.data.id;

      // Submit
      await managerClient.agent
        .post(`/api/v1/performance/objectives/${mgrSetId}/submit`)
        .set('x-csrf-token', managerClient.csrfToken);

      // 2. Manager attempts to approve their OWN objective set
      const approveRes = await managerClient.agent
        .post(`/api/v1/performance/objectives/${mgrSetId}/approve`)
        .set('x-csrf-token', managerClient.csrfToken);

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error.message).toMatch(/Maker-Checker [vV]iolation/);
    });

    it('allows Line Manager to approve the employee objective set', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/objectives/${objectiveSetId}/approve`)
        .set('x-csrf-token', managerClient.csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.managerSignOffAt).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Objective Amendments & Preserving History
  // ---------------------------------------------------------------------------
  describe('Objective Set Amendments & Version History Preservation', () => {
    let originalApprovedSetId: string;

    beforeAll(async () => {
      const set = await prisma.performanceObjectiveSet.findFirstOrThrow({
        where: { employeeId: employeeOneId, status: 'APPROVED' },
      });
      originalApprovedSetId = set.id;
    });

    it('amends an approved objective set by creating Version 2 and preserving Version 1 as SUPERSEDED', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/objectives/${originalApprovedSetId}/amend`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          amendmentReason: 'Client portfolio pivot due to new regulatory audit engagement requiring objective re-weighting.',
          updatedObjectives: [
            {
              title: 'Deliver Statutory Audit & Valuation Advisory',
              kpi: 'Complete 2 statutory audit valuation reviews',
              behavioursAndValues: 'Regulatory Compliance and Precision',
              expectedDate: '2026-08-31',
              weightPercent: 60,
              isRealistic: true,
            },
            {
              title: 'Business Development & Practice Growth',
              kpi: 'Draft 2 advisory proposals',
              behavioursAndValues: 'Commercial Acumen',
              expectedDate: '2026-10-31',
              weightPercent: 40,
              isRealistic: true,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.amendmentReason).toContain('Client portfolio pivot');

      // Verify original set was marked SUPERSEDED and never overwritten
      const originalSet = await prisma.performanceObjectiveSet.findUniqueOrThrow({
        where: { id: originalApprovedSetId },
      });
      expect(originalSet.status).toBe('SUPERSEDED');
      expect(originalSet.version).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Self-Appraisal & Manager Assessment Validation
  // ---------------------------------------------------------------------------
  describe('Self-Appraisal & Manager Appraisal Validation', () => {
    let appraisalId: string;

    it('rejects self-appraisal submission when fewer than 2 strengths or 2 improvement areas are provided', async () => {
      const res = await employeeClient.agent
        .post('/api/v1/performance/appraisals/self')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          cycleId: activeCycleId,
          employeeId: employeeOneId,
          selfAchievements: 'Completed all valuation models on time and assisted senior manager with client onboarding.',
          selfStrengths: ['Financial Modeling'], // Only 1 strength!
          selfImprovementAreas: ['Time management under strict deadlines', 'Delegation skills'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Validation error');
    });

    it('successfully submits self-appraisal with at least 2 strengths and 2 improvement areas', async () => {
      const res = await employeeClient.agent
        .post('/api/v1/performance/appraisals/self')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          cycleId: activeCycleId,
          employeeId: employeeOneId,
          selfAchievements: 'Completed all valuation models on time and assisted senior manager with client onboarding.',
          selfStrengths: ['Complex financial modeling', 'Attention to regulatory detail'],
          selfImprovementAreas: ['Managing multiple simultaneous client requests', 'Public presentation confidence'],
          selfChallenges: 'Unanticipated scope expansions during Q1 advisory contracts.',
          selfSupportRequired: 'Advanced presentation skills executive coaching.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SUBMITTED_SELF');
      expect(res.body.data.selfStrengths).toHaveLength(2);
      expect(res.body.data.selfImprovementAreas).toHaveLength(2);
      appraisalId = res.body.data.id;
    });

    it('enforces Maker-Checker: Employee CANNOT submit a manager appraisal for themselves', async () => {
      const res = await employeeClient.agent
        .post(`/api/v1/performance/appraisals/${appraisalId}/manager`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          managerRatingCode: 4,
          managerStrengths: ['Strong technical skill', 'Reliable execution'],
          managerImprovementAreas: ['Pacing', 'Stakeholder communication'],
        });

      // Employee does not have appraisal.manage_team permission
      expect(res.status).toBe(403);
    });

    it('submits manager appraisal with rating, strengths, improvement areas and meeting notes', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/appraisals/${appraisalId}/manager`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          managerRatingCode: 4, // "Good"
          managerAchievementsComments: 'Demonstrated exceptional quality on financial valuation models.',
          managerStrengths: ['Technical accuracy', 'Willingness to take on complex models'],
          managerImprovementAreas: ['Client presentation skills', 'Prioritisation across projects'],
          managerGeneralComments: 'A solid performer who consistently meets expectations.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUBMITTED_MANAGER');
      expect(res.body.data.managerRatingCode).toBe(4);
      expect(res.body.data.managerStrengths).toHaveLength(2);
    });

    it('records the formal review meeting and agreed development plan', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/appraisals/${appraisalId}/meeting`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          meetingDate: '2026-06-15',
          meetingNotes: 'Discussed Q1/Q2 performance results and agreed on growth objectives for client engagements.',
          developmentAgreement: 'Enroll in client communication workshop and pair with Senior Manager on proposal pitches.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reviewMeetingNotes).toContain('growth objectives');
      expect(res.body.data.developmentAgreement).toContain('communication workshop');
    });

    it('completes HR moderation and Partner final approval', async () => {
      // 1. HR Moderation
      const modRes = await hrClient.agent
        .post(`/api/v1/performance/appraisals/${appraisalId}/moderate`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          moderatedRatingCode: 4,
          moderationNotes: 'Performance is consistent with peer benchmarks in advisory practice.',
        });

      expect(modRes.status).toBe(200);
      expect(modRes.body.data.status).toBe('HR_MODERATED');
      expect(modRes.body.data.moderatedRatingCode).toBe(4);

      // 2. Partner Final Approval
      const appRes = await partnerClient.agent
        .post(`/api/v1/performance/appraisals/${appraisalId}/approve`)
        .set('x-csrf-token', partnerClient.csrfToken);

      expect(appRes.status).toBe(200);
      expect(appRes.body.data.status).toBe('PARTNER_APPROVED');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Rating Aggregation: Rating 1 Excluded From Numeric Averages
  // ---------------------------------------------------------------------------
  describe('Rating Aggregation: Exclusion of Rating 1 (Too Early to Assess)', () => {
    let cycleWithRatingsId: string;

    beforeAll(async () => {
      const cycleRes = await hrClient.agent
        .post('/api/v1/performance/cycles')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          title: 'TEST-Aggregation Cycle 2026',
          cycleType: 'ANNUAL',
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          selfAppraisalDeadline: '2026-12-15',
          managerReviewDeadline: '2026-12-22',
        });
      cycleWithRatingsId = cycleRes.body.data.id;

      // Seed 3 appraisals with ratings:
      // Appraisal 1: Rating 1 ("Too Early to Assess" - non-numeric)
      // Appraisal 2: Rating 4 ("Good" = 4)
      // Appraisal 3: Rating 6 ("Outstanding" = 6)
      // Total appraisals: 3. Completed: 3.
      // Numeric average must be (4 + 6) / 2 = 5.0 (Rating 1 strictly excluded from numeric average!)
      const appraisalsData = [
        { empId: employeeOneId, code: 1 },
        { empId: managerEmpId, code: 4 },
        { empId: peerEmpId, code: 6 },
      ];

      for (const item of appraisalsData) {
        await prisma.performanceAppraisal.create({
          data: {
            cycleId: cycleWithRatingsId,
            employeeId: item.empId,
            managerId: managerEmpId,
            status: 'PARTNER_APPROVED',
            managerRatingCode: item.code,
            moderatedRatingCode: item.code,
            selfAchievements: 'Review achievements',
            selfStrengths: JSON.stringify(['Detail', 'Dedication']),
            selfImprovementAreas: JSON.stringify(['Speed', 'Scale']),
            managerStrengths: JSON.stringify(['Delivery', 'Quality']),
            managerImprovementAreas: JSON.stringify(['Initiative', 'Leadership']),
          },
        });
      }
    });

    it('correctly calculates average excluding Rating 1 and keeps annual composite score null', async () => {
      const res = await hrClient.agent.get(`/api/v1/performance/cycles/${cycleWithRatingsId}/metrics`);
      expect(res.status).toBe(200);

      const metrics = res.body.data;
      expect(metrics.totalAppraisals).toBe(3);
      expect(metrics.completedCount).toBe(3);

      // Distribution count checks
      expect(metrics.ratingCounts[1]).toBe(1);
      expect(metrics.ratingCounts[4]).toBe(1);
      expect(metrics.ratingCounts[6]).toBe(1);

      // Numeric average: (4 + 6) / 2 = 5.0 (Rating 1 excluded!)
      expect(metrics.averageNumericScore).toBe(5);

      // Guardrail: unapproved annual composite formula returns null
      expect(metrics.annualFormulaStatus).toBe('PENDING_APPROVAL');
      expect(metrics.annualCompositeScore).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Peer Feedback & Privacy Model (Anti-Retaliation)
  // ---------------------------------------------------------------------------
  describe('Peer Feedback Request, Submission & Identity Anonymity', () => {
    let testAppraisalId: string;
    let peerFeedbackId: string;

    beforeAll(async () => {
      const app = await prisma.performanceAppraisal.create({
        data: {
          cycleId: activeCycleId,
          employeeId: employeeOneId,
          managerId: managerEmpId,
          status: 'DRAFT_MANAGER',
          selfAchievements: 'Client engagements deliverables',
          selfStrengths: JSON.stringify(['Technical analysis', 'Document drafting']),
          selfImprovementAreas: JSON.stringify(['Time allocation', 'Presentation']),
        },
      });
      testAppraisalId = app.id;
    });

    it('allows Line Manager to request peer feedback for the reviewee', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/appraisals/${testAppraisalId}/peer-feedback/request`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          peerEmployeeId: peerEmpId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.peerEmployeeId).toBe(peerEmpId);
      peerFeedbackId = res.body.data.id;
    });

    it('allows peer to submit their feedback commentary', async () => {
      const res = await peerClient.agent
        .post(`/api/v1/performance/peer-feedback/${peerFeedbackId}/submit`)
        .set('x-csrf-token', peerClient.csrfToken)
        .send({
          peerEmployeeId: peerEmpId,
          feedbackText: 'Colleague was highly collaborative during the inter-departmental advisory valuation review.',
          strengths: 'Thorough analytical verification and timely response to audit inquiries.',
          improvementAreas: 'Could provide earlier notice on draft updates before client submission.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.submittedAt).toBeDefined();
    });

    it('anonymises peer identity when the reviewee inspects their appraisal to prevent retaliation', async () => {
      const res = await employeeClient.agent.get(`/api/v1/performance/appraisals/${testAppraisalId}`);
      expect(res.status).toBe(200);

      const feedback = res.body.data.peerFeedbacks[0];
      expect(feedback.feedbackText).toContain('Colleague was highly collaborative');
      // Anti-retaliation invariant: peer identity is hidden from reviewee
      expect(feedback.peerEmployeeId).toBe('[ANONYMISED / IDENTITY PROTECTED FROM REVIEWEE]');
    });

    it('preserves full peer identity when HR Lead / Executive inspects the appraisal', async () => {
      const res = await hrClient.agent.get(`/api/v1/performance/appraisals/${testAppraisalId}`);
      expect(res.status).toBe(200);

      const feedback = res.body.data.peerFeedbacks[0];
      expect(feedback.peerEmployeeId).toBe(peerEmpId);
    });

    it('blocks unauthorized employee from viewing another employees appraisal', async () => {
      const res = await peerClient.agent.get(`/api/v1/performance/appraisals/${testAppraisalId}`);
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Access denied');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Development Actions Linked to Training
  // ---------------------------------------------------------------------------
  describe('Development Plans & Action Items', () => {
    let actionId: string;

    it('records a development action linked to a training programme without duplicate modules', async () => {
      let prog = await prisma.trainingProgramme.findFirst();
      if (!prog) {
        prog = await prisma.trainingProgramme.create({
          data: {
            code: 'TRN-DEV-001',
            name: 'Advisory Financial Modeling & Valuation',
            category: 'ROLE_SPECIFIC',
          },
        });
      }

      const res = await managerClient.agent
        .post('/api/v1/performance/development/actions')
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          objective: 'Enhance valuation modeling efficiency',
          actionDescription: 'Complete advanced Excel valuation and sensitivity analysis training.',
          targetDate: '2026-08-31',
          supportRequired: 'Tuition sponsorship and study hours',
          linkedTrainingProgrammeId: prog.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.actionDescription).toContain('valuation and sensitivity analysis');
      expect(res.body.data.isCompleted).toBe(false);
      expect(res.body.data.linkedTrainingProgrammeId).toBe(prog.id);
      actionId = res.body.data.id;
    });

    it('completes a development action with verifiable evidence', async () => {
      const res = await managerClient.agent
        .patch(`/api/v1/performance/development/actions/${actionId}/complete`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          evidence: 'Certificate of completion received and verified on 2026-08-25.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isCompleted).toBe(true);
      expect(res.body.data.evidence).toContain('Certificate of completion');
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Performance Improvement Plan (PIP) - Strict Governance & Capability Invariants
  // ---------------------------------------------------------------------------
  describe('Performance Improvement Plan (PIP) Governance & Guardrails', () => {
    let pipId: string;

    it('rejects PIP duration exceeding 3 months (enforces 1 to 3 months policy maximum)', async () => {
      const res = await hrClient.agent
        .post('/api/v1/performance/pip')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          lineManagerId: managerEmpId,
          triggerReason: 'FIRST_TIME_RATING_2',
          durationMonths: 4, // Exceeds 3 months maximum per approved policy
          startDate: '2026-07-01',
          endDate: '2026-10-31',
          baselineAssessment: 'Performance rating 2 in FY2026 Q1 review indicating capability gaps in client deliverables.',
          smartTargets: [
            {
              target: 'Submit error-free valuation models',
              measurement: 'Zero critical formula errors across 5 consecutive client reviews',
              dueDate: '2026-09-30',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('PIP duration must be between 1 and 3 months');
    });

    it('successfully initiates PIP with capability invariant and 3-month duration', async () => {
      const res = await hrClient.agent
        .post('/api/v1/performance/pip')
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          lineManagerId: managerEmpId,
          triggerReason: 'FIRST_TIME_RATING_2',
          durationMonths: 3,
          startDate: '2026-07-01',
          endDate: '2026-09-30',
          baselineAssessment: 'Performance rating 2 in FY2026 Q1 review with specific deficits in valuation modelling timeliness.',
          smartTargets: [
            {
              target: 'Deliver financial models within agreed timeline',
              measurement: '100% adherence to project delivery deadlines across 3 test engagements',
              supportRequired: 'Weekly 1:1 check-in with Senior Manager',
              dueDate: '2026-09-30',
            },
            {
              target: 'Achieve zero formula syntax errors on valuation spreadsheets',
              measurement: 'Passed quality assurance checklists on all client deliverables',
              supportRequired: 'Provision of standardized valuation template',
              dueDate: '2026-09-30',
            },
          ],
          supportAndTrainingNotes: 'Weekly coaching by Line Manager and peer review by senior associate.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.durationMonths).toBe(3);
      // Capability invariant: PIP is capability, NOT disciplinary
      expect(res.body.data.isCapabilityProcess).toBe(true);
      pipId = res.body.data.id;
    });

    it('records employee refusal-to-sign with reason while preserving PIP active status', async () => {
      const res = await employeeClient.agent
        .post(`/api/v1/performance/pip/${pipId}/acknowledge`)
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: employeeOneId,
          refuseToSign: true,
          refusalReason: 'I dispute the timeliness evaluation due to client-side delays outside my control, but agree to participate in weekly coaching.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.employeeRefusalToSign).toBe(true);
      expect(res.body.data.refusalReason).toContain('I dispute the timeliness evaluation');
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('records Month 1 structured check-in with review evidence', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/pip/${pipId}/check-ins`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          checkInMonth: 1,
          scheduledDate: '2026-07-31',
          conductedDate: '2026-07-31',
          managerReviewEvidence: 'Employee attended all weekly coaching sessions. Delivered Project Beta model on time with minor formatting issues.',
          progressStatus: 'PARTIAL',
          employeeComments: 'Coaching on formula structure has been helpful.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.checkInMonth).toBe(1);
      expect(res.body.data.progressStatus).toBe('PARTIAL');
    });

    it('records Month 2 structured check-in with satisfactory progress', async () => {
      const res = await managerClient.agent
        .post(`/api/v1/performance/pip/${pipId}/check-ins`)
        .set('x-csrf-token', managerClient.csrfToken)
        .send({
          checkInMonth: 2,
          scheduledDate: '2026-08-31',
          conductedDate: '2026-08-31',
          managerReviewEvidence: 'Employee achieved 100% on-time delivery across two engagements with zero critical formula defects.',
          progressStatus: 'SATISFACTORY',
          employeeComments: 'Feel confident in the standardized template workflow.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.checkInMonth).toBe(2);
      expect(res.body.data.progressStatus).toBe('SATISFACTORY');
    });

    it('requires human authorization for PIP outcome and does NOT automatically terminate or penalize', async () => {
      // HR Lead has pip.decide authority
      const res = await hrClient.agent
        .post(`/api/v1/performance/pip/${pipId}/outcome`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({
          outcomeRecommendation: 'CLEARANCE',
          outcomeNotes: 'Employee has demonstrated sustained improvement, met all SMART targets, and is cleared from PIP.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUCCESSFUL_COMPLETION');
      expect(res.body.data.outcomeRecommendation).toBe('CLEARANCE');
      expect(res.body.data.outcomeNotes).toContain('sustained improvement');

      // Verify safety invariant in database: Employee record remains ACTIVE and employed
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { id: employeeOneId },
      });
      expect(employee.status).toBe('ACTIVE');
      expect(employee.isActive).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Performance Scoped Dashboard
  // ---------------------------------------------------------------------------
  describe('Scoped Performance Dashboards', () => {
    it('returns manager-scoped dashboard with reporting line team performance', async () => {
      const res = await managerClient.agent.get('/api/v1/performance/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.data.scope).toBe('MANAGER');
      expect(res.body.data.activeCycle).toBeDefined();
      expect(res.body.data.pipSummary).toBeDefined();
    });

    it('returns employee-scoped dashboard with personal appraisals and development items', async () => {
      const res = await employeeClient.agent.get('/api/v1/performance/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.data.scope).toBe('EMPLOYEE');
      expect(res.body.data.activeCycle).toBeDefined();
      expect(res.body.data.pipSummary).toBeDefined();
    });

    it('returns executive-scoped dashboard with organisation-wide cycle progress', async () => {
      const res = await partnerClient.agent.get('/api/v1/performance/dashboard');
      expect(res.status).toBe(200);
      expect(res.body.data.scope).toBe('ORGANISATION');
      expect(res.body.data.activeCycle).toBeDefined();
    });

    it('returns non-empty scoped operational lists for appraisals, objectives, pips, and development actions', async () => {
      const [appRes, objRes, pipRes, devRes] = await Promise.all([
        employeeClient.agent.get('/api/v1/performance/appraisals'),
        employeeClient.agent.get('/api/v1/performance/objectives'),
        employeeClient.agent.get('/api/v1/performance/pips'),
        employeeClient.agent.get('/api/v1/performance/development/actions'),
      ]);

      expect(appRes.status).toBe(200);
      expect(appRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(appRes.body.data.every((a: any) => a.employeeId === employeeOneId)).toBe(true);

      expect(objRes.status).toBe(200);
      expect(objRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(objRes.body.data.every((o: any) => o.employeeId === employeeOneId)).toBe(true);

      expect(pipRes.status).toBe(200);
      expect(pipRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(pipRes.body.data[0].checkIns.length).toBeGreaterThanOrEqual(1);

      expect(devRes.status).toBe(200);
      expect(devRes.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('returns pending peer feedback requests scoped to the designated peer', async () => {
      const res = await peerClient.agent.get('/api/v1/performance/peer-feedback/pending');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].peerEmployeeId).toBe(peerEmpId);
    });

    it('blocks an employee from creating objectives or submitting self-appraisal for another employee', async () => {
      const objRes = await employeeClient.agent
        .post('/api/v1/performance/objectives')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          employeeId: peerEmpId,
          title: 'Unauthorized Target Sheet',
          objectives: [
            {
              title: 'Sample',
              kpi: 'Sample KPI',
              behavioursAndValues: 'Integrity',
              expectedDate: '2026-12-31',
              weightPercent: 100,
              isRealistic: true,
            },
          ],
        });
      expect(objRes.status).toBe(403);

      const selfRes = await employeeClient.agent
        .post('/api/v1/performance/appraisals/self')
        .set('x-csrf-token', employeeClient.csrfToken)
        .send({
          cycleId: activeCycleId,
          employeeId: peerEmpId,
          selfAchievements: 'Attempting cross-employee self appraisal submission',
          selfStrengths: ['Strength one', 'Strength two'],
          selfImprovementAreas: ['Improvement one', 'Improvement two'],
        });
      expect(selfRes.status).toBe(403);
    });
  });
});
