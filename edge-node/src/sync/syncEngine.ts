import {
  findPendingOutbox,
  markOutboxAcknowledged,
  markOutboxFailed,
  markOutboxProcessing,
  recoverStaleProcessing,
} from '../db/outboxRepository';

import type {
  OutboxRecord,
} from '../domain';

import type {
  RetryPolicy,
} from './retryPolicy';

import type {
  SyncTransport,
} from './syncTransport';

export interface SyncRunResult {
  attempted: number;
  acknowledged: number;
  failed: number;
}

export interface SyncEngineOptions {
  batchSize?: number;
  staleProcessingMs?: number;
}

export class SyncEngine {
  private readonly batchSize: number;
  private readonly staleProcessingMs: number;

  constructor(
    private readonly transport: SyncTransport,
    private readonly retryPolicy: RetryPolicy,
    options: SyncEngineOptions = {}
  ) {
    this.batchSize =
      options.batchSize ?? 50;

    this.staleProcessingMs =
      options.staleProcessingMs ??
      5 * 60_000;
  }

  recoverStaleOperations(): number {
    const staleBefore =
      new Date(
        Date.now() -
          this.staleProcessingMs
      ).toISOString();

    return recoverStaleProcessing(
      staleBefore
    );
  }

  async runOnce(): Promise<SyncRunResult> {
    const operations =
      findPendingOutbox(
        this.batchSize
      );

    const result: SyncRunResult = {
      attempted: 0,
      acknowledged: 0,
      failed: 0,
    };

    for (const operation of operations) {
      result.attempted += 1;

      const succeeded =
        await this.processOperation(
          operation
        );

      if (succeeded) {
        result.acknowledged += 1;
      } else {
        result.failed += 1;
      }
    }

    return result;
  }

  private async processOperation(
    operation: OutboxRecord
  ): Promise<boolean> {
    markOutboxProcessing(
      operation.id
    );

    try {
      const acknowledgement =
        await this.transport.send(
          operation
        );

      if (
        acknowledgement.operationId !==
        operation.operationId
      ) {
        throw new Error(
          `Acknowledgement mismatch for operation ${operation.operationId}.`
        );
      }

      markOutboxAcknowledged(
        operation.id
      );

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown synchronization error';

      /*
       * markOutboxProcessing increments attemptCount.
       * The object we loaded still contains the previous
       * value, so +1 represents the current attempt.
       */
      const currentAttempt =
        operation.attemptCount + 1;

      const nextAttempt =
        this.retryPolicy
          .calculateNextAttempt(
            currentAttempt
          )
          .toISOString();

      markOutboxFailed(
        operation.id,
        message,
        nextAttempt
      );

      return false;
    }
  }
}
