import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const REGISTRATION_CODE_BYTES = 9;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function generateRegistrationCode(): string {
  const randomPart = randomBytes(REGISTRATION_CODE_BYTES)
    .toString('base64url')
    .toUpperCase();

  return `IDG4H-${randomPart}`;
}

export function hashRegistrationCode(code: string): string {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    throw new Error('Registration code cannot be empty.');
  }

  return createHash('sha256')
    .update(normalizedCode, 'utf8')
    .digest('hex');
}

export function verifyRegistrationCode(
  code: string,
  expectedHash: string,
): boolean {
  const actualHash = Buffer.from(
    hashRegistrationCode(code),
    'hex',
  );

  const storedHash = Buffer.from(expectedHash, 'hex');

  if (actualHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(actualHash, storedHash);
}