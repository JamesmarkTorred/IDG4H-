import type Database from 'better-sqlite3';

import { permissionKeys } from './permissions';

const permissionDescriptions: Record<
  (typeof permissionKeys)[number],
  string
> = {
  'patients:read': 'Read patient records.',
  'patients:write': 'Create and update patient records.',
  'encounters:read': 'Read encounter records.',
  'encounters:write': 'Create clinical encounters and child records.',
  'imports:read': 'Read import jobs and row audit results.',
  'imports:write': 'Submit patient import files.',
  'users:manage': 'Manage local user access and permission assignments.',
};

/**
 * Seeds the permissions required by the edge-node
 * authentication system.
 *
 * Database tables are managed exclusively through
 * Prisma Migrate.
 */
export function initializeAuthData(
  database: Database.Database
): void {
  const insertPermission = database.prepare(`
    INSERT INTO permissions (
      id,
      permission_key,
      description
    )
    VALUES (
      @id,
      @permissionKey,
      @description
    )
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
