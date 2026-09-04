import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { db } from '../db/connection';
import type { AuthenticatedUser, PermissionKey } from './permissions';

export interface LocalUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

function mapUser(row: UserRow): LocalUserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSession(row: SessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export class AuthRepository {
  constructor(private readonly database: Database.Database) {}

  createUser(input: {
    username: string;
    passwordHash: string;
    isActive?: boolean;
  }): LocalUserRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.database.prepare(`
      INSERT INTO users (
        id, username, password_hash, is_active, created_at, updated_at
      )
      VALUES (
        @id, @username, @passwordHash, @isActive, @createdAt, @updatedAt
      )
    `).run({
      id,
      username: input.username.trim(),
      passwordHash: input.passwordHash,
      isActive: input.isActive === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });

    const user = this.findUserById(id);

    if (!user) {
      throw new Error(`User ${id} could not be retrieved.`);
    }

    return user;
  }

  findUserById(id: string): LocalUserRecord | undefined {
    const row = this.database.prepare(`
      SELECT * FROM users WHERE id = ?
    `).get(id) as UserRow | undefined;

    return row ? mapUser(row) : undefined;
  }

  findUserByUsername(username: string): LocalUserRecord | undefined {
    const row = this.database.prepare(`
      SELECT * FROM users WHERE username = ? COLLATE NOCASE
    `).get(username.trim()) as UserRow | undefined;

    return row ? mapUser(row) : undefined;
  }

  createRole(name: string, description?: string): string {
    const existing = this.database.prepare(`
      SELECT id FROM roles WHERE name = ?
    `).get(name) as { id: string } | undefined;

    if (existing) {
      return existing.id;
    }

    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO roles (id, name, description)
      VALUES (?, ?, ?)
    `).run(id, name, description ?? null);

    return id;
  }

  assignRoleToUser(userId: string, roleId: string): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO user_roles (user_id, role_id)
      VALUES (?, ?)
    `).run(userId, roleId);
  }

  grantPermissionToRole(roleId: string, permission: PermissionKey): void {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
      SELECT ?, id
      FROM permissions
      WHERE permission_key = ?
    `).run(roleId, permission);

    if (result.changes !== 1 && !this.database.prepare(`
      SELECT 1
      FROM role_permissions role_permission
      JOIN permissions permission
        ON permission.id = role_permission.permission_id
      WHERE role_permission.role_id = ?
        AND permission.permission_key = ?
    `).get(roleId, permission)) {
      throw new Error(`Permission ${permission} is not registered.`);
    }
  }

  findPermissionsForUser(userId: string): PermissionKey[] {
    const rows = this.database.prepare(`
      SELECT DISTINCT permission.permission_key
      FROM permissions permission
      JOIN role_permissions role_permission
        ON role_permission.permission_id = permission.id
      JOIN user_roles user_role
        ON user_role.role_id = role_permission.role_id
      WHERE user_role.user_id = ?
      ORDER BY permission.permission_key
    `).all(userId) as Array<{ permission_key: PermissionKey }>;

    return rows.map(row => row.permission_key);
  }

  findAuthenticatedUser(userId: string): AuthenticatedUser | undefined {
    const user = this.findUserById(userId);

    if (!user || !user.isActive) {
      return undefined;
    }

    return {
      id: user.id,
      username: user.username,
      permissions: this.findPermissionsForUser(user.id),
    };
  }

  createSession(input: {
    userId: string;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
  }): AuthSessionRecord {
    const id = randomUUID();

    this.database.prepare(`
      INSERT INTO auth_sessions (
        id, user_id, token_hash, created_at, expires_at, last_seen_at
      )
      VALUES (
        @id, @userId, @tokenHash, @createdAt, @expiresAt, @createdAt
      )
    `).run({ id, ...input });

    const session = this.findSessionByTokenHash(input.tokenHash);

    if (!session) {
      throw new Error(`Session ${id} could not be retrieved.`);
    }

    return session;
  }

  findSessionByTokenHash(tokenHash: string): AuthSessionRecord | undefined {
    const row = this.database.prepare(`
      SELECT * FROM auth_sessions WHERE token_hash = ?
    `).get(tokenHash) as SessionRow | undefined;

    return row ? mapSession(row) : undefined;
  }

  touchSession(id: string, lastSeenAt: string): void {
    this.database.prepare(`
      UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?
    `).run(lastSeenAt, id);
  }

  revokeSession(tokenHash: string, revokedAt: string): boolean {
    const result = this.database.prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `).run(revokedAt, tokenHash);

    return result.changes === 1;
  }
}

export const authRepository = new AuthRepository(db);
