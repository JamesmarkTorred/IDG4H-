export type SyncEntityType = 'patient' | 'encounter' | 'observation' | 'immunization';
export type SyncOperationType = 'create' | 'update' | 'delete';

export interface SyncOperationInput {
  operationId: string;
  nodeId: string;
  entityType: SyncEntityType;
  entityId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
}

export interface SyncAcknowledgement {
  operationId: string;
}
