import type { SyncOperationInput } from '../domain/syncOperation';

export class InvalidSyncOperationError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSyncOperation(
  body: unknown,
  idempotencyKey: string | undefined,
  nodeHeader: string | undefined
): SyncOperationInput {
  if (!isObject(body)) {
    throw new InvalidSyncOperationError('A JSON operation object is required.');
  }
  const fields = ['operationId', 'nodeId', 'entityType', 'entityId', 'operationType', 'payload'];
  if (Object.keys(body).some((key) => !fields.includes(key))) {
    throw new InvalidSyncOperationError('The operation contains unsupported fields.');
  }
  const { operationId, nodeId, entityType, entityId, operationType, payload } = body;
  if (typeof operationId !== 'string' || !operationId.trim() ||
      typeof nodeId !== 'string' || !nodeId.trim() ||
      typeof entityId !== 'string' || !entityId.trim()) {
    throw new InvalidSyncOperationError('operationId, nodeId, and entityId must be non-empty strings.');
  }
  if (entityType !== 'patient' && entityType !== 'encounter' &&
      entityType !== 'observation' && entityType !== 'immunization') {
    throw new InvalidSyncOperationError('Unsupported entityType.');
  }
  if (operationType !== 'create' && operationType !== 'update' && operationType !== 'delete') {
    throw new InvalidSyncOperationError('Unsupported operationType.');
  }
  if (!isObject(payload)) {
    throw new InvalidSyncOperationError('payload must be a JSON object.');
  }
  if (idempotencyKey !== operationId || nodeHeader !== nodeId) {
    throw new InvalidSyncOperationError('Idempotency-Key and X-IDG4H-Node-ID must match the operation.');
  }
  if (('id' in payload && payload.id !== entityId) ||
      ('nodeId' in payload && payload.nodeId !== nodeId)) {
    throw new InvalidSyncOperationError('Payload identifiers must match the operation.');
  }
  return { operationId, nodeId, entityType, entityId, operationType, payload };
}
