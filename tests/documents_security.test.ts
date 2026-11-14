import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';
import { generateSignedDownloadToken } from '../src/core/storage/storage.js';

describe('Document Security, Upload Validation & Authorised Downloads (EMP-03, NFR-01)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('rejects dangerous executable file uploads (.exe, .bat, .sh, .py)', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const unsafeFiles = [
      { name: 'malware.exe', mime: 'application/octet-stream' },
      { name: 'script.bat', mime: 'text/plain' },
      { name: 'payload.sh', mime: 'text/plain' },
      { name: 'exploit.py', mime: 'text/plain' },
    ];

    for (const file of unsafeFiles) {
      const res = await hr.agent
        .post('/api/v1/documents/upload')
        .set('x-csrf-token', hr.csrfToken)
        .send({
          fileName: file.name,
          mimeType: file.mime,
          category: 'POLICY',
          fileBase64: Buffer.from('malicious code payload').toString('base64'),
        });

      expect(res.status, `Prohibited file ${file.name} must be rejected`).toBe(400);
      expect(res.body.error.message).toContain('Security restriction: file extension');
    }
  });

  it('rejects oversized files exceeding 15MB threshold', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    // Simulate 16MB file buffer
    const largeBuffer = Buffer.alloc(16 * 1024 * 1024);

    const res = await hr.agent
      .post('/api/v1/documents/upload')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        fileName: 'oversized_archive.pdf',
        mimeType: 'application/pdf',
        category: 'POLICY',
        fileBase64: largeBuffer.toString('base64'),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('File size exceeds maximum allowed limit');
  });

  it('allows safe document upload and generates short-lived signed download token', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const docContent = 'Official Ndakala Advisory LLP Code of Conduct and Operating Manual 2026';
    const base64 = Buffer.from(docContent, 'utf8').toString('base64');

    // 1. Upload valid PDF document
    const uploadRes = await hr.agent
      .post('/api/v1/documents/upload')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        fileName: 'Ndakala_Code_of_Conduct_2026.pdf',
        mimeType: 'application/pdf',
        category: 'POLICY',
        securityClassification: 'INTERNAL',
        fileBase64: base64,
      });

    expect(uploadRes.status).toBe(200);
    const docId = uploadRes.body.data.id;
    expect(docId).toBeDefined();

    // 2. Request short-lived signed download token
    const tokenRes = await hr.agent
      .post(`/api/v1/documents/${docId}/token`)
      .set('x-csrf-token', hr.csrfToken);

    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.data.downloadToken;
    expect(token).toBeDefined();

    // 3. Download document using signed token
    const downloadRes = await request(app).get(`/api/v1/documents/download?token=${token}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    const content = Buffer.isBuffer(downloadRes.body) ? downloadRes.body.toString('utf8') : downloadRes.text;
    expect(content).toBe(docContent);

    // 4. Verify download audit record was written
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'DOCUMENT_DOWNLOAD',
        targetId: docId,
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.outcome).toBe('SUCCESS');
  });

  it('rejects download attempts with expired or forged tokens', async () => {
    // 1. Download without token
    const noTokenRes = await request(app).get('/api/v1/documents/download');
    expect(noTokenRes.status).toBe(403);

    // 2. Download with forged/tampered token
    const forgedToken = Buffer.from(
      JSON.stringify({
        documentId: 'fake-id',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        hmac: 'forged_hmac_signature_value',
      }),
    ).toString('base64url');

    const forgedRes = await request(app).get(`/api/v1/documents/download?token=${forgedToken}`);
    expect(forgedRes.status).toBe(403);

    // 3. Download with expired token
    const expiredToken = generateSignedDownloadToken('any-doc-id', -60); // Expired 60s ago
    const expiredRes = await request(app).get(`/api/v1/documents/download?token=${expiredToken}`);
    expect(expiredRes.status).toBe(403);
    expect(expiredRes.body.error.message).toContain('Download link has expired');
  });
});
