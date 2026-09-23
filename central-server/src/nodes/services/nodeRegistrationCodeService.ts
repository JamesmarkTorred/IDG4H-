import { prisma } from '../../db/connection';
import {
  generateRegistrationCode,
  hashRegistrationCode,
} from './nodeRegistrationCode';

export interface IssuedNodeRegistrationCode {
  nodeId: string;
  registrationCode: string;
}

export class NodeRegistrationCodeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeRegistrationCodeValidationError';
  }
}

export class NodeRegistrationCodeConflictError extends Error {
  constructor(nodeId: string) {
    super(
      `A node registration already exists for nodeId ${nodeId}.`,
    );
    this.name = 'NodeRegistrationCodeConflictError';
  }
}

function requiredField(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new NodeRegistrationCodeValidationError(
      `${fieldName} is required.`,
    );
  }

  return normalized;
}

export async function issueNodeRegistrationCode(
  nodeIdInput: string,
): Promise<IssuedNodeRegistrationCode> {
  const nodeId = requiredField(nodeIdInput, 'nodeId');

  const existingNode = await prisma.node.findUnique({
    where: {
      nodeId,
    },
  });

  if (existingNode) {
    throw new NodeRegistrationCodeConflictError(nodeId);
  }

  const registrationCode = generateRegistrationCode();
  const registrationCodeHash =
    hashRegistrationCode(registrationCode);

  await prisma.node.create({
    data: {
      nodeId,
      name: 'Pending Node',
      facilityName: 'Pending Facility',
      address: 'Pending Address',
      registrationCodeHash,
      status: 'pending',
    },
  });

  return {
    nodeId,
    registrationCode,
  };
}