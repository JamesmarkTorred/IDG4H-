export type OutboxEntityType =
  | 'patient'
  | 'encounter'
  | 'observation'
  | 'immunization';

export type OutboxOperationType =
  | 'create'
  | 'update'
  | 'delete';

export type OutboxStatus =
  | 'pending'
  | 'processing'
  | 'failed'
  | 'acknowledged';

export interface OutboxInput {
  entityType: OutboxEntityType;
  entityId: string;
  operationType: OutboxOperationType;

  payload: unknown;
}

export interface OutboxRecord {
  id: string;
  operationId: string;

  nodeId: string;

  entityType: OutboxEntityType;
  entityId: string;
  operationType: OutboxOperationType;

  payload: unknown;

  status: OutboxStatus;

  attemptCount: number;

  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lastError?: string;

  createdAt: string;
  updatedAt: string;

  acknowledgedAt?: string;
}
