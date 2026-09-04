import type Database from 'better-sqlite3';

import { permissionKeys } from './permissions';

const permissionDescriptions: Record<(typeof permissionKeys)[number], string> = {
  'patients:read': 'Read patient records.',
  'patients:write': 'Create and update patient records.',
  'encounters:read': 'Read encounter records.',
  'encounters:write': 'Create clinical encounters and child records.',
  'imports:read': 'Read import jobs and row audit results.',
  'imports:write': 'Submit patient import files.',
  'users:manage': 'Manage local user access and permission assignments.',
};

export function initializeAuthSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      permission_key TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
      ON auth_sessions(user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
      ON auth_sessions(expires_at);
  `);

  const insertPermission = database.prepare(`
    INSERT INTO permissions (id, permission_key, description)
    VALUES (@id, @permissionKey, @description)
    ON CONFLICT(permission_key) DO UPDATE SET
      description = excluded.description
  `);

  database.transaction(() => {
    for (const permissionKey of permissionKeys) {
      insertPermission.run({
        id: permissionKey,
        permissionKey,
        description: permissionDescriptions[permissionKey],
      });
    }
  })();
}
