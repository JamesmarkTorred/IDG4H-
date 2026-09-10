
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

const testDatabaseDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'idg4h-edge-test-')
);

const testDatabasePath = path.join(
  testDatabaseDirectory,
  'edge-node.sqlite'
);

// These must be set before application modules load config/connection.
process.env.NODE_ENV = 'test';
process.env.DB_PATH = testDatabasePath;

const migrationPath = path.resolve(
  __dirname,
  '../../prisma/migrations/00000000000000_baseline/migration.sql'
);

if (!fs.existsSync(migrationPath)) {
  throw new Error(
    `Prisma baseline migration was not found: ${migrationPath}`
  );
}

const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const database = new Database(testDatabasePath);

try {
  database.pragma('foreign_keys = ON');

  // Prisma migration is the source of truth for the database schema.
  database.exec(migrationSql);

  // Seed the application's registered permissions.
  const permissions = [
    ['patients:read', 'Read patient records.'],
    ['patients:write', 'Create and update patient records.'],
    ['encounters:read', 'Read clinical encounter records.'],
    ['encounters:write', 'Create and update clinical encounter records.'],
    ['imports:read', 'Read patient import jobs and results.'],
    ['imports:write', 'Create and process patient imports.'],
    ['users:manage', 'Manage application users and access.'],
  ] as const;

  const insertPermission = database.prepare(`
    INSERT INTO permissions (
      id,
      permission_key,
      description
    )
    VALUES (?, ?, ?)
  `);

  const seedPermissions = database.transaction(() => {
    for (const [permissionKey, description] of permissions) {
      insertPermission.run(
        permissionKey,
        permissionKey,
        description
      );
    }
  });

  seedPermissions();

  const tables = database
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all() as Array<{ name: string }>;

  console.log(
    `[test-db] initialized ${testDatabasePath}`
  );

  console.log(
    `[test-db] tables: ${tables.map((table) => table.name).join(', ')}`
  );

  const permissionCount = database
    .prepare('SELECT COUNT(*) AS count FROM permissions')
    .get() as { count: number };

  console.log(
    `[test-db] seeded ${permissionCount.count} permissions`
  );
} finally {
  database.close();
}

process.on('exit', () => {
  try {
    fs.rmSync(testDatabaseDirectory, {
      recursive: true,
      force: true,
    });
  } catch {
    // Best-effort cleanup only.
  }
});
