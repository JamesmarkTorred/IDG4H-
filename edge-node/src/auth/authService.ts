import { authRepository } from './authRepository';
import { verifyPassword } from './passwordService';
import type { AuthenticatedUser } from './permissions';

const dummyPasswordHash = [
  'scrypt',
  '16384',
  '8',
  '1',
  'AAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
].join('$');

export async function authenticateCredentials(
  username: string,
  password: string
): Promise<AuthenticatedUser | undefined> {
  const user = authRepository.findUserByUsername(username);
  const validPassword = await verifyPassword(
    password,
    user?.passwordHash ?? dummyPasswordHash
  );

  if (!user || !user.isActive || !validPassword) {
    return undefined;
  }

  return authRepository.findAuthenticatedUser(user.id);
}
