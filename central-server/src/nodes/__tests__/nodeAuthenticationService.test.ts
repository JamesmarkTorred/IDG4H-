import {
  authenticateNode,
  NodeAuthenticationError,
} from '../services/nodeAuthenticationService';
import {
  generateAuthToken,
  hashAuthToken,
} from '../services/nodeAuthToken';
import { prisma } from '../../db/connection';

describe('Node authentication service', () => {
  const activeNodeId = `auth-test-active-${Date.now()}`;
  const pendingNodeId = `auth-test-pending-${Date.now()}`;

  let authToken: string;

  beforeAll(async () => {
    authToken = generateAuthToken();

    await prisma.node.create({
      data: {
        nodeId: activeNodeId,
        name: 'Authentication Test Node',
        facilityName: 'Authentication Test Facility',
        address: 'Authentication Test Address',
        registrationCodeHash: 'unused-registration-code-hash',
        authTokenHash: hashAuthToken(authToken),
        status: 'active',
      },
    });

    await prisma.node.create({
      data: {
        nodeId: pendingNodeId,
        name: 'Pending Authentication Node',
        facilityName: 'Pending Authentication Facility',
        address: 'Pending Authentication Address',
        registrationCodeHash: 'unused-registration-code-hash',
        status: 'pending',
      },
    });
  });

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId: {
          in: [activeNodeId, pendingNodeId],
        },
      },
    });

    await prisma.$disconnect();
  });

  it('authenticates an active node with the correct token', async () => {
    const result = await authenticateNode(
      activeNodeId,
      authToken,
    );

    expect(result).toMatchObject({
      nodeId: activeNodeId,
      status: 'active',
    });
  });

  it('updates lastSeenAt after successful authentication', async () => {
    const before = await prisma.node.findUnique({
      where: {
        nodeId: activeNodeId,
      },
      select: {
        lastSeenAt: true,
      },
    });

    await authenticateNode(activeNodeId, authToken);

    const after = await prisma.node.findUnique({
      where: {
        nodeId: activeNodeId,
      },
      select: {
        lastSeenAt: true,
      },
    });

    expect(after?.lastSeenAt).not.toBeNull();

    if (before?.lastSeenAt && after?.lastSeenAt) {
      expect(after.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
        before.lastSeenAt.getTime(),
      );
    }
  });

  it('rejects an incorrect token', async () => {
    const wrongToken = generateAuthToken();

    await expect(
      authenticateNode(activeNodeId, wrongToken),
    ).rejects.toThrow(NodeAuthenticationError);
  });

  it('rejects an unknown node', async () => {
    await expect(
      authenticateNode(
        'auth-test-node-that-does-not-exist',
        authToken,
      ),
    ).rejects.toThrow(NodeAuthenticationError);
  });

  it('rejects a pending node', async () => {
    await expect(
      authenticateNode(pendingNodeId, authToken),
    ).rejects.toThrow(NodeAuthenticationError);
  });

  it('rejects a missing node ID', async () => {
    await expect(
      authenticateNode('', authToken),
    ).rejects.toThrow(
      'X-IDG4H-Node-ID is required.',
    );
  });

  it('rejects a missing authentication token', async () => {
    await expect(
      authenticateNode(activeNodeId, ''),
    ).rejects.toThrow(
      'X-IDG4H-Node-Token is required.',
    );
  });
});