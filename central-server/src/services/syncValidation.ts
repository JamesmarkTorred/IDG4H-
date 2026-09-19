import type { SyncOperationInput } from '../domain';

export class InvalidSyncOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSyncOperationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseSyncOperation(
  body: unknown,
): SyncOperationInput {
  if (!isObject(body)) {
    throw new InvalidSyncOperationError(
      'A JSON operation object is required.',
    );
  }

  const {
    operationId,
    nodeId,
    entityType,
    entityId,
    operationType,
    payload,
  } = body;

  if (
    typeof operationId !== 'string' ||
    !operationId.trim()
  ) {
    throw new InvalidSyncOperationError(
      'operationId must be a non-empty string.',
    );
  }

  if (
    typeof nodeId !== 'string' ||
    !nodeId.trim()
  ) {
    throw new InvalidSyncOperationError(
      'nodeId must be a non-empty string.',
    );
  }

  if (
    typeof entityId !== 'string' ||
    !entityId.trim()
  ) {
    throw new InvalidSyncOperationError(
      'entityId must be a non-empty string.',
    );
  }

  const normalizedOperationId = operationId.trim();
  const normalizedNodeId = nodeId.trim();
  const normalizedEntityId = entityId.trim();

  if (!isUuid(normalizedOperationId)) {
    throw new InvalidSyncOperationError(
      'operationId must be a UUID.',
    );
  }

  if (!isUuid(normalizedEntityId)) {
    throw new InvalidSyncOperationError(
      'entityId must be a UUID.',
    );
  }

  if (
    entityType !== 'patient' &&
    entityType !== 'encounter' &&
    entityType !== 'observation' &&
    entityType !== 'immunization'
  ) {
    throw new InvalidSyncOperationError(
      'Unsupported entityType.',
    );
  }

  if (
    operationType !== 'create' &&
    operationType !== 'update' &&
    operationType !== 'delete'
  ) {
    throw new InvalidSyncOperationError(
      'Unsupported operationType.',
    );
  }

  if (payload === undefined) {
    throw new InvalidSyncOperationError(
      'payload is required.',
    );
  }

  return {
    operationId: normalizedOperationId,
    nodeId: normalizedNodeId,
    entityType,
    entityId: normalizedEntityId,
    operationType,
    payload,
  };
}