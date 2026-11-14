import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Permissions Matrix & Deny-by-Default (NFR-01, ORG/IDENTITY)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('unauthenticated requests to protected endpoints return 401 UNAUTHENTICATED', async () => {
    const endpoints = [
      { method: 'get', path: '/api/v1/organisation' },
      { method: 'get', path: '/api/v1/users' },
      { method: 'get', path: '/api/v1/departments' },
      { method: 'get', path: '/api/v1/configuration' },
      { method: 'get', path: '/api/v1/workflows/definitions' },
      { method: 'get', path: '/api/v1/tasks/inbox' },
      { method: 'get', path: '/api/v1/documents' },
      { method: 'get', path: '/api/v1/audit-logs' },
    ];

    for (const ep of endpoints) {
      const res = await (request(app) as any)[ep.method](ep.path);
      expect(res.status, `Endpoint ${ep.path} should require authentication`).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('health and ready endpoints are public without authentication', async () => {
    const resHealth = await request(app).get('/api/v1/health');
    expect(resHealth.status).toBe(200);
    expect(resHealth.body.status).toBe('UP');

    const resReady = await request(app).get('/api/v1/ready');
    expect(resReady.status).toBe(200);
    expect(resReady.body.status).toBe('READY');
  });

  it('employee role has restricted access: can view org but cannot view users or manage structure', async () => {
    const { agent, csrfToken } = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    // Permitted: org.view
    const resOrg = await agent.get('/api/v1/organisation');
    expect(resOrg.status).toBe(200);
    expect(resOrg.body.data.legalName).toBe('Ndakala Advisory LLP');

    // Forbidden: users.view
    const resUsers = await agent.get('/api/v1/users');
    expect(resUsers.status).toBe(403);
    expect(resUsers.body.error.code).toBe('FORBIDDEN');

    // Forbidden: structure.manage
    const resDept = await agent
      .post('/api/v1/departments')
      .set('x-csrf-token', csrfToken)
      .send({ code: 'HACK', name: 'Hacked Department' });
    expect(resDept.status).toBe(403);

    // Forbidden: audit.view
    const resAudit = await agent.get('/api/v1/audit-logs');
    expect(resAudit.status).toBe(403);
  });

  it('auditor role has read-only audit and reports access; cannot mutate structure or users', async () => {
    const { agent, csrfToken } = await loginClient(app, 'auditor@ndakalaadvisory.co.ke');

    // Permitted: audit.view
    const resAudit = await agent.get('/api/v1/audit-logs');
    expect(resAudit.status).toBe(200);
    expect(resAudit.body.data.items).toBeDefined();

    // Permitted: audit.export
    const resExport = await agent.get('/api/v1/audit-logs/export');
    expect(resExport.status).toBe(200);
    expect(resExport.body.data.logs).toBeDefined();

    // Forbidden: users.manage (cannot create user)
    const resCreateUser = await agent
      .post('/api/v1/users')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'new@ndakala.co.ke', name: 'New User', password: 'Password@123' });
    expect(resCreateUser.status).toBe(403);

    // Forbidden: config.create (cannot create configuration)
    const resCreateConfig = await agent
      .post('/api/v1/configuration')
      .set('x-csrf-token', csrfToken)
      .send({
        code: 'TEST',
        title: 'Test',
        layer: 'ORGANISATION',
        values: {},
        sourceReference: 'Ref',
        owner: 'Owner',
        effectiveFrom: new Date().toISOString(),
      });
    expect(resCreateConfig.status).toBe(403);
  });

  it('managing_partner holds full administrative authority across all modules', async () => {
    const { agent } = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    const resOrg = await agent.get('/api/v1/organisation');
    expect(resOrg.status).toBe(200);

    const resUsers = await agent.get('/api/v1/users');
    expect(resUsers.status).toBe(200);

    const resAudit = await agent.get('/api/v1/audit-logs');
    expect(resAudit.status).toBe(200);
  });
});
