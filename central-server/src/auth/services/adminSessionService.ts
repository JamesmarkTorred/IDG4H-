import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { prisma } from '../../db/connection';

const SESSION_TOKEN_PREFIX = 'idg4h_session_';
const SESSION_TOKEN_BYTES = 32;
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export class AdminSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminSessionError';
  }
}

export interface CreatedAdminSession {
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
}

export interface AuthenticatedAdminSession {
  sessionId: string;
  userId: string;
  email: string;
  role: string;
  expiresAt: Date;
}

function generateSessionToken(): string {
  return `${SESSION_TOKEN_PREFIX}${randomBytes(
    SESSION_TOKEN_BYTES,
  ).toString('hex')}`;
}

function hashSessionToken(token: string): string {
  return createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function verifySessionToken(
  token: string,
  expectedHash: string,
): boolean {
  const actualHash = hashSessionToken(token);

  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    actualBuffer,
    expectedBuffer,
  );
}

export async function createAdminSession(
  userId: string,
): Promise<CreatedAdminSession> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new AdminSessionError(
      'User ID is required.',
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: normalizedUserId,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!user || user.role !== 'admin') {
    throw new AdminSessionError(
      'Administrator account not found.',
    );
  }

  const sessionToken = generateSessionToken();
  const sessionTokenHash =
    hashSessionToken(sessionToken);

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS,
  );

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      sessionTokenHash,
      expiresAt,
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  return {
    sessionId: session.id,
    sessionToken,
    expiresAt: session.expiresAt,
  };
}

export async function authenticateAdminSession(
  sessionTokenInput: string,
): Promise<AuthenticatedAdminSession> {
  const sessionToken = sessionTokenInput.trim();

  if (!sessionToken) {
    throw new AdminSessionError(
      'Session token is required.',
    );
  }

  const sessions = await prisma.userSession.findMany({
    where: {
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      userId: true,
      sessionTokenHash: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });

  for (const session of sessions) {
    if (
      !verifySessionToken(
        sessionToken,
        session.sessionTokenHash,
      )
    ) {
      continue;
    }

    if (session.user.role !== 'admin') {
      throw new AdminSessionError(
        'Administrator session required.',
      );
    }

    const updatedSession =
      await prisma.userSession.update({
        where: {
          id: session.id,
        },
        data: {
          lastSeenAt: new Date(),
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

    return {
      sessionId: updatedSession.id,
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      expiresAt: updatedSession.expiresAt,
    };
  }

  throw new AdminSessionError(
    'Invalid or expired administrator session.',
  );
}

export async function revokeAdminSession(
  sessionTokenInput: string,
): Promise<void> {
  const sessionToken = sessionTokenInput.trim();

  if (!sessionToken) {
    return;
  }

  const sessionTokenHash =
    hashSessionToken(sessionToken);

  await prisma.userSession.deleteMany({
    where: {
      sessionTokenHash,
    },
  });
}