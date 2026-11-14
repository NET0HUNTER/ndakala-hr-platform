import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Organisation Setup & Master Structure Primitives (ORG-01, ORG-02)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('verifies Ndakala organisation baseline profile and statutory settings', async () => {
    const mp = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const res = await mp.agent.get('/api/v1/organisation');
    expect(res.status).toBe(200);

    const org = res.body.data;
    expect(org.legalName).toBe('Ndakala Advisory LLP');
    expect(org.address).toContain('246 Owashika Road, Lavington, Nairobi, Kenya');
    expect(org.phone).toBe('+254 792 605 909');
    expect(org.email).toBe('info@ndakalaadvisory.co.ke');
    expect(org.timezone).toBe('Africa/Nairobi');
    expect(org.currencyCode).toBe('KES');
    expect(org.leaveYearStart).toBe('01-01');
    expect(org.financialYearStart).toBe('01-01');

    const workCal = JSON.parse(org.workCalendar);
    expect(workCal.workingDays).toContain('Monday');
    expect(workCal.workingDays).toContain('Saturday');
    expect(workCal.restDays).toContain('Sunday');
  });

  it('creates and lists departments with parent-child hierarchy', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    // Create parent department
    const parentCode = `PARENT_${Date.now().toString().slice(-4)}`;
    const parentRes = await hr.agent
      .post('/api/v1/departments')
      .set('x-csrf-token', hr.csrfToken)
      .send({ code: parentCode, name: 'Advisory Practice Group' });
    expect(parentRes.status).toBe(200);
    const parentId = parentRes.body.data.id;

    // Create child department
    const childCode = `CHILD_${Date.now().toString().slice(-4)}`;
    const childRes = await hr.agent
      .post('/api/v1/departments')
      .set('x-csrf-token', hr.csrfToken)
      .send({ code: childCode, name: 'Financial Advisory Unit', parentDepartmentId: parentId });
    expect(childRes.status).toBe(200);
    expect(childRes.body.data.parentDepartmentId).toBe(parentId);

    // Rejection on duplicate code
    const duplicateRes = await hr.agent
      .post('/api/v1/departments')
      .set('x-csrf-token', hr.csrfToken)
      .send({ code: childCode, name: 'Duplicate Unit' });
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.code).toBe('CONFLICT');
  });

  it('creates positions linked to departments and grades with reporting lines', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const dept = await prisma.department.findFirstOrThrow();
    const grade = await prisma.grade.findFirstOrThrow();

    // 1. Create Senior Position
    const snrCode = `POS_SNR_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const snrRes = await hr.agent
      .post('/api/v1/positions')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        code: snrCode,
        title: 'Senior Advisory Director',
        departmentId: dept.id,
        gradeId: grade.id,
      });
    expect(snrRes.status).toBe(200);
    const snrPosId = snrRes.body.data.id;

    // 2. Create Junior Position reporting to Senior
    const jnrCode = `POS_JNR_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const jnrRes = await hr.agent
      .post('/api/v1/positions')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        code: jnrCode,
        title: 'Advisory Associate',
        departmentId: dept.id,
        gradeId: grade.id,
        reportsToPositionId: snrPosId,
      });
    expect(jnrRes.status).toBe(200);
    expect(jnrRes.body.data.reportsToPositionId).toBe(snrPosId);

    // 3. Duplicate position code rejected with 409
    const dupRes = await hr.agent
      .post('/api/v1/positions')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        code: jnrCode,
        title: 'Duplicate Title',
        departmentId: dept.id,
      });
    expect(dupRes.status).toBe(409);
  });
});
