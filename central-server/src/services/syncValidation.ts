import type { SyncOperationInput } from '../domain';

export class InvalidSyncOperationError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSyncOperation(body: unknown): SyncOperationInput {
  if (!isObject(body)) {
    throw new InvalidSyncOperationError('A JSON operation object is required.');
  }
  const { operationId, nodeId, entityType, entityId, operationType, payload } = body;
  if (typeof operationId !== 'string' || !operationId.trim() ||
      typeof nodeId !== 'string' || !nodeId.trim() ||
      typeof entityId !== 'string' || !entityId.trim()) {
    throw new InvalidSyncOperationError('operationId, nodeId, and entityId must be non-empty strings.');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(operationId.trim()) || !uuid.test(entityId.trim())) {
    throw new InvalidSyncOperationError('operationId and entityId must be UUIDs.');
  }
  if (entityType !== 'patient' && entityType !== 'encounter' &&
      entityType !== 'observation' && entityType !== 'immunization') {
    throw new InvalidSyncOperationError('Unsupported entityType.');
  }
  if (operationType !== 'create' && operationType !== 'update' && operationType !== 'delete') {
    throw new InvalidSyncOperationError('Unsupported operationType.');
  }
  if (payload === undefined) {
    throw new InvalidSyncOperationError('payload is required.');
  }
  return { operationId: operationId.trim(), nodeId: nodeId.trim(), entityType,
    entityId: entityId.trim(), operationType, payload };
}
