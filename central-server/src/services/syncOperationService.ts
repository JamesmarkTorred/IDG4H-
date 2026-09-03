import { pool } from '../db/connection';
import type { SyncOperationInput, SyncOperationStatus } from '../domain';
import { applySyncMutation } from './applySyncOperation';

export interface ReceiveSyncOperationResult {
  duplicate: boolean;
  operationId: string;
  status: 'applied';
}

export class SyncOperationStateError extends Error {}

export async function receiveSyncOperation(input: SyncOperationInput): Promise<ReceiveSyncOperationResult> {
  const client = await pool.connect();
  let discardConnection = false;
  try {
    await client.query('BEGIN');

    // SELECT FOR UPDATE cannot lock an absent row. The unique insert waits for
    // a concurrent first delivery to commit or roll back before deciding ownership.
    const inserted = await client.query<{ operation_id: string }>(`
      INSERT INTO sync_operations (
        operation_id, node_id, entity_type, entity_id, operation_type, payload, status
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'received')
      ON CONFLICT (operation_id) DO NOTHING
      RETURNING operation_id
    `, [input.operationId, input.nodeId, input.entityType, input.entityId,
      input.operationType, JSON.stringify(input.payload)]);

    if (inserted.rowCount === 0) {
      const existing = await client.query<{ operation_id: string; status: SyncOperationStatus }>(`
        SELECT operation_id, status FROM sync_operations WHERE operation_id = $1 FOR UPDATE
      `, [input.operationId]);
      const row = existing.rows[0];
      if (!row || row.status !== 'applied') {
        throw new SyncOperationStateError(`Existing operation is in state ${row?.status ?? 'missing'}.`);
      }
      await client.query('COMMIT');
      return { duplicate: true, operationId: row.operation_id, status: 'applied' };
    }

    await applySyncMutation(client, input);
    await client.query(`
      UPDATE sync_operations SET status = 'applied', applied_at = NOW(),
        failed_at = NULL, error_message = NULL WHERE operation_id = $1
    `, [input.operationId]);
    await client.query('COMMIT');
    return { duplicate: false, operationId: inserted.rows[0].operation_id, status: 'applied' };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Discard a broken connection rather than returning an aborted transaction.
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}
