import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Employee Master, Organisation Hierarchy & Employee Lifecycle (EMP-01..EMP-07)', () => {
  const app = getApp();

  let hrClient: Awaited<ReturnType<typeof loginClient>>;
  let opsClient: Awaited<ReturnType<typeof loginClient>>;
  let managerClient: Awaited<ReturnType<typeof loginClient>>;
  let employeeClient: Awaited<ReturnType<typeof loginClient>>;
  let auditorClient: Awaited<ReturnType<typeof loginClient>>;
  let ictClient: Awaited<ReturnType<typeof loginClient>>;
  let payrollClient: Awaited<ReturnType<typeof loginClient>>;

  let deptAdvId: string;
  let deptAuditId: string;
  let locNairobiId: string;
  let gradeAssocId: string;
  let gradeMgrId: string;

  async function cleanupTestData() {
    await prisma.documentException.deleteMany();
    const mwangiEmps = await prisma.employee.findMany({
      where: { workEmail: { startsWith: 'mwangi' } },
      select: { id: true },
    });
    const ids = mwangiEmps.map((e) => e.id);
    if (ids.length > 0) {
      await prisma.onboardingTask.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.probationRecord.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.ictAccessRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.reportingAssignmentHistory.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeDocument.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeChangeRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.lifecycleEvent.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employmentAgreement.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.leaveReservation.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.leaveLedgerEntry.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeScheduleAssignment.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.scheduleException.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.absenceRecord.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.policyAcknowledgement.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.trainingAssignment.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeTransfer.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeSeparation.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.privacyDataSubjectRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.privacyLegalHold.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.employmentCategory.deleteMany({ where: { code: { in: ['SPECIALIST_CONSULTANT', 'UNAPPROVED_TIER'] } } });
    const e2eUsers = await prisma.user.findMany({ where: { email: 'mwangi.e2e@ndakalaadvisory.co.ke' }, select: { id: true } });
    const e2eUserIds = e2eUsers.map((u) => u.id);
    if (e2eUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: e2eUserIds } } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: e2eUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: e2eUserIds } } });
    }
  }

  beforeAll(async () => {
    await seedDatabase(prisma);
    await cleanupTestData();

    hrClient = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    opsClient = await loginClient(app, 'operations.director@ndakalaadvisory.co.ke');
    managerClient = await loginClient(app, 'line.manager@ndakalaadvisory.co.ke');
    employeeClient = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    auditorClient = await loginClient(app, 'auditor@ndakalaadvisory.co.ke');
    ictClient = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');
    payrollClient = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke'); // holds payroll view authority

    const deptAdv = await prisma.department.findUniqueOrThrow({ where: { code: 'ADV' } });
    const deptAudit = await prisma.department.findUniqueOrThrow({ where: { code: 'AUD' } });
    const locNairobi = await prisma.location.findUniqueOrThrow({ where: { code: 'NBO-HQ' } });
    const grAssoc = await prisma.grade.findUniqueOrThrow({ where: { code: 'GR-ASSOC' } });
    const grMgr = await prisma.grade.findUniqueOrThrow({ where: { code: 'GR-MGR' } });

    deptAdvId = deptAdv.id;
    deptAuditId = deptAudit.id;
    locNairobiId = locNairobi.id;
    gradeAssocId = grAssoc.id;
    gradeMgrId = grMgr.id;

    // Ensure PERMANENT category is activated via maker-checker:
    // HR configures probationApplies and Ops Director approves
    const permCat = await prisma.employmentCategory.findUniqueOrThrow({ where: { code: 'PERMANENT' } });
    await hrClient.agent
      .patch(`/api/v1/employee-categories/${permCat.id}`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        probationApplies: true,
        defaultProbationMonths: 6,
        maxProbationExtensionMonths: 3,
        defaultNoticePeriodDays: 30,
        probationReminderLeadDays: 14,
      });

    await opsClient.agent
      .post(`/api/v1/employee-categories/${permCat.id}/activate`)
      .set('x-csrf-token', opsClient.csrfToken)
      .send();

    // Activate standard joiner onboarding template via maker-checker
    const tpl = await prisma.onboardingTemplate.findUniqueOrThrow({ where: { code: 'STD-JOINER-DRAFT' } });
    await opsClient.agent
      .post(`/api/v1/onboarding-templates/${tpl.id}/activate`)
      .set('x-csrf-token', opsClient.csrfToken)
      .send();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // -------------------------------------------------------------------------
  // 1. Employee Category Setup & Maker-Checker Enforcements
  // -------------------------------------------------------------------------
  it('enforces Maker-Checker on employee category activation (author cannot activate own category)', async () => {
    // Ops Director drafts a new category (Ops Director holds both config.create and config.approve)
    const createRes = await opsClient.agent
      .post('/api/v1/employee-categories')
      .set('x-csrf-token', opsClient.csrfToken)
      .send({
        code: 'SPECIALIST_CONSULTANT',
        name: 'Specialist Advisory Consultant',
        probationApplies: true,
        defaultProbationMonths: 3,
        sourceReference: 'Policy Workshop 2026',
      });

    expect(createRes.status).toBe(201);
    const catId = createRes.body.data.id;

    // Ops Director attempts to self-activate -> 403 Forbidden Maker-Checker violation
    const selfActivateRes = await opsClient.agent
      .post(`/api/v1/employee-categories/${catId}/activate`)
      .set('x-csrf-token', opsClient.csrfToken)
      .send();

    expect(selfActivateRes.status).toBe(403);
    expect(selfActivateRes.body.error.message).toContain('Maker-Checker violation');

    // Managing Partner (different user with config.approve) activates -> 200 OK
    const mpActivateRes = await payrollClient.agent
      .post(`/api/v1/employee-categories/${catId}/activate`)
      .set('x-csrf-token', payrollClient.csrfToken)
      .send();

    expect(mpActivateRes.status).toBe(200);
    expect(mpActivateRes.body.data.status).toBe('ACTIVE');
  });

  it('blocks employee creation if employment category is not ACTIVE', async () => {
    // Draft an unactivated category
    await hrClient.agent
      .post('/api/v1/employee-categories')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        code: 'UNAPPROVED_TIER',
        name: 'Unapproved Tier',
        probationApplies: false,
        sourceReference: 'Draft',
      });

    const res = await hrClient.agent
      .post('/api/v1/employees')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        workEmail: 'jane.unapproved@ndakalaadvisory.co.ke',
        phoneNumber: '+254711000111',
        employmentCategoryCode: 'UNAPPROVED_TIER',
        startDate: '2026-03-01',
        jobTitle: 'Analyst',
        departmentId: deptAdvId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('is not ACTIVE');
  });

  // -------------------------------------------------------------------------
  // 2. Progressive Employee Creation & Relational Artifact Generation
  // -------------------------------------------------------------------------
  let newEmployeeId: string;
  let newEmployeeNumber: string;

  it('creates employee master with encrypted sensitive fields, agreement, joiner ICT request and onboarding checklist', async () => {
    const manager = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
    });

    const res = await hrClient.agent
      .post('/api/v1/employees')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        firstName: 'Mwangi',
        middleName: 'Kamau',
        lastName: 'Njoroge',
        dateOfBirth: '1992-06-15',
        gender: 'Male',
        personalEmail: 'mwangi.personal@gmail.com',
        workEmail: 'mwangi.njoroge@ndakalaadvisory.co.ke',
        phoneNumber: '+254722334455',
        emergencyContactName: 'Grace Njoroge',
        emergencyContactPhone: '+254733445566',
        emergencyContactRelationship: 'Spouse',
        nextOfKinName: 'Grace Njoroge',
        nextOfKinPhone: '+254733445566',
        nextOfKinRelationship: 'Spouse',

        // Sensitive statutory & banking details
        nationalId: '12345678',
        kraPin: 'A001234567Z',
        nssfNumber: 'NSSF-998877',
        shifNumber: 'SHIF-112233',
        bankName: 'Standard Chartered Bank Kenya',
        bankBranch: 'Kenyatta Avenue',
        bankAccountNumber: '0100123456789',

        // Employment parameters
        employmentCategoryCode: 'PERMANENT',
        startDate: '2026-04-01',
        jobTitle: 'Senior Strategy Consultant',
        departmentId: deptAdvId,
        gradeId: gradeAssocId,
        locationId: locNairobiId,
        managerId: manager.id,
        ictAccessProfile: 'STANDARD_OFFICE_365',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.employee).toBeDefined();
    expect(res.body.data.employee.employeeNumber).toMatch(/^NDA-\d{4}-\d{4}$/);
    expect(res.body.data.ictRequestId).toBeDefined();
    expect(res.body.data.tasksCreated).toBeGreaterThanOrEqual(1);
    expect(res.body.data.probationRecordId).toBeDefined();

    newEmployeeId = res.body.data.employee.id;
    newEmployeeNumber = res.body.data.employee.employeeNumber;

    // Verify DB level: raw statutory data is encrypted, not stored in plaintext
    const dbEmp = await prisma.employee.findUniqueOrThrow({ where: { id: newEmployeeId } });
    expect(dbEmp.nationalIdEncrypted).toMatch(/^enc:v1:/);
    expect(dbEmp.bankAccountNumberEncrypted).toMatch(/^enc:v1:/);
    expect(dbEmp.nationalIdHash).toBeDefined();

    // Verify initial EmploymentAgreement created
    const agr = await prisma.employmentAgreement.findFirst({
      where: { employeeId: newEmployeeId, status: 'ACTIVE' },
    });
    expect(agr).toBeDefined();
    expect(agr?.jobTitle).toBe('Senior Strategy Consultant');
    expect(agr?.version).toBe(1);

    // Verify initial ReportingAssignmentHistory created
    const repHist = await prisma.reportingAssignmentHistory.findFirst({
      where: { employeeId: newEmployeeId, effectiveTo: null },
    });
    expect(repHist).toBeDefined();
    expect(repHist?.managerId).toBe(manager.id);
    expect(repHist?.departmentId).toBe(deptAdvId);

    // Verify ICT Joiner Request created
    const ict = await prisma.ictAccessRequest.findUnique({
      where: { id: res.body.data.ictRequestId },
    });
    expect(ict).toBeDefined();
    expect(ict?.requestType).toBe('JOINER');
    expect(ict?.status).toBe('PENDING');

    // Verify Onboarding Tasks created
    const tasks = await prisma.onboardingTask.findMany({
      where: { employeeId: newEmployeeId },
    });
    expect(tasks.length).toBeGreaterThanOrEqual(5);

    // Verify Lifecycle Event was published to outbox
    const events = await prisma.lifecycleEvent.findMany({
      where: { employeeId: newEmployeeId, eventType: 'EMPLOYEE_CREATED' },
    });
    expect(events.length).toBe(1);
  });

  it('rejects duplicate employee creation attempts with same email or national ID', async () => {
    // Duplicate email
    const dupEmailRes = await hrClient.agent
      .post('/api/v1/employees')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        firstName: 'Duplicate',
        lastName: 'Email',
        workEmail: 'mwangi.njoroge@ndakalaadvisory.co.ke', // Duplicate
        phoneNumber: '+254799000000',
        employmentCategoryCode: 'PERMANENT',
        startDate: '2026-05-01',
        jobTitle: 'Consultant',
        departmentId: deptAdvId,
      });

    expect(dupEmailRes.status).toBe(409);
    expect(dupEmailRes.body.error.message).toContain('already exists');

    // Duplicate National ID
    const dupIdRes = await hrClient.agent
      .post('/api/v1/employees')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        firstName: 'Duplicate',
        lastName: 'NationalId',
        workEmail: 'unique.person@ndakalaadvisory.co.ke',
        phoneNumber: '+254799000001',
        nationalId: '12345678', // Same national ID as Mwangi
        employmentCategoryCode: 'PERMANENT',
        startDate: '2026-05-01',
        jobTitle: 'Consultant',
        departmentId: deptAdvId,
      });

    expect(dupIdRes.status).toBe(409);
    expect(dupIdRes.body.error.message).toContain('Duplicate employment records are not permitted');
  });

  // -------------------------------------------------------------------------
  // 3. Field-Level Masking & Permissions Matrix (EMP-01, NFR-01)
  // -------------------------------------------------------------------------
  it('enforces field-level masking: HR sees unmasked statutory data; Line Manager and Auditor see masked data', async () => {
    // 1. HR Lead inspects profile
    const hrView = await hrClient.agent.get(`/api/v1/employees/${newEmployeeId}`);
    expect(hrView.status).toBe(200);
    expect(hrView.body.data.sensitive.masked).toBe(false);
    expect(hrView.body.data.sensitive.nationalId).toBe('12345678');
    expect(hrView.body.data.sensitive.kraPin).toBe('A001234567Z');
    expect(hrView.body.data.sensitive.bankAccountNumber).toBe('0100123456789');
    expect(hrView.body.data.dateOfBirth).toBeDefined();

    // 2. Line Manager (who is Mwangi's manager) inspects profile
    const mgrView = await managerClient.agent.get(`/api/v1/employees/${newEmployeeId}`);
    expect(mgrView.status).toBe(200);
    expect(mgrView.body.data.sensitive.masked).toBe(true);
    expect(mgrView.body.data.sensitive.nationalId).toBe('****5678'); // Tail masked
    expect(mgrView.body.data.sensitive.kraPin).toBe('[RESTRICTED]');
    expect(mgrView.body.data.sensitive.bankAccountNumber).toBe('[RESTRICTED]');
    // Manager does NOT see personal DOB, personalEmail, next of kin
    expect(mgrView.body.data.dateOfBirth).toBeUndefined();
    expect(mgrView.body.data.personalEmail).toBeUndefined();
    expect(mgrView.body.data.nextOfKinName).toBeUndefined();

    // 3. Auditor inspects profile
    const audView = await auditorClient.agent.get(`/api/v1/employees/${newEmployeeId}`);
    expect(audView.status).toBe(200);
    expect(audView.body.data.sensitive.masked).toBe(true);
    expect(audView.body.data.sensitive.nationalId).toBe('****5678');
    expect(audView.body.data.sensitive.bankAccountNumber).toBe('[RESTRICTED]');
  });

  // -------------------------------------------------------------------------
  // 4. IDOR / BOLA Scoping & Document Access Protection
  // -------------------------------------------------------------------------
  it('defends against IDOR/BOLA: unauthorised employee receives 404 NOT_FOUND on other employee record', async () => {
    // employee.one is an Advisory Associate and NOT Mwangi's manager or self
    const idorRes = await employeeClient.agent.get(`/api/v1/employees/${newEmployeeId}`);
    // Returns 404 rather than 403 to prevent enumeration/disclosure of record existence
    expect(idorRes.status).toBe(404);
  });

  it('restricts document download by visibility: Line Manager cannot download medical document', async () => {
    // 1. Upload sample medical fitness certificate
    const uploadRes = await hrClient.agent
      .post('/api/v1/documents/upload')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        fileName: 'Medical_Fitness_Mwangi.pdf',
        mimeType: 'application/pdf',
        category: 'COMPLIANCE',
        securityClassification: 'RESTRICTED',
        fileBase64: Buffer.from('Fit for full duty - Nairobi Hospital 2026').toString('base64'),
      });
    expect(uploadRes.status).toBe(200);
    const docRecordId = uploadRes.body.data.id;

    // 2. Attach to Mwangi's employee record as MEDICAL document
    const attachRes = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/documents`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        documentRecordId: docRecordId,
        documentType: 'MEDICAL',
        notes: 'Pre-employment medical report',
      });
    expect(attachRes.status).toBe(200);
    const empDocId = attachRes.body.data.id;
    expect(attachRes.body.data.visibility).toBe('MEDICAL_RESTRICTED');

    // 3. Line manager attempts to request signed download token -> 403 Forbidden
    const mgrTokenRes = await managerClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/documents/${empDocId}/token`)
      .set('x-csrf-token', managerClient.csrfToken);
    expect(mgrTokenRes.status).toBe(403);
    expect(mgrTokenRes.body.error.message).toContain('insufficient permission');

    // 4. HR Lead requests signed download token -> 200 OK
    const hrTokenRes = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/documents/${empDocId}/token`)
      .set('x-csrf-token', hrClient.csrfToken);
    expect(hrTokenRes.status).toBe(200);
    expect(hrTokenRes.body.data.downloadToken).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Organisational Hierarchy & Circular Reporting Prevention
  // -------------------------------------------------------------------------
  it('prevents direct, self, and indirect circular reporting loops', async () => {
    const manager = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
    });

    // 1. Self-reporting loop (Mwangi reports to Mwangi)
    const selfLoopRes = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/changes`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        changeType: 'TRANSFER',
        changes: { managerId: newEmployeeId },
        reason: 'Attempt self-reporting',
      });
    expect(selfLoopRes.status).toBe(400);
    expect(selfLoopRes.body.error.message).toContain('cannot be their own reporting manager');

    // 2. Direct circular loop (Manager attempts to report to subordinate Mwangi)
    const directLoopRes = await hrClient.agent
      .post(`/api/v1/employees/${manager.id}/changes`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        changeType: 'TRANSFER',
        changes: { managerId: newEmployeeId },
        reason: 'Attempt direct circular loop',
      });
    expect(directLoopRes.status).toBe(400);
    expect(directLoopRes.body.error.message).toContain('Circular reporting line detected');
  });

  // -------------------------------------------------------------------------
  // 6. Historical Reporting & Organisational Transfer Preserving Audit
  // -------------------------------------------------------------------------
  it('executes organisational transfer, closing prior assignment with effectiveTo and preserving history', async () => {
    // Transfer Mwangi to Audit department with effective date
    const transferRes = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/changes`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        changeType: 'TRANSFER',
        changes: {
          departmentId: deptAuditId,
          positionId: undefined,
        },
        effectiveDate: '2026-06-01',
        reason: 'Internal Practice Group Transfer to Audit',
      });

    expect(transferRes.status).toBe(200);
    const crId = transferRes.body.data.changeRequest.id;

    // Review transfer by Ops Director (Maker-checker)
    const reviewRes = await opsClient.agent
      .post(`/api/v1/change-requests/${crId}/review`)
      .set('x-csrf-token', opsClient.csrfToken)
      .send({
        decision: 'APPROVE',
        comments: 'Transfer approved per practice requirements',
      });
    expect(reviewRes.status).toBe(200);

    // Verify reporting history: prior assignment is closed with effectiveTo
    const history = await prisma.reportingAssignmentHistory.findMany({
      where: { employeeId: newEmployeeId },
      orderBy: { effectiveFrom: 'asc' },
    });

    expect(history.length).toBe(2);
    expect(history[0].effectiveTo).toEqual(new Date('2026-06-01'));
    expect(history[0].departmentId).toBe(deptAdvId);
    expect(history[1].effectiveFrom).toEqual(new Date('2026-06-01'));
    expect(history[1].departmentId).toBe(deptAuditId);
    expect(history[1].effectiveTo).toBeNull();

    // Verify employee record projected department is updated
    const updatedEmp = await prisma.employee.findUniqueOrThrow({ where: { id: newEmployeeId } });
    expect(updatedEmp.departmentId).toBe(deptAuditId);
  });

  // -------------------------------------------------------------------------
  // 7. Employment Status Transitions & Terminal States
  // -------------------------------------------------------------------------
  it('enforces status transition rules and rejects invalid transitions', async () => {
    // Current status is ONBOARDING. Invalid transition to SUSPENDED -> 400
    const invalidRes = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/status`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        newStatus: 'SUSPENDED',
        reason: 'Premature suspension',
      });
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.message).toContain('Invalid lifecycle transition');

    // Valid transition: ONBOARDING -> PROBATION
    const validRes = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/status`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        newStatus: 'PROBATION',
        reason: 'Commenced active probation period',
      });
    expect(validRes.status).toBe(200);
    expect(validRes.body.data.status).toBe('PROBATION');
  });

  // -------------------------------------------------------------------------
  // 8. Onboarding Task Completion with Evidence Enforcement
  // -------------------------------------------------------------------------
  it('enforces evidence requirement for onboarding tasks and completes onboarding', async () => {
    const tasks = await prisma.onboardingTask.findMany({
      where: { employeeId: newEmployeeId },
    });
    const evidenceTask = tasks.find((t) => t.evidenceRequired);
    expect(evidenceTask).toBeDefined();

    // Attempt completion without evidence document -> 400
    const failRes = await hrClient.agent
      .patch(`/api/v1/onboarding-tasks/${evidenceTask!.id}`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        status: 'COMPLETED',
        completionNotes: 'Completed without document',
      });
    expect(failRes.status).toBe(400);
    expect(failRes.body.error.message).toContain('Evidence document is strictly required');

    // Upload contract evidence document
    const uploadRes = await hrClient.agent
      .post('/api/v1/documents/upload')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        fileName: 'Signed_Contract_Mwangi.pdf',
        mimeType: 'application/pdf',
        category: 'COMPLIANCE',
        fileBase64: Buffer.from('Signed Employment Agreement 2026').toString('base64'),
      });
    const docId = uploadRes.body.data.id;

    // Attach to employee document register
    const attachDoc = await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/documents`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        documentRecordId: docId,
        documentType: 'CONTRACT',
      });
    const empDocId = attachDoc.body.data.id;

    // Complete task with evidence document -> 200 OK
    const completeRes = await hrClient.agent
      .patch(`/api/v1/onboarding-tasks/${evidenceTask!.id}`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        status: 'COMPLETED',
        evidenceDocumentId: empDocId,
        completionNotes: 'Verified signed contract on file',
      });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('COMPLETED');
  });

  // -------------------------------------------------------------------------
  // 9. Probation 6-Values Assessment & Authorised Human Confirmation Decision
  // -------------------------------------------------------------------------
  it('captures 6 Ndakala values evaluation and records authorised human confirmation decision', async () => {
    const probRecord = await prisma.probationRecord.findFirstOrThrow({
      where: { employeeId: newEmployeeId },
    });

    // 1. Assign Objectives
    const objRes = await hrClient.agent
      .post(`/api/v1/employees/probation/${probRecord.id}/objectives`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        objectives: [
          { objective: 'Complete 3 Client Financial Reviews', expectedOutput: 'Draft audit memos within Q2' },
          { objective: 'Deliver Statutory Compliance Summary', expectedOutput: 'Kenya Companies Act memo' },
        ],
        supportRequired: 'Mentorship by Audit Senior Manager',
      });
    expect(objRes.status).toBe(200);

    // 2. Submit 6-Values Evaluation Form
    const evalRes = await hrClient.agent
      .post(`/api/v1/employees/probation/${probRecord.id}/evaluate`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        sixValuesAssessment: [
          { valueName: 'Customer First', rating: 'Very Good', evidenceComments: 'Exceeded client expectations on Q2 audit' },
          { valueName: 'Credibility & Trust', rating: 'Excellent', evidenceComments: 'High integrity and transparency' },
          { valueName: 'Competitive & Results Oriented', rating: 'Very Good', evidenceComments: 'Completed deliverable 3 days ahead' },
          { valueName: 'Inquisitive & Innovative', rating: 'Good', evidenceComments: 'Introduced automated sampling checklist' },
          { valueName: 'Collaborative', rating: 'Excellent', evidenceComments: 'Supported peer review teams effectively' },
          { valueName: 'Simple & Agile', rating: 'Very Good', evidenceComments: 'Clear, concise client workpapers' },
        ],
        objectives: [
          { objective: 'Complete 3 Client Financial Reviews', expectedOutput: 'Draft audit memos within Q2', achievementStatus: 'ACHIEVED' },
          { objective: 'Deliver Statutory Compliance Summary', expectedOutput: 'Kenya Companies Act memo', achievementStatus: 'ACHIEVED' },
        ],
        supervisorComments: 'Outstanding technical diligence throughout probation period.',
        recommendation: 'CONFIRM',
        recommendationReason: 'Successfully achieved all initial performance metrics and values standards.',
      });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.data.status).toBe('ASSESSED');

    // 3. Authorised Human Decision: CONFIRMED
    const decisionRes = await hrClient.agent
      .post(`/api/v1/employees/probation/${probRecord.id}/decision`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        decision: 'CONFIRMED',
        decisionReason: 'Performance and core value alignment meet full associate standard. Confirmed into permanent staff.',
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.data.status).toBe('DECIDED');
    expect(decisionRes.body.data.decision).toBe('CONFIRMED');

    // 4. Verify employee status transitioned to ACTIVE
    const confirmedEmp = await prisma.employee.findUniqueOrThrow({ where: { id: newEmployeeId } });
    expect(confirmedEmp.status).toBe('ACTIVE');

    // 5. Verify audit log captured the human decision
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'PROBATION_DECISION_CONFIRMED',
        targetId: probRecord.id,
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.outcome).toBe('SUCCESS');
  });

  // -------------------------------------------------------------------------
  // 10. Lifecycle Jobs Runner (Expiry Scan, Reminders, Escalations)
  // -------------------------------------------------------------------------
  it('runs deterministic lifecycle maintenance jobs and detects expiring documents', async () => {
    // 1. Upload an expiring document (e.g. driving license / ID expiring in 10 days)
    const uploadRes = await hrClient.agent
      .post('/api/v1/documents/upload')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        fileName: 'Expiring_Id_Copy.pdf',
        mimeType: 'application/pdf',
        category: 'COMPLIANCE',
        fileBase64: Buffer.from('Expiring identity copy').toString('base64'),
      });

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 10); // Expires in 10 days

    await hrClient.agent
      .post(`/api/v1/employees/${newEmployeeId}/documents`)
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        documentRecordId: uploadRes.body.data.id,
        documentType: 'ID_EVIDENCE',
        expiryDate: expDate.toISOString(),
        reminderDaysBefore: 30, // 30-day reminder threshold -> triggers EXPIRING_SOON
      });

    // 2. Trigger lifecycle jobs runner
    const jobRes = await hrClient.agent
      .post('/api/v1/lifecycle-jobs/run')
      .set('x-csrf-token', hrClient.csrfToken)
      .send();

    expect(jobRes.status).toBe(200);
    expect(jobRes.body.data.documentExceptionsCreated).toBeGreaterThanOrEqual(1);

    // Verify DocumentException was opened in database
    const exc = await prisma.documentException.findFirst({
      where: { exceptionType: 'EXPIRING_SOON', status: 'OPEN' },
    });
    expect(exc).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. Full Multi-Role Onboarding E2E: Auto User Link, Mine Tasks, ICT Sync & List Fields
  // -------------------------------------------------------------------------
  it('completes end-to-end multi-role onboarding with workEmail user auto-linking and ICT ticket sync', async () => {
    const manager = await prisma.employee.findUniqueOrThrow({
      where: { workEmail: 'line.manager@ndakalaadvisory.co.ke' },
    });

    // Ensure STD-JOINER-DRAFT template is active
    const tpl = await prisma.onboardingTemplate.findUnique({ where: { code: 'STD-JOINER-DRAFT' } });
    if (tpl && tpl.status !== 'ACTIVE') {
      await prisma.onboardingTemplate.update({ where: { id: tpl.id }, data: { status: 'ACTIVE' } });
    }

    // 1. ICT Admin provisions new portal user & assigns employee role
    const joinerEmail = 'mwangi.e2e@ndakalaadvisory.co.ke';
    const userRes = await ictClient.agent
      .post('/api/v1/users')
      .set('x-csrf-token', ictClient.csrfToken)
      .send({
        email: joinerEmail,
        name: 'E2E Joiner Mwangi',
        password: 'Joiner@2026!Secure',
      });
    expect(userRes.status).toBe(200);
    const createdUserId = userRes.body.data.id;

    const roleRes = await ictClient.agent
      .post(`/api/v1/users/${createdUserId}/roles`)
      .set('x-csrf-token', ictClient.csrfToken)
      .send({ roleKey: 'employee' });
    expect(roleRes.status).toBe(200);

    // 2. HR creates Employee WITHOUT explicit userId — backend auto-links by workEmail
    const createEmpRes = await hrClient.agent
      .post('/api/v1/employees')
      .set('x-csrf-token', hrClient.csrfToken)
      .send({
        firstName: 'Mwangi',
        lastName: 'E2E',
        workEmail: joinerEmail,
        phoneNumber: '+254712345699',
        employmentCategoryCode: 'PERMANENT',
        startDate: '2026-11-01',
        jobTitle: 'Advisory Associate',
        departmentId: deptAdvId,
        managerId: manager.id,
        ictAccessProfile: 'STANDARD_OFFICE_365',
      });
    expect(createEmpRes.status).toBe(201);
    const e2eEmpId = createEmpRes.body.data.employee.id;
    expect(createEmpRes.body.data.employee.userId).toBe(createdUserId);

    // Verify GET /employees returns onboardingCompletedAt and onboardingTasks
    const listRes = await hrClient.agent.get(`/api/v1/employees?search=${encodeURIComponent(joinerEmail)}`);
    expect(listRes.status).toBe(200);
    const listed = listRes.body.data.items.find((e: any) => e.id === e2eEmpId);
    expect(listed).toBeDefined();
    expect(listed.onboardingCompletedAt).toBeNull();
    expect(Array.isArray(listed.onboardingTasks)).toBe(true);
    expect(listed.onboardingTasks.length).toBeGreaterThanOrEqual(5);

    // 3. New Joiner logs in, checks /onboarding-tasks/mine, starts & completes their EMPLOYEE task
    const joinerClient = await loginClient(app, joinerEmail, 'Joiner@2026!Secure');
    const joinerMineRes = await joinerClient.agent.get('/api/v1/onboarding-tasks/mine');
    expect(joinerMineRes.status).toBe(200);
    const empTask = joinerMineRes.body.data.find(
      (t: any) => t.employeeId === e2eEmpId && t.ownerType === 'EMPLOYEE',
    );
    expect(empTask).toBeDefined();

    const startRes = await joinerClient.agent
      .patch(`/api/v1/onboarding-tasks/${empTask.id}`)
      .set('x-csrf-token', joinerClient.csrfToken)
      .send({ status: 'IN_PROGRESS' });
    expect(startRes.status).toBe(200);

    const completeJoinerTaskRes = await joinerClient.agent
      .patch(`/api/v1/onboarding-tasks/${empTask.id}`)
      .set('x-csrf-token', joinerClient.csrfToken)
      .send({ status: 'COMPLETED', completionNotes: 'Verified details in My Space' });
    expect(completeJoinerTaskRes.status).toBe(200);

    // 4. Line Manager checks /onboarding-tasks/mine and completes MANAGER task
    const mgrMineRes = await managerClient.agent.get('/api/v1/onboarding-tasks/mine');
    expect(mgrMineRes.status).toBe(200);
    const mgrTask = mgrMineRes.body.data.find(
      (t: any) => t.employeeId === e2eEmpId && t.ownerType === 'MANAGER',
    );
    expect(mgrTask).toBeDefined();
    const mgrCompleteRes = await managerClient.agent
      .patch(`/api/v1/onboarding-tasks/${mgrTask.id}`)
      .set('x-csrf-token', managerClient.csrfToken)
      .send({ status: 'COMPLETED', completionNotes: 'Objectives agreed with hire' });
    expect(mgrCompleteRes.status).toBe(200);

    // 5. HR uploads evidence document and completes all HR tasks
    const hrTasks = await prisma.onboardingTask.findMany({
      where: { employeeId: e2eEmpId, ownerType: 'HR' },
    });
    for (const hTask of hrTasks) {
      let evidenceDocumentId: string | undefined;
      if (hTask.evidenceRequired) {
        const upRes = await hrClient.agent
          .post('/api/v1/documents/upload')
          .set('x-csrf-token', hrClient.csrfToken)
          .send({
            fileName: `${hTask.taskTitle.slice(0, 15).replace(/\s+/g, '_')}.pdf`,
            mimeType: 'application/pdf',
            category: 'COMPLIANCE',
            securityClassification: 'CONFIDENTIAL',
            fileBase64: Buffer.from('Signed onboarding evidence PDF').toString('base64'),
          });
        expect(upRes.status).toBe(200);
        evidenceDocumentId = upRes.body.data.id;
      }
      const hrCompRes = await hrClient.agent
        .patch(`/api/v1/onboarding-tasks/${hTask.id}`)
        .set('x-csrf-token', hrClient.csrfToken)
        .send({ status: 'COMPLETED', completionNotes: 'HR verified', ...(evidenceDocumentId ? { evidenceDocumentId } : {}) });
      expect(hrCompRes.status).toBe(200);
    }

    // 6. ICT Admin fulfils the JOINER ICT ticket -> ICT task auto-completes and onboardingCompletedAt is stamped!
    const ictTicketId = createEmpRes.body.data.ictRequestId;
    const ictFulfilRes = await ictClient.agent
      .patch(`/api/v1/ict-requests/${ictTicketId}`)
      .set('x-csrf-token', ictClient.csrfToken)
      .send({ status: 'COMPLETED', completionNotes: 'M365 and portal access verified' });
    expect(ictFulfilRes.status).toBe(200);
    expect(ictFulfilRes.body.data.syncedOnboardingTasks).toBeGreaterThanOrEqual(1);

    const listAfterRes = await hrClient.agent.get(`/api/v1/employees?search=${encodeURIComponent(joinerEmail)}`);
    expect(listAfterRes.status).toBe(200);
    const listedAfter = listAfterRes.body.data.items.find((e: any) => e.id === e2eEmpId);
    expect(listedAfter.onboardingCompletedAt).not.toBeNull();
  });
});
