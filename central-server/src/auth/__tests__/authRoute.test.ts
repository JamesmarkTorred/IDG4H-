import request from 'supertest';

import app from '../../app';

import { prisma } from '../../db/connection';

import {
  createAdmin,
} from '../services/adminAuthenticationService';

describe('Admin authentication API', () => {
  const email = `auth-route-test-${Date.now()}@idg4h.local`;
  const password = 'TestPassword123!';

  let sessionCookie: string;

  beforeAll(async () => {
    await createAdmin(email, password);
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({
      where: {
        user: {
          email,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email,
      },
    });

    await prisma.$disconnect();
  });

  describe('POST /auth/login', () => {
    it('authenticates an administrator and creates a session', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email,
          password,
        });

      expect(response.status).toBe(200);

      expect(response.body).toMatchObject({
        admin: {
          email,
          role: 'admin',
        },
      });

      expect(response.body.admin.id).toBeTruthy();
      expect(response.body.expiresAt).toBeTruthy();

      const setCookie = response.headers['set-cookie'];

      expect(setCookie).toBeDefined();

      const cookies = Array.isArray(setCookie)
        ? setCookie
        : [setCookie];

      const sessionCookieHeader = cookies.find(
        (cookie) =>
          cookie.startsWith('idg4h_session='),
      );

      expect(sessionCookieHeader).toBeDefined();

      expect(sessionCookieHeader).toContain(
        'HttpOnly',
      );

      sessionCookie = sessionCookieHeader!;
    });

    it('returns 401 for an incorrect password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email,
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        error:
          'Invalid administrator credentials.',
      });
    });

    it('returns 400 when email is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          password,
        });

      expect(response.status).toBe(400);

      expect(response.body).toEqual({
        error: 'Email is required.',
      });
    });

    it('returns 400 when password is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email,
        });

      expect(response.status).toBe(400);

      expect(response.body).toEqual({
        error: 'Password is required.',
      });
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without an administrator session', async () => {
      const response = await request(app)
        .get('/auth/me');

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        error: 'Administrator session required.',
      });
    });

    it('returns the authenticated administrator', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);

      expect(response.body).toMatchObject({
        admin: {
          email,
          role: 'admin',
        },
      });

      expect(response.body.admin.id).toBeTruthy();
      expect(response.body.expiresAt).toBeTruthy();
    });

    it('returns 401 for an invalid session', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set(
          'Cookie',
          'idg4h_session=idg4h_session_invalid',
        );

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        error:
          'Invalid or expired administrator session.',
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the administrator session', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(204);

      const setCookie = response.headers['set-cookie'];

      expect(setCookie).toBeDefined();

      const cookies = Array.isArray(setCookie)
        ? setCookie
        : [setCookie];

      const clearedCookie = cookies.find(
        (cookie) =>
          cookie.startsWith('idg4h_session='),
      );

      expect(clearedCookie).toBeDefined();
    });

    it('cannot authenticate using the revoked session', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        error:
          'Invalid or expired administrator session.',
      });
    });

    it('can safely log out without a session', async () => {
      const response = await request(app)
        .post('/auth/logout');

      expect(response.status).toBe(204);
    });
  });
});