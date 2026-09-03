import { pool } from './connection';
import type { SyncOperationInput, SyncOperationRecord, SyncOperationStatus } from '../domain';

interface SyncOperationRow {
  operation_id: string;
  node_id: string;
  entity_type: SyncOperationRecord['entityType'];
  entity_id: string;
  operation_type: SyncOperationRecord['operationType'];
  payload: unknown;
  status: SyncOperationStatus;
  received_at: Date;
  applied_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
}

function mapRow(row: SyncOperationRow): SyncOperationRecord {
  return {
    operationId: row.operation_id,
    nodeId: row.node_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operationType: row.operation_type,
    payload: row.payload,
    status: row.status,
    receivedAt: row.received_at.toISOString(),
    appliedAt: row.applied_at?.toISOString(),
    failedAt: row.failed_at?.toISOString(),
    errorMessage: row.error_message ?? undefined,
  };
}

export async function findSyncOperationById(operationId: string): Promise<SyncOperationRecord | undefined> {
  const result = await pool.query<SyncOperationRow>(`
    SELECT * FROM sync_operations WHERE operation_id = $1 LIMIT 1
  `, [operationId]);
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function insertSyncOperation(input: SyncOperationInput): Promise<SyncOperationRecord> {
  const result = await pool.query<SyncOperationRow>(`
    INSERT INTO sync_operations (
      operation_id, node_id, entity_type, entity_id, operation_type, payload, status
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'received')
    RETURNING *
  `, [input.operationId, input.nodeId, input.entityType, input.entityId,
    input.operationType, JSON.stringify(input.payload)]);
  const row = result.rows[0];
  if (!row) throw new Error(`Synchronization operation ${input.operationId} was not stored.`);
  return mapRow(row);
}
