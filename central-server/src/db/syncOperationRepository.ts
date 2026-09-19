import { prisma } from './connection';
import type {
  SyncOperationInput,
  SyncOperationRecord,
  SyncOperationStatus,
} from '../domain';

interface SyncOperationPrismaRecord {
  operationId: string;
  nodeId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: unknown;
  status: string;
  receivedAt: Date;
  appliedAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
}

function mapRow(row: SyncOperationPrismaRecord): SyncOperationRecord {
  return {
    operationId: row.operationId,
    nodeId: row.nodeId,
    entityType: row.entityType as SyncOperationRecord['entityType'],
    entityId: row.entityId,
    operationType: row.operationType as SyncOperationRecord['operationType'],
    payload: row.payload,
    status: row.status as SyncOperationStatus,
    receivedAt: row.receivedAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString(),
    failedAt: row.failedAt?.toISOString(),
    errorMessage: row.errorMessage ?? undefined,
  };
}

export async function findSyncOperationById(
  operationId: string,
): Promise<SyncOperationRecord | undefined> {
  const record = await prisma.syncOperation.findUnique({
    where: {
      operationId,
    },
  });

  return record ? mapRow(record) : undefined;
}

export async function insertSyncOperation(
  input: SyncOperationInput,
): Promise<SyncOperationRecord> {
  const record = await prisma.syncOperation.create({
    data: {
      operationId: input.operationId,
      nodeId: input.nodeId,
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: input.payload as object,
      status: 'received',
    },
  });

  return mapRow(record);
}