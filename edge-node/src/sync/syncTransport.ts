import type {
  OutboxRecord,
} from '../domain';

export interface SyncAcknowledgement {
  operationId: string;
}

export interface SyncTransport {
  send(
    operation: OutboxRecord
  ): Promise<SyncAcknowledgement>;
}
