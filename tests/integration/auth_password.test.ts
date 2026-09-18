import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';
import crypto from 'crypto';

describe('Integration: Password Reset Loop Fix', () => {
  let masterToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Setup a user who needs password change
    const email = 'password.loop.test@sentinelconsig.com.br';
    
    // Cleanup first
    await prisma.session.deleteMany({ where: { user: { email } } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { user: { email } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
    
    const user = await prisma.user.create({
      data: {
        name: 'Password Loop Tester',
        email,
        passwordHash: 'dummyhash',
        role: 'DIGITADOR',
        mustChangePassword: true,
        active: true,
      }
    });
    testUserId = user.id;

    masterToken = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        userId: user.id,
        token: masterToken,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        activeRole: 'DIGITADOR',
        activePermissions: []
      }
    });
  });

  afterAll(async () => {
    const email = 'password.loop.test@sentinelconsig.com.br';
    await prisma.session.deleteMany({ where: { user: { email } } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { user: { email } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  });

  it('should reject missing or short password', async () => {
    const res1 = await request(app)
      .post('/api/auth/update-password')
      .set('Cookie', [`cg_session_token=${masterToken}`])
      .send({ password: 'valid-but-wrong-field' }); // Send wrong field to prove it rejects

    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain('mínimo de 6 caracteres');

    const res2 = await request(app)
      .post('/api/auth/update-password')
      .set('Cookie', [`cg_session_token=${masterToken}`])
      .send({ newPassword: '123' }); // Too short

    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('mínimo de 6 caracteres');
  });

  it('should successfully update password and clear mustChangePassword flag', async () => {
    const res = await request(app)
      .post('/api/auth/update-password')
      .set('Cookie', [`cg_session_token=${masterToken}`])
      .send({ newPassword: 'SuperSecurePassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(user).toBeDefined();
    expect(user?.mustChangePassword).toBe(false);
  });
});
