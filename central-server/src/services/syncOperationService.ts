
import { prisma } from '../db/connection';
import type {
  SyncOperationInput,
  SyncOperationStatus,
} from '../domain';
import { applySyncMutation } from './applySyncOperation';

export interface ReceiveSyncOperationResult {
  duplicate: boolean;
  operationId: string;
  status: 'applied';
}

export class SyncOperationStateError extends Error {}

export async function receiveSyncOperation(
  input: SyncOperationInput,
): Promise<ReceiveSyncOperationResult> {
  return prisma.$transaction(async (tx) => {
    /*
     * createMany + skipDuplicates gives us the equivalent of:
     *
     * INSERT ... ON CONFLICT (operation_id) DO NOTHING
     *
     * The operation ID is the idempotency key. PostgreSQL will wait
     * for a concurrent transaction holding the same unique key before
     * resolving the conflict.
     */
    const inserted = await tx.syncOperation.createMany({
      data: {
        operationId: input.operationId,
        nodeId: input.nodeId,
        entityType: input.entityType,
        entityId: input.entityId,
        operationType: input.operationType,
        payload: input.payload as object,
        status: 'received',
      },
      skipDuplicates: true,
    });

    /*
     * The operation already exists.
     *
     * At this point, a concurrent insert using the same operation ID
     * has already resolved its unique-key conflict, so the existing
     * operation can be read safely inside this transaction.
     */
    if (inserted.count === 0) {
      const existing = await tx.syncOperation.findUnique({
        where: {
          operationId: input.operationId,
        },
      });

      if (!existing || existing.status !== 'applied') {
        throw new SyncOperationStateError(
          `Existing operation is in state ${
            existing?.status ?? 'missing'
          }.`,
        );
      }

      return {
        duplicate: true,
        operationId: existing.operationId,
        status: 'applied',
      };
    }

    /*
     * The operation was newly inserted.
     *
     * The canonical entity mutation happens inside the SAME Prisma
     * transaction as the ledger insert. If the mutation fails,
     * the ledger insert is rolled back as well.
     */
    await applySyncMutation(tx, input);

    /*
     * Only mark the operation as applied after the canonical mutation
     * succeeds.
     */
    await tx.syncOperation.update({
      where: {
        operationId: input.operationId,
      },
      data: {
        status: 'applied',
        appliedAt: new Date(),
        failedAt: null,
        errorMessage: null,
      },
    });

    return {
      duplicate: false,
      operationId: input.operationId,
      status: 'applied',
    };
  });
}

