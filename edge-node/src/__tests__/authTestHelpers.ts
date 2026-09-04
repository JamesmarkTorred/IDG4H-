import { randomUUID } from 'node:crypto';

import type { Express } from 'express';
import request from 'supertest';

import { authRepository } from '../auth/authRepository';
import { hashPassword } from '../auth/passwordService';
import type { PermissionKey } from '../auth/permissions';

const testPassword = 'test-password-only';

export async function createAuthenticatedAgent(
  app: Express,
  permissions: readonly PermissionKey[]
): Promise<ReturnType<typeof request.agent>> {
  const suffix = randomUUID();
  const username = `test-${suffix}`;
  const passwordHash = await hashPassword(testPassword);
  const user = authRepository.createUser({ username, passwordHash });
  const roleId = authRepository.createRole(`test-role-${suffix}`);

  for (const permission of permissions) {
    authRepository.grantPermissionToRole(roleId, permission);
  }

  authRepository.assignRoleToUser(user.id, roleId);

  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({
    username,
    password: testPassword,
  });

  if (response.status !== 200) {
    throw new Error(`Test user login failed with HTTP ${response.status}.`);
  }

  return agent;
}
