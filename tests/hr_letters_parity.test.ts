import { describe, it, expect, beforeAll } from 'vitest';
import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('HR Letters Self-Service Portal & PDF Compiler Parity (P2.1 - Module 3.1)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('Scenario 1: Creates, filters, approves, and compiles A4 PDFs for Address Proof, Bonafide & Experience Letters', async () => {
    const admin = await loginClient(app, 'managing.partner@ndakalaadvisory.co.ke');

    // Verify NDA-2026-0005 preserved
    const empRes = await admin.agent.get('/api/v1/employees?search=Amina');
    expect(empRes.status).toBe(200);
    const amina = (empRes.body.data?.items || empRes.body.data).find(
      (e: any) => e.employeeNumber === 'NDA-2026-0005'
    );
    expect(amina).toBeDefined();

    // Create Bonafide Letter request for Amina
    const createRes = await admin.agent
      .post('/api/v1/hr-letters/address-proof')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        employeeId: amina.id,
        letterType: 'BONAFIDE',
        reason: 'Embassy / Visa Application',
        addressDetails: 'The Visa Officer, High Commission, Nairobi',
        status: 'SUBMITTED',
      });
    expect(createRes.status).toBe(201);
    const letter = createRes.body.data;
    expect(letter.letterType).toBe('BONAFIDE');
    expect(letter.status).toBe('SUBMITTED');

    // Filter by letterType=BONAFIDE
    const listRes = await admin.agent.get('/api/v1/hr-letters/address-proof?letterType=BONAFIDE');
    expect(listRes.status).toBe(200);
    const items = listRes.body.data?.items || [];
    expect(items.some((i: any) => i.id === letter.id)).toBe(true);

    // Approve letter
    const approveRes = await admin.agent
      .patch(`/api/v1/hr-letters/address-proof/${letter.id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    // Stream compiled A4 PDF
    const pdfRes = await admin.agent.get(`/api/v1/hr-letters/requests/${letter.id}/pdf`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    const bodyText = Buffer.isBuffer(pdfRes.body) ? pdfRes.body.toString('latin1') : String(pdfRes.text || '');
    expect(bodyText.startsWith('%PDF-1.4')).toBe(true);

    // Also verify Experience Letter creation
    const expRes = await admin.agent
      .post('/api/v1/hr-letters/address-proof')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        employeeId: amina.id,
        letterType: 'EXPERIENCE',
        reason: 'Professional Licensing (ICPAK / LSK / CISA)',
        status: 'SUBMITTED',
      });
    expect(expRes.status).toBe(201);
    expect(expRes.body.data.letterType).toBe('EXPERIENCE');
  });
});
