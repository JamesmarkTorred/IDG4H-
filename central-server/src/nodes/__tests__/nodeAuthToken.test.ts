import {
  generateAuthToken,
  hashAuthToken,
  verifyAuthToken,
} from '../services/nodeAuthToken';

describe('Node authentication token', () => {
  it('generates a token with the expected prefix', () => {
    const token = generateAuthToken();

    expect(token.startsWith('idg4h_')).toBe(true);
  });

  it('generates sufficiently long tokens', () => {
    const token = generateAuthToken();

    expect(token.length).toBe(70);
  });

  it('generates different tokens for separate calls', () => {
    const firstToken = generateAuthToken();
    const secondToken = generateAuthToken();

    expect(firstToken).not.toBe(secondToken);
  });

  it('hashes a token without returning the raw token', () => {
    const token = generateAuthToken();
    const hash = hashAuthToken(token);

    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
  });

  it('verifies the correct token', () => {
    const token = generateAuthToken();
    const hash = hashAuthToken(token);

    expect(verifyAuthToken(token, hash)).toBe(true);
  });

  it('rejects an incorrect token', () => {
    const token = generateAuthToken();
    const wrongToken = generateAuthToken();
    const hash = hashAuthToken(token);

    expect(verifyAuthToken(wrongToken, hash)).toBe(false);
  });
});