import { prisma } from '../../db/connection';

import type { NodeSummary } from '../domain/node';

export const NODE_STATUSES = [
  'pending',
  'active',
  'inactive',
] as const;

export type NodeStatus = (typeof NODE_STATUSES)[number];

export class NodeStatusValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeStatusValidationError';
  }
}

export class NodeManagementNodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Node ${nodeId} was not found.`);
    this.name = 'NodeManagementNodeNotFoundError';
  }
}

function requiredNodeId(nodeIdInput: string): string {
  const nodeId = nodeIdInput.trim();

  if (!nodeId) {
    throw new NodeStatusValidationError(
      'nodeId is required.',
    );
  }

  return nodeId;
}

function validateStatus(
  statusInput: string,
): NodeStatus {
  const status = statusInput.trim().toLowerCase();

  if (
    !NODE_STATUSES.includes(
      status as NodeStatus,
    )
  ) {
    throw new NodeStatusValidationError(
      `Invalid node status. Allowed statuses: ${NODE_STATUSES.join(', ')}.`,
    );
  }

  return status as NodeStatus;
}

export async function listNodes(): Promise<NodeSummary[]> {
  const nodes = await prisma.node.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      nodeId: true,
      name: true,
      facilityName: true,
      address: true,
      status: true,
      registeredAt: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return nodes;
}

export async function getNode(
  nodeIdInput: string,
): Promise<NodeSummary | null> {
  const nodeId = nodeIdInput.trim();

  if (!nodeId) {
    return null;
  }

  return prisma.node.findUnique({
    where: {
      nodeId,
    },
    select: {
      id: true,
      nodeId: true,
      name: true,
      facilityName: true,
      address: true,
      status: true,
      registeredAt: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateNodeStatus(
  nodeIdInput: string,
  statusInput: string,
): Promise<NodeSummary> {
  const nodeId = requiredNodeId(nodeIdInput);
  const status = validateStatus(statusInput);

  const existingNode = await prisma.node.findUnique({
    where: {
      nodeId,
    },
    select: {
      id: true,
      nodeId: true,
    },
  });

  if (!existingNode) {
    throw new NodeManagementNodeNotFoundError(nodeId);
  }

  return prisma.node.update({
    where: {
      nodeId,
    },
    data: {
      status,
    },
    select: {
      id: true,
      nodeId: true,
      name: true,
      facilityName: true,
      address: true,
      status: true,
      registeredAt: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}