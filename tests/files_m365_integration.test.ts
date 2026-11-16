import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

interface RecordedGraphCall {
  method: string;
  url: string;
  body?: any;
  rawBody?: string;
}

describe('Unified Files Hub, AES-256 Encryption & App-Only Microsoft 365 Integration', () => {
  const app = getApp();
  let mockServer: http.Server;
  let mockBaseUrl = '';
  const graphCalls: RecordedGraphCall[] = [];
  const remoteFiles = new Map<string, { buffer: Buffer; mimeType: string; size: number }>();

  beforeAll(async () => {
    await seedDatabase(prisma);

    mockServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const rawBuf = Buffer.concat(chunks);
        const rawStr = rawBuf.toString('utf8');
        let jsonBody: any = undefined;
        try {
          if ((req.headers['content-type'] || '').includes('application/json')) {
            jsonBody = JSON.parse(rawStr);
          }
        } catch {
          // binary or form
        }

        const url = req.url || '/';
        graphCalls.push({ method: req.method || 'GET', url, body: jsonBody, rawBody: rawStr });

        // 1. Entra ID Client Credentials Token Endpoint
        if (url.includes('/oauth2/v2.0/token')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'mock-app-only-token', expires_in: 3600 }));
          return;
        }

        // 2. Site & Drive Lookup
        if (req.method === 'GET' && url.includes('/sites/') && !url.includes('/drive')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'sp-site-ndakala-001' }));
          return;
        }
        if (req.method === 'GET' && url.includes('/sites/') && url.endsWith('/drive')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'sp-drive-hr-001' }));
          return;
        }

        // 3. SharePoint Folder Check & Create
        if (req.method === 'GET' && url.includes('/root:/') && !url.endsWith(':/content')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'folder-ok', name: 'Folder' }));
          return;
        }
        if (req.method === 'POST' && url.endsWith('/children')) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: `sp-folder-${Date.now()}` }));
          return;
        }

        // 4. SharePoint PUT Upload Content
        if (req.method === 'PUT' && url.endsWith(':/content')) {
          const itemId = `sp-item-${remoteFiles.size + 1}`;
          remoteFiles.set(itemId, {
            buffer: rawBuf,
            mimeType: String(req.headers['content-type'] || 'application/octet-stream'),
            size: rawBuf.length,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: itemId,
              eTag: `"etag-${itemId}"`,
              size: rawBuf.length,
              webUrl: `https://ndakalaadvisory.sharepoint.com/sites/NdakalaPeopleHR/${itemId}`,
            }),
          );
          return;
        }

        // 5. SharePoint Verify DriveItem & Content Download
        if (req.method === 'GET' && url.includes('/items/')) {
          const match = url.match(/\/items\/([^/?]+)/);
          const itemId = match ? decodeURIComponent(match[1]) : '';
          const stored = remoteFiles.get(itemId);
          if (!stored) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'itemNotFound' } }));
            return;
          }
          if (url.includes('/content')) {
            res.writeHead(200, { 'Content-Type': stored.mimeType });
            res.end(stored.buffer);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: itemId,
              size: stored.size,
              eTag: `"etag-${itemId}"`,
              file: { hashes: {} },
            }),
          );
          return;
        }

        // 6. Outlook sendMail
        if (req.method === 'POST' && url.endsWith('/sendMail')) {
          res.writeHead(202, { 'request-id': `msg-${Date.now()}` });
          res.end();
          return;
        }

        // 7. Shared Dept Calendar Event
        if (req.method === 'POST' && url.endsWith('/events')) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: `cal-evt-${Date.now()}` }));
          return;
        }

        res.writeHead(404);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await prisma.integrationConfig.deleteMany({ where: { provider: 'MICROSOFT_365' } }).catch(() => {});
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('encrypts uploaded files on local disk with AES-256-GCM and streams decrypted bytes inline', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    const secretText = '%PDF-1.4\nNdakala Confidential Board Policy Payload AES256 Check';

    const upRes = await hr.agent
      .post('/api/v1/files/organization')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        fileName: 'Board_Confidential_2026.pdf',
        mimeType: 'application/pdf',
        category: 'ORGANISATION',
        securityClassification: 'CONFIDENTIAL',
        shareScope: 'ORG',
        fileBase64: Buffer.from(secretText, 'utf8').toString('base64'),
      });

    expect(upRes.status).toBe(201);
    const docId = upRes.body.data.id;
    const dbRec = await prisma.documentRecord.findUnique({ where: { id: docId } });
    expect(dbRec).toBeDefined();

    // Verify local file on disk is strictly ciphertext wrapped with NDKENC01
    const rawDiskBuf = fs.readFileSync(path.resolve(process.cwd(), 'secure_storage', dbRec!.storageKey));
    expect(rawDiskBuf.subarray(0, 8).toString('ascii')).toBe('NDKENC01');
    expect(rawDiskBuf.toString('utf8')).not.toContain('Board Policy Payload');

    // Request user-bound inline token and verify inline streaming returns decrypted PDF
    const tokRes = await hr.agent
      .post(`/api/v1/files/${docId}/token`)
      .set('x-csrf-token', hr.csrfToken);
    expect(tokRes.status).toBe(200);
    expect(tokRes.body.data.inlineUrl).toContain(`/api/v1/files/${docId}/inline`);

    const inlineRes = await hr.agent.get(tokRes.body.data.inlineUrl);
    expect(inlineRes.status).toBe(200);
    expect(inlineRes.headers['content-disposition']).toContain('inline');
    expect(inlineRes.headers['cache-control']).toContain('no-store');
    expect(Buffer.from(inlineRes.body).toString('utf8')).toBe(secretText);
  });

  it('seeds all 22 real company policies (20 PUBLISHED, 2 DRAFT), folders, and compiles HR Template Forms to PDF', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');

    const ndaPolicies = await prisma.policyDocument.findMany({
      where: { code: { startsWith: 'POL-NDA-' } },
      include: { versions: true },
    });
    expect(ndaPolicies.length).toBe(22);
    const draftCount = ndaPolicies.filter((p) => p.versions.some((v) => v.status === 'DRAFT')).length;
    const pubCount = ndaPolicies.filter((p) => p.versions.some((v) => v.status === 'PUBLISHED')).length;
    expect(draftCount).toBe(2);
    expect(pubCount).toBe(20);

    const foldersRes = await hr.agent.get('/api/v1/files/folders');
    expect(foldersRes.status).toBe(200);
    const folderNames = foldersRes.body.data.map((f: any) => f.name);
    expect(folderNames).toContain('HR & Employment Policies');
    expect(folderNames).toContain('IT, Cybersecurity & Data Privacy');
    expect(folderNames).toContain('Compliance & Risk Governance');

    const tplRes = await hr.agent.get('/api/v1/files/templates');
    expect(tplRes.status).toBe(200);
    const handbook = tplRes.body.data.find((t: any) => t.name === 'Company Handbook Template');
    expect(handbook).toBeDefined();

    const pdfRes = await hr.agent
      .post(`/api/v1/files/templates/${handbook.id}/generate-pdf`)
      .set('x-csrf-token', hr.csrfToken)
      .send({
        formValues: {
          documentTitle: 'Ndakala 2026 Employee Handbook',
          visionStatement: 'Trusted Advisory Leader',
          missionStatement: 'People-first advisory excellence',
        },
      });
    expect(pdfRes.status).toBe(201);
    expect(pdfRes.body.data.inlineUrl).toContain('/inline?token=');

    const streamRes = await hr.agent.get(pdfRes.body.data.inlineUrl);
    expect(streamRes.status).toBe(200);
    expect(Buffer.from(streamRes.body).subarray(0, 8).toString('latin1')).toContain('%PDF-1.4');
  });

  it('supports Filter Drawer queries, Bulk Archive/Copy/Move/Delete, Privacy Legal Hold blocks, and CSV Export', async () => {
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    const partner = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    // Filter by fileName + format
    const listRes = await hr.agent.get('/api/v1/files?tab=org&fileName=Whistle&fileFormat=PDF');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((f: any) => f.fileName.toLowerCase().includes('whistle'))).toBe(true);

    // Export CSV
    const exportRes = await hr.agent
      .post('/api/v1/files/export')
      .set('x-csrf-token', hr.csrfToken)
      .send({ tab: 'org', fileFormat: 'PDF' });
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.data.csvContent).toContain('Name,Format,Category,Shared with');
    expect(exportRes.body.data.rowCount).toBeGreaterThanOrEqual(20);

    // Upload temp employee file & attach active PrivacyLegalHold -> DELETE must be blocked!
    const targetEmp = await prisma.employee.findFirst({ where: { status: 'ACTIVE' } });
    expect(targetEmp).toBeDefined();

    const empUp = await hr.agent
      .post('/api/v1/files/organization')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        fileName: 'Legal_Hold_Protected_File.pdf',
        mimeType: 'application/pdf',
        category: 'EMPLOYEE',
        employeeId: targetEmp!.id,
        fileBase64: Buffer.from('%PDF-1.4 held doc').toString('base64'),
      });
    expect(empUp.status).toBe(201);
    const heldDocId = empUp.body.data.id;

    const hold = await prisma.privacyLegalHold.create({
      data: {
        holdReference: `HOLD-TEST-${Date.now()}`,
        employeeId: targetEmp!.id,
        matterTitle: 'Audit Hold Test',
        reasonCategory: 'REGULATORY',
        status: 'ACTIVE',
        authorizedById: partner.agent ? 'system' : 'system',
      },
    });

    const delBlocked = await hr.agent
      .post('/api/v1/files/bulk')
      .set('x-csrf-token', hr.csrfToken)
      .send({ action: 'DELETE', documentIds: [heldDocId] });
    expect(delBlocked.status).toBe(409);
    expect(delBlocked.body.error.message).toContain('Legal Hold block');

    // Clean up hold, verify COPY + ARCHIVE work
    await prisma.privacyLegalHold.update({ where: { id: hold.id }, data: { status: 'RELEASED' } });
    const copyRes = await hr.agent
      .post('/api/v1/files/bulk')
      .set('x-csrf-token', hr.csrfToken)
      .send({ action: 'COPY', documentIds: [heldDocId] });
    expect(copyRes.status).toBe(200);
    expect(copyRes.body.data.createdCopies.length).toBe(1);

    const delOk = await hr.agent
      .post('/api/v1/files/bulk')
      .set('x-csrf-token', hr.csrfToken)
      .send({ action: 'DELETE', documentIds: [heldDocId, ...copyRes.body.data.createdCopies] });
    expect(delOk.status).toBe(200);
  });

  it('rejects standard staff on break-glass M365 SSO endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/auth/m365/break-glass')
      .send({ email: 'employee.one@ndakalaadvisory.co.ke' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('shared department mailboxes');
  });

  it('executes full App-Only Graph flow: SharePoint Dual-Write, Zero-PII Outlook Mail, Free All-Day Calendar & 6-Month Cold Archive Purge', async () => {
    const itAdmin = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');
    const hr = await loginClient(app, 'hr.lead@ndakalaadvisory.co.ke');
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');
    const manager = await loginClient(app, 'line.manager@ndakalaadvisory.co.ke');

    // 1. Configure MICROSOFT_365 pointing strictly at test mock HTTP server
    const cfgRes = await itAdmin.agent
      .put('/api/v1/integrations/configs/MICROSOFT_365')
      .set('x-csrf-token', itAdmin.csrfToken)
      .send({
        status: 'ACTIVE',
        isEnabled: true,
        configPayload: {
          tenantId: 'mock-tenant-id',
          clientId: 'mock-client-id',
          clientSecret: 'mock-client-secret-xyz',
          sharepointSiteUrl: 'https://ndakalaadvisory.sharepoint.com/sites/NdakalaPeopleHR',
          senderMailbox: 'noreply@ndakalaadvisory.co.ke',
          appBaseUrl: 'https://ndakalahr.duckdns.org',
          loginBaseUrl: mockBaseUrl,
          graphBaseUrl: mockBaseUrl,
        },
      });
    expect(cfgRes.status).toBe(200);

    // 2. Test App-Only Connection
    const testConn = await itAdmin.agent
      .post('/api/v1/integrations/m365/test-connection')
      .set('x-csrf-token', itAdmin.csrfToken);
    expect(testConn.status).toBe(200);
    expect(testConn.body.data.connected).toBe(true);
    expect(testConn.body.data.mode).toBe('APP_ONLY_CLIENT_CREDENTIALS');

    // 3. Test Link-Only Zero-PII Zero-Attachment Email
    const mailTest = await itAdmin.agent
      .post('/api/v1/integrations/m365/test-mail')
      .set('x-csrf-token', itAdmin.csrfToken)
      .send({ recipientMailbox: 'audit@ndakalaadvisory.co.ke' });
    expect(mailTest.status).toBe(200);
    expect(mailTest.body.data.sent).toBe(true);

    const lastMailCall = graphCalls.filter((c) => c.url.endsWith('/sendMail')).pop();
    expect(lastMailCall).toBeDefined();
    expect(lastMailCall!.url).toContain('noreply%40ndakalaadvisory.co.ke');
    expect(lastMailCall!.body.message.attachments).toEqual([]);
    expect(lastMailCall!.body.message.body.content).not.toMatch(/KES|salary|allegation/i);

    // 4. Dual-Write File Upload -> verify SharePoint item + backdate 8 months -> Run Cold Archive Purge -> Verify Inline Fallback from SharePoint!
    const dualContent = '%PDF-1.4\nCold Archive Roundtrip Document Content 2026';
    const upDual = await hr.agent
      .post('/api/v1/files/organization')
      .set('x-csrf-token', hr.csrfToken)
      .send({
        fileName: 'Cold_Archive_Test_2025.pdf',
        mimeType: 'application/pdf',
        category: 'ORGANISATION',
        fileBase64: Buffer.from(dualContent, 'utf8').toString('base64'),
      });
    expect(upDual.status).toBe(201);
    expect(upDual.body.data.sharepointSynced).toBe(true);
    const coldDocId = upDual.body.data.id;

    // Backdate lastAccessedAt to 8 months ago
    const eightMonthsAgo = new Date();
    eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
    await prisma.documentRecord.update({
      where: { id: coldDocId },
      data: { lastAccessedAt: eightMonthsAgo, createdAt: eightMonthsAgo },
    });

    const coldRes = await itAdmin.agent
      .post('/api/v1/files/cold-archive/run')
      .set('x-csrf-token', itAdmin.csrfToken)
      .send({ overrideMonths: 6, force: true });
    expect(coldRes.status).toBe(200);
    expect(coldRes.body.data.archivedDocumentIds).toContain(coldDocId);

    const postColdRec = await prisma.documentRecord.findUnique({ where: { id: coldDocId } });
    expect(postColdRec?.localStoragePurged).toBe(true);
    expect(postColdRec?.externalProvider).toBe('SHAREPOINT_ARCHIVE');

    // Reading inline now streams cleanly from SharePoint master copy!
    const tokCold = await hr.agent
      .post(`/api/v1/files/${coldDocId}/token`)
      .set('x-csrf-token', hr.csrfToken);
    const inlineCold = await hr.agent.get(tokCold.body.data.inlineUrl);
    expect(inlineCold.status).toBe(200);
    expect(Buffer.from(inlineCold.body).toString('utf8')).toBe(dualContent);

    // 5. Leave Approval -> Creates All-Day showAs: 'free' Shared Calendar Event (NEVER touches OOO MailboxSettings)
    const empRow = await prisma.employee.findFirst({ where: { workEmail: 'employee.one@ndakalaadvisory.co.ke' } });
    if (empRow?.departmentId) {
      await prisma.department.update({
        where: { id: empRow.departmentId },
        data: { sharedM365Mailbox: 'consulting@ndakalaadvisory.co.ke' },
      });
    }
    const relEmp = await prisma.employee.findFirst({ where: { status: 'ACTIVE', id: { not: empRow?.id } } });

    const submitLeave = await emp.agent
      .post('/api/v1/leave/requests')
      .set('x-csrf-token', emp.csrfToken)
      .send({
        leaveTypeCode: 'ANNUAL',
        startDate: '2026-12-28',
        endDate: '2026-12-29',
        handoverEmployeeId: relEmp?.id,
        handoverNotes: 'M365 Calendar Sync Handover',
        reason: 'Year-end break',
      });
    expect(submitLeave.status).toBe(201);
    const leaveRequestId = submitLeave.body.data.request.id;
    const approveRes = await manager.agent
      .post(`/api/v1/leave/requests/${leaveRequestId}/review`)
      .set('x-csrf-token', manager.csrfToken)
      .send({ decision: 'APPROVE', comments: 'Approved for calendar test' });
    expect(approveRes.status).toBe(200);

    const calCall = graphCalls.filter((c) => c.url.endsWith('/events')).pop();
    expect(calCall).toBeDefined();
    expect(calCall!.body.isAllDay).toBe(true);
    expect(calCall!.body.showAs).toBe('free');
    expect(calCall!.body.subject).toContain('[Away]');
    // Confirm automaticRepliesSetting / mailboxSettings was NEVER touched
    expect(graphCalls.some((c) => c.url.toLowerCase().includes('mailboxsettings'))).toBe(false);
  });
});
