import type { SyncOperationInput, SyncOperationRecord } from '../domain';
import { findSyncOperationById, insertSyncOperation } from '../db/syncOperationRepository';

export interface ReceiveSyncOperationResult {
  duplicate: boolean;
  operation: SyncOperationRecord;
}

export async function receiveSyncOperation(input: SyncOperationInput): Promise<ReceiveSyncOperationResult> {
  const existing = await findSyncOperationById(input.operationId);
  if (existing) return { duplicate: true, operation: existing };

  try {
    const operation = await insertSyncOperation(input);
    return { duplicate: false, operation };
  } catch (error) {
    // Only a primary-key race is a duplicate. Storage failures must stay failures.
    if (typeof error === 'object' && error !== null &&
        'code' in error && error.code === '23505' &&
        'constraint' in error && error.constraint === 'sync_operations_pkey') {
      const existingAfterInsert = await findSyncOperationById(input.operationId);
      if (existingAfterInsert) return { duplicate: true, operation: existingAfterInsert };
    }
    throw error;
  }
}
