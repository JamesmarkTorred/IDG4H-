import {
  AdminAlreadyExistsError,
  AdminAuthenticationError,
  AdminValidationError,
  authenticateAdmin,
  createAdmin,
} from '../services/adminAuthenticationService';

import { prisma } from '../../db/connection';

describe('admin authentication service', () => {
  const adminEmail = `admin-test-${Date.now()}@idg4h.test`;
  const adminPassword = 'AdminPassword123!';

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: adminEmail,
      },
    });

    await prisma.$disconnect();
  });

  describe('createAdmin', () => {
    it('creates an administrator successfully', async () => {
      const admin = await createAdmin(
        adminEmail,
        adminPassword,
      );

      expect(admin.id).toBeTruthy();
      expect(admin.email).toBe(adminEmail);
      expect(admin.role).toBe('admin');
      expect(admin.createdAt).toBeInstanceOf(Date);
      expect(admin.updatedAt).toBeInstanceOf(Date);

      expect(
        Object.prototype.hasOwnProperty.call(
          admin,
          'passwordHash',
        ),
      ).toBe(false);
    });

    it('normalizes the administrator email', async () => {
      const email = ` Admin-Normalize-${Date.now()}@IDG4H.TEST `;

      const admin = await createAdmin(
        email,
        adminPassword,
      );

      expect(admin.email).toBe(
        email.trim().toLowerCase(),
      );

      await prisma.user.delete({
        where: {
          email: admin.email,
        },
      });
    });

    it('rejects an empty email', async () => {
      await expect(
        createAdmin('', adminPassword),
      ).rejects.toBeInstanceOf(AdminValidationError);
    });

    it('rejects an invalid email format', async () => {
      await expect(
        createAdmin(
          'invalid-email',
          adminPassword,
        ),
      ).rejects.toBeInstanceOf(AdminValidationError);
    });

    it('rejects an empty password', async () => {
      await expect(
        createAdmin(adminEmail, ''),
      ).rejects.toBeInstanceOf(AdminValidationError);
    });

    it('rejects a password shorter than 8 characters', async () => {
      await expect(
        createAdmin(
          `short-password-${Date.now()}@idg4h.test`,
          '1234567',
        ),
      ).rejects.toBeInstanceOf(AdminValidationError);
    });

    it('rejects a duplicate administrator email', async () => {
      await expect(
        createAdmin(
          adminEmail,
          adminPassword,
        ),
      ).rejects.toBeInstanceOf(
        AdminAlreadyExistsError,
      );
    });

    it('stores a hashed password instead of the plain password', async () => {
      const email = `hash-test-${Date.now()}@idg4h.test`;

      await createAdmin(
        email,
        adminPassword,
      );

      const admin = await prisma.user.findUnique({
        where: {
          email,
        },
      });

      expect(admin).not.toBeNull();
      expect(admin?.passwordHash).toBeTruthy();
      expect(admin?.passwordHash).not.toBe(
        adminPassword,
      );

      await prisma.user.delete({
        where: {
          email,
        },
      });
    });
  });

  describe('authenticateAdmin', () => {
    it('authenticates an administrator with the correct credentials', async () => {
      const admin = await authenticateAdmin(
        adminEmail,
        adminPassword,
      );

      expect(admin.id).toBeTruthy();
      expect(admin.email).toBe(adminEmail);
      expect(admin.role).toBe('admin');

      expect(
        Object.prototype.hasOwnProperty.call(
          admin,
          'passwordHash',
        ),
      ).toBe(false);
    });

    it('accepts email with surrounding whitespace and different casing', async () => {
      const admin = await authenticateAdmin(
        `  ${adminEmail.toUpperCase()}  `,
        adminPassword,
      );

      expect(admin.email).toBe(adminEmail);
      expect(admin.role).toBe('admin');
    });

    it('rejects an unknown administrator email', async () => {
      await expect(
        authenticateAdmin(
          'does-not-exist@idg4h.test',
          adminPassword,
        ),
      ).rejects.toBeInstanceOf(
        AdminAuthenticationError,
      );
    });

    it('rejects an incorrect password', async () => {
      await expect(
        authenticateAdmin(
          adminEmail,
          'WrongPassword123!',
        ),
      ).rejects.toBeInstanceOf(
        AdminAuthenticationError,
      );
    });

    it('rejects an empty email', async () => {
      await expect(
        authenticateAdmin(
          '',
          adminPassword,
        ),
      ).rejects.toBeInstanceOf(
        AdminAuthenticationError,
      );
    });

    it('rejects an empty password', async () => {
      await expect(
        authenticateAdmin(
          adminEmail,
          '',
        ),
      ).rejects.toBeInstanceOf(
        AdminAuthenticationError,
      );
    });
  });
});