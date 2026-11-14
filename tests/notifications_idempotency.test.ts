import { getApp, prisma, loginClient } from './helpers.js';
import { seedDatabase } from '../src/seed.js';

describe('Notifications, Task Inbox & Delivery Idempotency (NFR-13)', () => {
  const app = getApp();

  beforeAll(async () => {
    await seedDatabase(prisma);
  });

  it('enforces idempotency key on notification dispatch to prevent duplicate messages', async () => {
    const admin = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');
    const emp = await prisma.user.findUnique({ where: { email: 'employee.one@ndakalaadvisory.co.ke' } });

    const idempotencyKey = `notif_event_${Date.now()}`;

    // First dispatch
    const res1 = await admin.agent
      .post('/api/v1/notifications')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        recipientUserId: emp!.id,
        title: 'Policy Acknowledgment Required',
        message: 'Please review and acknowledge the updated Ndakala Information Management Policy.',
        idempotencyKey,
      });

    expect(res1.status).toBe(200);
    const notifId1 = res1.body.data.id;

    // Second dispatch with same idempotency key (duplicate event / retry)
    const res2 = await admin.agent
      .post('/api/v1/notifications')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        recipientUserId: emp!.id,
        title: 'Policy Acknowledgment Required',
        message: 'Please review and acknowledge the updated Ndakala Information Management Policy.',
        idempotencyKey,
      });

    expect(res2.status).toBe(200);
    expect(res2.body.data.deduplicated).toBe(true);
    expect(res2.body.data.id).toBe(notifId1);

    // Verify exactly one database row was created
    const count = await prisma.notification.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });

  it('notification retry mechanism increments attempts and marks delivery status', async () => {
    const admin = await loginClient(app, 'ict.admin@ndakalaadvisory.co.ke');
    const emp = await prisma.user.findUnique({ where: { email: 'employee.one@ndakalaadvisory.co.ke' } });

    const createRes = await admin.agent
      .post('/api/v1/notifications')
      .set('x-csrf-token', admin.csrfToken)
      .send({
        recipientUserId: emp!.id,
        title: 'Retry Test Notification',
        message: 'Testing dispatch retry failure thresholds.',
      });

    const notifId = createRes.body.data.id;

    // Trigger retry
    const retryRes = await admin.agent
      .post(`/api/v1/notifications/${notifId}/retry`)
      .set('x-csrf-token', admin.csrfToken);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.data.attempts).toBe(1);
    expect(retryRes.body.data.status).toBe('DELIVERED');
  });

  it('employee can list their own notifications and mark them as read', async () => {
    const emp = await loginClient(app, 'employee.one@ndakalaadvisory.co.ke');

    const listRes = await emp.agent.get('/api/v1/notifications');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    if (listRes.body.data.length > 0) {
      const notif = listRes.body.data[0];
      const readRes = await emp.agent
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set('x-csrf-token', emp.csrfToken);
      expect(readRes.status).toBe(200);
      expect(readRes.body.data.isRead).toBe(true);
    }
  });
});
