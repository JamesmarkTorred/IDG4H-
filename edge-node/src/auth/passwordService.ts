import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const keyLength = 64;
const saltLength = 16;
const cost = 16_384;
const blockSize = 8;
const parallelization = 1;
const maxMemory = 64 * 1024 * 1024;

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: { cost: number; blockSize: number; parallelization: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, {
      N: parameters.cost,
      r: parameters.blockSize,
      p: parameters.parallelization,
      maxmem: maxMemory,
    }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new Error('Password must not be empty.');
  }

  const salt = randomBytes(saltLength);
  const hash = await deriveKey(password, salt, {
    cost,
    blockSize,
    parallelization,
  });

  return [
    'scrypt',
    cost,
    blockSize,
    parallelization,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  const parts = encodedHash.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const parsedCost = Number.parseInt(parts[1], 10);
  const parsedBlockSize = Number.parseInt(parts[2], 10);
  const parsedParallelization = Number.parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');

  if (
    parsedCost !== cost ||
    parsedBlockSize !== blockSize ||
    parsedParallelization !== parallelization ||
    salt.length !== saltLength ||
    expected.length !== keyLength
  ) {
    return false;
  }

  const actual = await deriveKey(password, salt, {
    cost: parsedCost,
    blockSize: parsedBlockSize,
    parallelization: parsedParallelization,
  });

  return timingSafeEqual(actual, expected);
}
