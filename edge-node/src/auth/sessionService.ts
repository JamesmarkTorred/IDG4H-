import { createHash, randomBytes } from 'node:crypto';

import config from '../config';
import {
  AuthRepository,
  authRepository,
  type AuthSessionRecord,
} from './authRepository';
import type { AuthenticatedUser } from './permissions';

export const sessionCookieName = 'idg4h_session';

export interface CreatedSession {
  token: string;
  record: AuthSessionRecord;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class SessionService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessionTtlMs = config.authSessionTtlMs,
    private readonly now: () => Date = () => new Date()
  ) {}

  createSession(userId: string): CreatedSession {
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlMs);
    const record = this.repository.createSession({
      userId,
      tokenHash: hashSessionToken(token),
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return { token, record };
  }

  authenticate(token: string): AuthenticatedUser | undefined {
    const tokenHash = hashSessionToken(token);
    const session = this.repository.findSessionByTokenHash(tokenHash);
    const now = this.now();

    if (
      !session ||
      session.revokedAt !== undefined ||
      Date.parse(session.expiresAt) <= now.getTime()
    ) {
      return undefined;
    }

    const user = this.repository.findAuthenticatedUser(session.userId);

    if (!user) {
      return undefined;
    }

    this.repository.touchSession(session.id, now.toISOString());
    return user;
  }

  revoke(token: string): boolean {
    return this.repository.revokeSession(
      hashSessionToken(token),
      this.now().toISOString()
    );
  }
}

export const sessionService = new SessionService(authRepository);
