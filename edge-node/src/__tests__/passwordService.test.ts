import { hashPassword, verifyPassword } from '../auth/passwordService';

describe('local password hashing', () => {
  test('stores a salted scrypt representation instead of plaintext', async () => {
    const password = 'correct horse battery staple';
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(first).not.toContain(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('incorrect password', first)).toBe(false);
  });

  test('rejects malformed stored password hashes safely', async () => {
    expect(await verifyPassword('anything', 'not-a-password-hash')).toBe(false);
  });
});
