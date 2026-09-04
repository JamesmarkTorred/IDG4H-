import request from 'supertest';

import app from '../app';
import { authRepository } from '../auth/authRepository';
import { hashPassword } from '../auth/passwordService';
import type { PermissionKey } from '../auth/permissions';
import { hashSessionToken, sessionCookieName } from '../auth/sessionService';
import { db } from '../db/connection';

const password = 'local-test-password';
let passwordHash: string;

function resetAuthData(): void {
  db.exec(`
    DELETE FROM auth_sessions;
    DELETE FROM user_roles;
    DELETE FROM role_permissions;
    DELETE FROM users;
    DELETE FROM roles;
  `);
}

function createUser(
  username: string,
  permissions: readonly PermissionKey[] = [],
  isActive = true
) {
  const user = authRepository.createUser({
    username,
    passwordHash,
    isActive,
  });
  const roleId = authRepository.createRole(`role-${username}`);

  for (const permission of permissions) {
    authRepository.grantPermissionToRole(roleId, permission);
  }

  authRepository.assignRoleToUser(user.id, roleId);
  return user;
}

function getRawCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as
    | string[]
    | undefined;

  if (!setCookie?.[0]) {
    throw new Error('Expected a session cookie.');
  }

  return setCookie[0].split(';')[0];
}

function getRawToken(response: request.Response): string {
  const cookie = getRawCookie(response);
  return cookie.slice(`${sessionCookieName}=`.length);
}

describe('offline local authentication API', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  beforeEach(() => {
    resetAuthData();
    db.exec(`
      DELETE FROM outbox;
      DELETE FROM immunizations;
      DELETE FROM observations;
      DELETE FROM encounters;
      DELETE FROM patients;
    `);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    db.close();
  });

  test('correct credentials create an HttpOnly local session', async () => {
    const user = createUser('local-user', ['patients:read']);
    const response = await request(app).post('/api/auth/login').send({
      username: 'LOCAL-USER',
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: user.id,
        username: 'local-user',
        permissions: ['patients:read'],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(getRawToken(response));

    const setCookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect((db.prepare(`
      SELECT password_hash FROM users WHERE id = ?
    `).get(user.id) as { password_hash: string }).password_hash).toBe(
      passwordHash
    );
    expect(passwordHash).not.toContain(password);
  });

  test('the raw session token is never stored in SQLite', async () => {
    createUser('token-user');
    const response = await request(app).post('/api/auth/login').send({
      username: 'token-user',
      password,
    });
    const rawToken = getRawToken(response);
    const stored = db.prepare(`
      SELECT token_hash FROM auth_sessions
    `).get() as { token_hash: string };

    expect(stored.token_hash).toBe(hashSessionToken(rawToken));
    expect(stored.token_hash).not.toBe(rawToken);
    expect(JSON.stringify(stored)).not.toContain(rawToken);
  });

  test('bad password and missing username return the same generic 401', async () => {
    createUser('known-user');
    const badPassword = await request(app).post('/api/auth/login').send({
      username: 'known-user',
      password: 'wrong-password',
    });
    const missingUser = await request(app).post('/api/auth/login').send({
      username: 'missing-user',
      password: 'wrong-password',
    });

    expect(badPassword.status).toBe(401);
    expect(missingUser.status).toBe(401);
    expect(badPassword.body).toEqual(missingUser.body);
    expect(badPassword.body).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      },
    });
  });

  test('inactive accounts cannot authenticate', async () => {
    createUser('inactive-user', [], false);
    const response = await request(app).post('/api/auth/login').send({
      username: 'inactive-user',
      password,
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('valid session cookie authenticates GET /api/auth/me', async () => {
    createUser('session-user', ['patients:read', 'patients:write']);
    const login = await request(app).post('/api/auth/login').send({
      username: 'session-user',
      password,
    });
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', getRawCookie(login));

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      username: 'session-user',
      permissions: ['patients:read', 'patients:write'],
    });
  });

  test.each([
    ['missing', undefined],
    ['invalid', `${sessionCookieName}=not-a-real-token`],
  ])('%s session returns 401', async (_name, cookie) => {
    const requestBuilder = request(app).get('/api/auth/me');

    if (cookie) {
      requestBuilder.set('Cookie', cookie);
    }

    const response = await requestBuilder;
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  test('expired session returns 401', async () => {
    createUser('expired-user');
    const login = await request(app).post('/api/auth/login').send({
      username: 'expired-user',
      password,
    });
    db.prepare(`
      UPDATE auth_sessions SET expires_at = ?
    `).run('2000-01-01T00:00:00.000Z');

    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', getRawCookie(login));

    expect(response.status).toBe(401);
  });

  test('revoked session returns 401', async () => {
    createUser('revoked-user');
    const login = await request(app).post('/api/auth/login').send({
      username: 'revoked-user',
      password,
    });
    db.prepare(`
      UPDATE auth_sessions SET revoked_at = ?
    `).run(new Date().toISOString());

    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', getRawCookie(login));

    expect(response.status).toBe(401);
  });

  test('logout revokes the current session immediately', async () => {
    createUser('logout-user');
    const login = await request(app).post('/api/auth/login').send({
      username: 'logout-user',
      password,
    });
    const cookie = getRawCookie(login);
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);
    const afterLogout = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(logout.status).toBe(204);
    expect(afterLogout.status).toBe(401);
    expect((db.prepare(`
      SELECT revoked_at FROM auth_sessions
    `).get() as { revoked_at: string | null }).revoked_at).not.toBeNull();
  });

  test('login and health remain public', async () => {
    createUser('public-login');
    const health = await request(app).get('/health');
    const login = await request(app).post('/api/auth/login').send({
      username: 'public-login',
      password,
    });

    expect(health.status).toBe(200);
    expect(login.status).toBe(200);
  });

  test('local login and clinical writes work while Central is unavailable', async () => {
    createUser('offline-user', ['patients:write', 'encounters:write']);
    const network = jest.spyOn(global, 'fetch').mockRejectedValue(
      new Error('Central unavailable')
    );
    const login = await request(app).post('/api/auth/login').send({
      username: 'offline-user',
      password,
    });
    const cookie = getRawCookie(login);
    const patient = await request(app)
      .post('/api/patients')
      .set('Cookie', cookie)
      .send({
        lastName: 'Offline',
        firstName: 'Worker',
        birthDate: '1990-01-01',
        sex: 'unknown',
      });
    const encounter = await request(app)
      .post(`/api/patients/${patient.body.patient.id}/encounters`)
      .set('Cookie', cookie)
      .send({ encounterDate: '2026-09-04T10:00:00.000Z' });

    expect(login.status).toBe(200);
    expect(patient.status).toBe(201);
    expect(encounter.status).toBe(201);
    expect((db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as {
      count: number;
    }).count).toBe(2);
    expect(network).not.toHaveBeenCalled();
  });
});
