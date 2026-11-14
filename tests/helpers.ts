import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';

export const prisma = new PrismaClient();

export function getApp() {
  return createApp(prisma);
}

export async function loginClient(app: any, email: string, password = 'Ndakala@Secure2026!') {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  return {
    agent,
    res,
    token: res.body?.data?.token,
    csrfToken: res.body?.data?.csrfToken,
    user: res.body?.data?.user,
  };
}
