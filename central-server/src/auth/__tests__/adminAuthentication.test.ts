import request from 'supertest';

import app from '../../app';

import { prisma } from '../../db/connection';

import {
  createAdmin,
} from '../services/adminAuthenticationService';

describe('Admin authentication middleware', () => {
  const email =
    `admin-middleware-test-${Date.now()}@idg4h.local`;

  const password = 'TestPassword123!';

  let sessionCookie: string;

  beforeAll(async () => {
    await createAdmin(email, password);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email,
        password,
      });

    expect(loginResponse.status).toBe(200);

    const setCookie =
      loginResponse.headers['set-cookie'];

    expect(setCookie).toBeDefined();

    const cookies = Array.isArray(setCookie)
      ? setCookie
      : [setCookie];

    const sessionCookieHeader = cookies.find(
      (cookie) =>
        cookie.startsWith('idg4h_session='),
    );

    expect(sessionCookieHeader).toBeDefined();

    sessionCookie = sessionCookieHeader!;
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

  describe('authenticated request', () => {
    it('allows an authenticated administrator to access /auth/me', async () => {
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
    });
  });

  describe('missing session', () => {
    it('returns 401 when the session cookie is missing', async () => {
      const response = await request(app)
        .get('/auth/me');

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        error:
          'Administrator session required.',
      });
    });
  });

  describe('invalid session', () => {
    it('returns 401 for an invalid session cookie', async () => {
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
});