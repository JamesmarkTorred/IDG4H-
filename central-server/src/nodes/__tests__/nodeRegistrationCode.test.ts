import {
  generateRegistrationCode,
  hashRegistrationCode,
  verifyRegistrationCode,
} from '../services/nodeRegistrationCode';

describe('node registration code', () => {
  it('generates an IDG4H registration code', () => {
    const code = generateRegistrationCode();

    expect(code).toMatch(/^IDG4H-[A-Z0-9_-]+$/);
  });

  it('generates different codes', () => {
    const first = generateRegistrationCode();
    const second = generateRegistrationCode();

    expect(first).not.toBe(second);
  });

  it('hashes a registration code', () => {
    const code = generateRegistrationCode();
    const hash = hashRegistrationCode(code);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies the correct registration code', () => {
    const code = generateRegistrationCode();
    const hash = hashRegistrationCode(code);

    expect(verifyRegistrationCode(code, hash)).toBe(true);
  });

  it('rejects an incorrect registration code', () => {
    const code = generateRegistrationCode();
    const hash = hashRegistrationCode(code);

    expect(
      verifyRegistrationCode('IDG4H-WRONG-CODE', hash),
    ).toBe(false);
  });

  it('is case-insensitive', () => {
    const code = generateRegistrationCode();
    const hash = hashRegistrationCode(code);

    expect(
      verifyRegistrationCode(code.toLowerCase(), hash),
    ).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    const code = generateRegistrationCode();
    const hash = hashRegistrationCode(code);

    expect(
      verifyRegistrationCode(`  ${code}  `, hash),
    ).toBe(true);
  });
});