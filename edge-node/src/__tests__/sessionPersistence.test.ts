import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import { AuthRepository } from '../auth/authRepository';
import { initializeAuthSchema } from '../auth/schema';
import { SessionService } from '../auth/sessionService';

describe('SQLite session persistence', () => {
  test('a valid session survives a database close and reopen', () => {
    const dataDirectory = path.resolve(__dirname, '../../data');
    const databasePath = path.join(
      dataDirectory,
      `auth-session-test-${randomUUID()}.sqlite`
    );
    fs.mkdirSync(dataDirectory, { recursive: true });

    let firstDatabase: Database.Database | undefined;
    let reopenedDatabase: Database.Database | undefined;

    try {
      firstDatabase = new Database(databasePath);
      firstDatabase.pragma('foreign_keys = ON');
      initializeAuthSchema(firstDatabase);
      const firstRepository = new AuthRepository(firstDatabase);
      const user = firstRepository.createUser({
        username: 'restart-user',
        passwordHash: 'test-only-hash',
      });
      const roleId = firstRepository.createRole('restart-test-role');
      firstRepository.grantPermissionToRole(roleId, 'patients:read');
      firstRepository.assignRoleToUser(user.id, roleId);
      const created = new SessionService(firstRepository).createSession(user.id);

      firstDatabase.close();
      firstDatabase = undefined;

      reopenedDatabase = new Database(databasePath);
      reopenedDatabase.pragma('foreign_keys = ON');
      const reopenedRepository = new AuthRepository(reopenedDatabase);
      const authenticated = new SessionService(reopenedRepository)
        .authenticate(created.token);

      expect(authenticated).toEqual({
        id: user.id,
        username: 'restart-user',
        permissions: ['patients:read'],
      });
    } finally {
      firstDatabase?.close();
      reopenedDatabase?.close();
      fs.rmSync(databasePath, { force: true });
      fs.rmSync(`${databasePath}-wal`, { force: true });
      fs.rmSync(`${databasePath}-shm`, { force: true });
    }
  });
});
