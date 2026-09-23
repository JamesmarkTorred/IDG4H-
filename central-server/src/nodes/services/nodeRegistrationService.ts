import { prisma } from '../../db/connection';
import type {
  NodeRegistrationInput,
  RegisteredNode,
} from '../domain/node';
import { verifyRegistrationCode } from './nodeRegistrationCode';
import {
  generateAuthToken,
  hashAuthToken,
} from './nodeAuthToken';

export class NodeRegistrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeRegistrationValidationError';
  }
}

export class NodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`No pending registration exists for node ${nodeId}.`);
    this.name = 'NodeNotFoundError';
  }
}

export class NodeRegistrationCodeInvalidError extends Error {
  constructor() {
    super('Invalid registration code.');
    this.name = 'NodeRegistrationCodeInvalidError';
  }
}

export class NodeAlreadyRegisteredError extends Error {
  constructor(nodeId: string) {
    super(`Node ${nodeId} is already registered.`);
    this.name = 'NodeAlreadyRegisteredError';
  }
}

function requiredField(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new NodeRegistrationValidationError(
      `${fieldName} is required.`,
    );
  }

  return normalized;
}

export async function registerNode(
  input: NodeRegistrationInput,
): Promise<RegisteredNode> {
  const nodeId = requiredField(input.nodeId, 'nodeId');
  const name = requiredField(input.name, 'name');
  const facilityName = requiredField(
    input.facilityName,
    'facilityName',
  );
  const address = requiredField(input.address, 'address');
  const registrationCode = requiredField(
    input.registrationCode,
    'registrationCode',
  );

  const existingNode = await prisma.node.findUnique({
    where: {
      nodeId,
    },
  });

  if (!existingNode) {
    throw new NodeNotFoundError(nodeId);
  }

  if (existingNode.status === 'active') {
    throw new NodeAlreadyRegisteredError(nodeId);
  }

  if (existingNode.status !== 'pending') {
    throw new NodeRegistrationValidationError(
      `Node ${nodeId} cannot be registered while in status ${existingNode.status}.`,
    );
  }

  const validCode = verifyRegistrationCode(
    registrationCode,
    existingNode.registrationCodeHash,
  );

  if (!validCode) {
    throw new NodeRegistrationCodeInvalidError();
  }

  const authToken = generateAuthToken();
  const authTokenHash = hashAuthToken(authToken);
  const registeredAt = new Date();

  const node = await prisma.node.update({
    where: {
      nodeId,
    },
    data: {
      name,
      facilityName,
      address,
      authTokenHash,
      status: 'active',
      registeredAt,
      lastSeenAt: registeredAt,
    },
  });

  return {
    id: node.id,
    nodeId: node.nodeId,
    name: node.name,
    facilityName: node.facilityName,
    address: node.address,
    status: node.status,
    registeredAt: node.registeredAt,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    authToken,
  };
}