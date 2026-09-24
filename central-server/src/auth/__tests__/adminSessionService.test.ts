import {
  AdminSessionError,
  authenticateAdminSession,
  createAdminSession,
  revokeAdminSession,
} from '../services/adminSessionService';

import { createAdmin } from '../services/adminAuthenticationService';

import { prisma } from '../../db/connection';

describe('admin session service', () => {
  const adminEmail = `session-test-${Date.now()}@idg4h.test`;
  const adminPassword = 'AdminPassword123!';

  let adminId: string;

  beforeAll(async () => {
    const admin = await createAdmin(
      adminEmail,
      adminPassword,
    );

    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: adminEmail,
      },
    });

    await prisma.$disconnect();
  });

  describe('createAdminSession', () => {
    it('creates an administrator session successfully', async () => {
      const session = await createAdminSession(
        adminId,
      );

      expect(session.sessionId).toBeTruthy();
      expect(session.sessionToken).toBeTruthy();
      expect(session.sessionToken).toMatch(
        /^idg4h_session_[0-9a-f]+$/,
      );
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(
        Date.now(),
      );

      await prisma.userSession.delete({
        where: {
          id: session.sessionId,
        },
      });
    });

    it('stores only the hashed session token', async () => {
      const session = await createAdminSession(
        adminId,
      );

      const storedSession =
        await prisma.userSession.findUnique({
          where: {
            id: session.sessionId,
          },
        });

      expect(storedSession).not.toBeNull();

      expect(
        storedSession?.sessionTokenHash,
      ).toBeTruthy();

      expect(
        storedSession?.sessionTokenHash,
      ).not.toBe(session.sessionToken);

      expect(
        storedSession?.sessionTokenHash,
      ).toHaveLength(64);

      await prisma.userSession.delete({
        where: {
          id: session.sessionId,
        },
      });
    });

    it('rejects an empty user ID', async () => {
      await expect(
        createAdminSession('   '),
      ).rejects.toBeInstanceOf(
        AdminSessionError,
      );
    });

    it('rejects a user that does not exist', async () => {
      await expect(
        createAdminSession(
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toBeInstanceOf(
        AdminSessionError,
      );
    });
  });

  describe('authenticateAdminSession', () => {
    it('authenticates a valid administrator session', async () => {
      const session = await createAdminSession(
        adminId,
      );

      const authenticated =
        await authenticateAdminSession(
          session.sessionToken,
        );

      expect(authenticated.sessionId).toBe(
        session.sessionId,
      );

      expect(authenticated.userId).toBe(adminId);
      expect(authenticated.email).toBe(adminEmail);
      expect(authenticated.role).toBe('admin');

      expect(authenticated.expiresAt).toBeInstanceOf(
        Date,
      );

      await prisma.userSession.delete({
        where: {
          id: session.sessionId,
        },
      });
    });

    it('updates lastSeenAt when a session is authenticated', async () => {
      const session = await createAdminSession(
        adminId,
      );

      const before =
        await prisma.userSession.findUnique({
          where: {
            id: session.sessionId,
          },
          select: {
            lastSeenAt: true,
          },
        });

      await new Promise((resolve) =>
        setTimeout(resolve, 10),
      );

      await authenticateAdminSession(
        session.sessionToken,
      );

      const after =
        await prisma.userSession.findUnique({
          where: {
            id: session.sessionId,
          },
          select: {
            lastSeenAt: true,
          },
        });

      expect(after).not.toBeNull();
      expect(before).not.toBeNull();

      expect(
        after!.lastSeenAt.getTime(),
      ).toBeGreaterThanOrEqual(
        before!.lastSeenAt.getTime(),
      );

      await prisma.userSession.delete({
        where: {
          id: session.sessionId,
        },
      });
    });

    it('rejects an empty session token', async () => {
      await expect(
        authenticateAdminSession(''),
      ).rejects.toBeInstanceOf(
        AdminSessionError,
      );
    });

    it('rejects an invalid session token', async () => {
      await expect(
        authenticateAdminSession(
          'idg4h_session_invalid-token',
        ),
      ).rejects.toBeInstanceOf(
        AdminSessionError,
      );
    });

    it('rejects a revoked session', async () => {
      const session = await createAdminSession(
        adminId,
      );

      await revokeAdminSession(
        session.sessionToken,
      );

      await expect(
        authenticateAdminSession(
          session.sessionToken,
        ),
      ).rejects.toBeInstanceOf(
        AdminSessionError,
      );
    });
  });

  describe('revokeAdminSession', () => {
    it('revokes an existing administrator session', async () => {
      const session = await createAdminSession(
        adminId,
      );

      await revokeAdminSession(
        session.sessionToken,
      );

      const storedSession =
        await prisma.userSession.findUnique({
          where: {
            id: session.sessionId,
          },
        });

      expect(storedSession).toBeNull();
    });

    it('does nothing for an empty session token', async () => {
      await expect(
        revokeAdminSession(''),
      ).resolves.toBeUndefined();
    });
  });
});