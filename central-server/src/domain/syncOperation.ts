export type SyncEntityType = 'patient' | 'encounter' | 'observation' | 'immunization';
export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncOperationStatus = 'received' | 'applied' | 'failed';

export interface SyncOperationInput {
  operationId: string;
  nodeId: string;
  entityType: SyncEntityType;
  entityId: string;
  operationType: SyncOperationType;
  payload: unknown;
}

export interface SyncOperationRecord extends SyncOperationInput {
  status: SyncOperationStatus;
  receivedAt: string;
  appliedAt?: string;
  failedAt?: string;
  errorMessage?: string;
}

// A receipt does not acknowledge successful canonical application.
export interface SyncOperationReceipt {
  operationId: string;
  status: SyncOperationStatus;
  duplicate: boolean;
}
