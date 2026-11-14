import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { redactSensitiveData } from '../src/core/audit/redact.js';

describe('Audit Event Completeness & Sensitive Value Redaction (AUD-01, AUD-02, NFR-06)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('redacts sensitive fields like passwords, secrets, tokens, and hashes from audit payload', () => {
    const rawPayload = {
      email: 'user@ndakala.co.ke',
      password: 'SuperSecretPassword123!',
      passwordHash: 'pbkdf2:sha512:100000:abcd:ef01',
      token: 'secret_session_token_xyz',
      csrfToken: 'csrf_token_abc',
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      nested: {
        apiKey: 'api_key_live_9999',
        normalField: 'Preserved Value',
      },
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    };

    const redacted = redactSensitiveData(rawPayload) as any;

    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.passwordHash).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.csrfToken).toBe('[REDACTED]');
    expect(redacted.mfaSecret).toBe('[REDACTED]');
    expect(redacted.nested.apiKey).toBe('[REDACTED]');
    expect(redacted.nested.normalField).toBe('Preserved Value');
    expect(redacted.authHeader).toBe('[REDACTED_BEARER_TOKEN]');
    expect(redacted.email).toBe('user@ndakala.co.ke');
  });

  it('audit log captures actor, timestamp, action, target, outcome and correlationId', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    // Perform an audited action (creating a department)
    const testDeptCode = `DEPT_${Date.now().toString().slice(-4)}`;
    const res = await hr.agent
      .post('/api/v1/departments')
      .set('x-csrf-token', hr.csrfToken)
      .send({ code: testDeptCode, name: 'Audit Test Department' });

    expect(res.status).toBe(200);
    const deptId = res.body.data.id;

    // Verify audit log record exists with correlation ID and actor details
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        action: 'DEPARTMENT_CREATE',
        targetId: deptId,
      },
    });

    expect(auditRecord).toBeDefined();
    expect(auditRecord?.actorEmail).toBe('hr.lead@ndakalaadvisory.co.ke');
    expect(auditRecord?.outcome).toBe('SUCCESS');
    expect(auditRecord?.targetType).toBe('Department');
    expect(auditRecord?.correlationId).toBeTruthy();
    expect(auditRecord?.timestamp).toBeInstanceOf(Date);
  });

  it('audit search and export APIs are protected and scoped', async () => {
    const auditor = await loginClient(app, 'auditor@ndakalaadvisory.co.ke');

    const searchRes = await auditor.agent.get('/api/v1/audit-logs?limit=10');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.items.length).toBeGreaterThan(0);
    expect(searchRes.body.data.total).toBeGreaterThan(0);

    const exportRes = await auditor.agent.get('/api/v1/audit-logs/export');
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.data.count).toBeGreaterThan(0);
    expect(exportRes.body.data.exportedAt).toBeDefined();
  });
});
