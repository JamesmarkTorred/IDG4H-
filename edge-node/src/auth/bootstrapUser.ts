import { authRepository } from './authRepository';
import { hashPassword } from './passwordService';
import { permissionKeys } from './permissions';
import { db } from '../db/connection';

const bootstrapRoleName = 'edge-bootstrap-administrator';

async function main(): Promise<void> {
  const username = process.env.IDG4H_BOOTSTRAP_USERNAME?.trim();
  const password = process.env.IDG4H_BOOTSTRAP_PASSWORD;

  if (!username || !/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new Error(
      'IDG4H_BOOTSTRAP_USERNAME must contain 3-64 letters, numbers, dots, underscores, or hyphens.'
    );
  }

  if (!password || password.length < 12 || password.length > 256) {
    throw new Error(
      'IDG4H_BOOTSTRAP_PASSWORD must contain 12-256 characters.'
    );
  }

  if (authRepository.findUserByUsername(username)) {
    throw new Error(`Local user ${username} already exists.`);
  }

  const passwordHash = await hashPassword(password);

  db.transaction(() => {
    const user = authRepository.createUser({ username, passwordHash });
    const roleId = authRepository.createRole(
      bootstrapRoleName,
      'Installation bootstrap role with all current technical permissions.'
    );

    for (const permission of permissionKeys) {
      authRepository.grantPermissionToRole(roleId, permission);
    }

    authRepository.assignRoleToUser(user.id, roleId);
  })();

  console.log(`Created local bootstrap user: ${username}`);
  console.log(
    'Operational role names and assignments must be configured after workflow validation.'
  );
}

void main()
  .catch(error => {
    console.error(
      '[auth:bootstrap] failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
