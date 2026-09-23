import {
  issueNodeRegistrationCode,
  NodeRegistrationCodeConflictError,
  NodeRegistrationCodeValidationError,
} from '../services/nodeRegistrationCodeService';
import {
  hashRegistrationCode,
  verifyRegistrationCode,
} from '../services/nodeRegistrationCode';
import { prisma } from '../../db/connection';

describe('node registration code service', () => {
  const nodeId = `registration-code-test-${Date.now()}`;

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId,
      },
    });

    await prisma.$disconnect();
  });

  it('issues a registration code for a new node', async () => {
    const result = await issueNodeRegistrationCode(nodeId);

    expect(result.nodeId).toBe(nodeId);
    expect(result.registrationCode).toMatch(
      /^IDG4H-[A-Z0-9_-]+$/,
    );

    const storedNode = await prisma.node.findUnique({
      where: {
        nodeId,
      },
    });

    expect(storedNode).not.toBeNull();
    expect(storedNode?.status).toBe('pending');
    expect(storedNode?.registrationCodeHash).not.toBe(
      result.registrationCode,
    );

    expect(
      verifyRegistrationCode(
        result.registrationCode,
        storedNode!.registrationCodeHash,
      ),
    ).toBe(true);
  });

  it('does not allow a registration code for an existing node', async () => {
    await expect(
      issueNodeRegistrationCode(nodeId),
    ).rejects.toBeInstanceOf(
      NodeRegistrationCodeConflictError,
    );
  });

  it('rejects an empty nodeId', async () => {
    await expect(
      issueNodeRegistrationCode('   '),
    ).rejects.toBeInstanceOf(
      NodeRegistrationCodeValidationError,
    );
  });
});