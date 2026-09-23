import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const AUTH_TOKEN_PREFIX = 'idg4h_';
const AUTH_TOKEN_BYTES = 32;

export function generateAuthToken(): string {
  return `${AUTH_TOKEN_PREFIX}${randomBytes(AUTH_TOKEN_BYTES).toString('hex')}`;
}

export function hashAuthToken(token: string): string {
  return createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

export function verifyAuthToken(
  token: string,
  expectedHash: string,
): boolean {
  const actualHash = hashAuthToken(token);

  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}