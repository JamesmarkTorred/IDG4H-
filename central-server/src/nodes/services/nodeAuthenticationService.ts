import { prisma } from '../../db/connection';
import { verifyAuthToken } from './nodeAuthToken';

export class NodeAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeAuthenticationError';
  }
}

export interface AuthenticatedNode {
  id: string;
  nodeId: string;
  status: string;
}

export async function authenticateNode(
  nodeId: string,
  authToken: string,
): Promise<AuthenticatedNode> {
  const normalizedNodeId = nodeId.trim();
  const normalizedAuthToken = authToken.trim();

  if (!normalizedNodeId) {
    throw new NodeAuthenticationError(
      'X-IDG4H-Node-ID is required.',
    );
  }

  if (!normalizedAuthToken) {
    throw new NodeAuthenticationError(
      'X-IDG4H-Node-Token is required.',
    );
  }

  const node = await prisma.node.findUnique({
    where: {
      nodeId: normalizedNodeId,
    },
    select: {
      id: true,
      nodeId: true,
      status: true,
      authTokenHash: true,
    },
  });

  if (!node || node.status !== 'active') {
    throw new NodeAuthenticationError(
      'Node authentication failed.',
    );
  }

  if (!node.authTokenHash) {
    throw new NodeAuthenticationError(
      'Node authentication failed.',
    );
  }

  const validToken = verifyAuthToken(
    normalizedAuthToken,
    node.authTokenHash,
  );

  if (!validToken) {
    throw new NodeAuthenticationError(
      'Node authentication failed.',
    );
  }

  await prisma.node.update({
    where: {
      id: node.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return {
    id: node.id,
    nodeId: node.nodeId,
    status: node.status,
  };
}