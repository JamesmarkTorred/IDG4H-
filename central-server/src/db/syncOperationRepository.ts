import { pool } from './connection';
import type { SyncOperationInput } from '../domain/syncOperation';

export class SyncOperationConflictError extends Error {}

// The immutable inbox is the durable receipt boundary. A later processing
// milestone can apply these operations to Central's clinical/FHIR models.
export async function ingestSyncOperation(input: SyncOperationInput): Promise<void> {
  const values = [
    input.operationId, input.nodeId, input.entityType, input.entityId,
    input.operationType, JSON.stringify(input.payload),
  ];
  const inserted = await pool.query<{ operation_id: string }>(`
    INSERT INTO sync_operations (
      operation_id, node_id, entity_type, entity_id, operation_type, payload
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (operation_id) DO NOTHING
    RETURNING operation_id
  `, values);

  if (inserted.rowCount === 1) return;

  // A conflicting INSERT waits for the first transaction to commit. This next
  // statement sees that committed receipt, including for concurrent retries.
  // JSONB equality accepts equivalent payloads with different key ordering.
  const existing = await pool.query<{ operation_id: string }>(`
    SELECT operation_id FROM sync_operations
    WHERE operation_id = $1 AND node_id = $2 AND entity_type = $3
      AND entity_id = $4 AND operation_type = $5 AND payload = $6::jsonb
  `, values);

  if (existing.rowCount !== 1) {
    throw new SyncOperationConflictError('operationId has already been used for different content.');
  }
}
