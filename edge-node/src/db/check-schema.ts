import { db } from './connection';

interface TableColumn {
  name: string;
  type: string;
  notnull: 0 | 1;
}

const expectedTables = [
  'patients',
  'encounters',
  'observations',
  'immunizations',
  'outbox',
  'import_jobs',
  'import_row_results',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'auth_sessions',
];

console.log('Checking SQLite schema...\n');

for (const tableName of expectedTables) {
  const table = db
    .prepare<[string], { name: string }>(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
    `)
    .get(tableName);

  if (!table) {
    throw new Error(`Missing table: ${tableName}`);
  }

  console.log(`[OK] ${tableName}`);

  const columns = db
    .prepare<[], TableColumn>(`PRAGMA table_info(${tableName})`)
    .all();

  for (const column of columns) {
    console.log(
      `  - ${column.name} | ${column.type} | required=${column.notnull === 1}`
    );
  }

  console.log('');
}

const foreignKeys = db.pragma('foreign_keys', {
  simple: true,
});

if (foreignKeys !== 1) {
  throw new Error('SQLite foreign keys are not enabled.');
}

console.log('[OK] Foreign keys enabled');
console.log('\nSchema verification successful.');

db.close();
