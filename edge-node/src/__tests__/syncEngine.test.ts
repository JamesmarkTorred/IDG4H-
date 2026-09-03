import { db } from '../db/connection';

import {
  enqueueOutboxOperation,
  findOutboxById,
  markOutboxProcessing,
} from '../db/outboxRepository';

import {
  ExponentialBackoffRetryPolicy,
} from '../sync/retryPolicy';

import {
  SyncEngine,
} from '../sync/syncEngine';

import type {
  OutboxRecord,
} from '../domain';

import type {
  SyncTransport,
  SyncAcknowledgement,
} from '../sync/syncTransport';

class SuccessfulTransport
  implements SyncTransport
{
  async send(
    operation: OutboxRecord
  ): Promise<SyncAcknowledgement> {
    return {
      operationId:
        operation.operationId,
    };
  }
}

class FailingTransport
  implements SyncTransport
{
  async send(): Promise<SyncAcknowledgement> {
    throw new Error(
      'Synthetic network failure'
    );
  }
}

describe('SyncEngine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T08:00:00.000Z'));
    db.prepare(`
      DELETE FROM outbox
    `).run();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  afterAll(() => db.close());

  function enqueueTestOperation() {
    return enqueueOutboxOperation({
      entityType: 'patient',
      entityId: 'patient-sync-test',
      operationType: 'create',
      payload: { id: 'patient-sync-test' },
    });
  }

  test(
    'acknowledges successfully synchronized operations',
    async () => {
      const operation =
        enqueueOutboxOperation({
          entityType: 'patient',
          entityId: 'patient-sync-001',
          operationType: 'create',

          payload: {
            id: 'patient-sync-001',
          },
        });

      const engine = new SyncEngine(
        new SuccessfulTransport(),
        new ExponentialBackoffRetryPolicy()
      );

      const result =
        await engine.runOnce();

      expect(result.attempted)
        .toBe(1);

      expect(result.acknowledged)
        .toBe(1);

      expect(result.failed)
        .toBe(0);

      const stored =
        findOutboxById(
          operation.id
        );

      expect(stored?.status)
        .toBe('acknowledged');

      expect(stored?.attemptCount)
        .toBe(1);
    }
  );

  test(
    'failed synchronization schedules retry',
    async () => {
      const operation =
        enqueueOutboxOperation({
          entityType: 'patient',
          entityId: 'patient-sync-002',
          operationType: 'create',

          payload: {
            id: 'patient-sync-002',
          },
        });

      const engine = new SyncEngine(
        new FailingTransport(),
        new ExponentialBackoffRetryPolicy()
      );

      const result =
        await engine.runOnce();

      expect(result.failed)
        .toBe(1);

      const stored =
        findOutboxById(
          operation.id
        );

      expect(stored?.status)
        .toBe('failed');

      expect(stored?.attemptCount)
        .toBe(1);

      expect(stored?.lastError)
        .toBe(
          'Synthetic network failure'
        );

      expect(
        stored?.nextAttemptAt
      ).toBeTruthy();
      expect(stored?.nextAttemptAt).toBe('2026-09-03T08:00:05.000Z');
    }
  );

  test(
    'recovers stale processing operation',
    () => {
      const operation =
        enqueueOutboxOperation({
          entityType: 'observation',
          entityId:
            'observation-sync-001',
          operationType: 'create',

          payload: {
            id:
              'observation-sync-001',
          },
        });

      markOutboxProcessing(
        operation.id
      );

      /*
       * Artificially make the operation old enough
       * to simulate an application crash.
       */
      db.prepare(`
        UPDATE outbox
        SET last_attempt_at = ?
        WHERE id = ?
      `).run(
        new Date(
          Date.now() -
            10 * 60_000
        ).toISOString(),

        operation.id
      );

      const engine = new SyncEngine(
        new SuccessfulTransport(),
        new ExponentialBackoffRetryPolicy(),
        {
          staleProcessingMs:
            60_000,
        }
      );

      const recovered =
        engine.recoverStaleOperations();

      expect(recovered)
        .toBe(1);

      const stored =
        findOutboxById(
          operation.id
        );

      expect(stored?.status)
        .toBe('failed');

      expect(
        stored?.nextAttemptAt
      ).toBeTruthy();
    }
  );

  test(
    'rejects mismatched acknowledgement',
    async () => {
      class InvalidAckTransport
        implements SyncTransport
      {
        async send(): Promise<SyncAcknowledgement> {
          return {
            operationId:
              'wrong-operation-id',
          };
        }
      }

      const operation =
        enqueueOutboxOperation({
          entityType: 'encounter',
          entityId:
            'encounter-sync-001',
          operationType: 'create',

          payload: {
            id:
              'encounter-sync-001',
          },
        });

      const engine = new SyncEngine(
        new InvalidAckTransport(),
        new ExponentialBackoffRetryPolicy()
      );

      await engine.runOnce();

      const stored =
        findOutboxById(
          operation.id
        );

      expect(stored?.status)
        .toBe('failed');

      expect(stored?.lastError)
        .toContain(
          'Acknowledgement mismatch'
        );
    }
  );
  test('retries only when due, doubles the delay, and preserves operation identity through acknowledgment', async () => {
    const operation = enqueueTestOperation();
    const transport = new SuccessfulTransport();
    const send = jest.spyOn(transport, 'send')
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'));
    const engine = new SyncEngine(transport, new ExponentialBackoffRetryPolicy());

    expect(await engine.runOnce()).toEqual({ attempted: 1, acknowledged: 0, failed: 1 });
    expect(findOutboxById(operation.id)?.nextAttemptAt).toBe('2026-09-03T08:00:05.000Z');
    jest.setSystemTime(new Date('2026-09-03T08:00:04.999Z'));
    expect(await engine.runOnce()).toEqual({ attempted: 0, acknowledged: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-09-03T08:00:05.000Z'));
    expect(await engine.runOnce()).toEqual({ attempted: 1, acknowledged: 0, failed: 1 });
    expect(findOutboxById(operation.id)).toMatchObject({
      attemptCount: 2,
      nextAttemptAt: '2026-09-03T08:00:15.000Z',
      lastError: 'Second failure',
    });
    jest.setSystemTime(new Date('2026-09-03T08:00:15.000Z'));
    expect(await engine.runOnce()).toEqual({ attempted: 1, acknowledged: 1, failed: 0 });
    const stored = findOutboxById(operation.id)!;
    expect(stored.status).toBe('acknowledged');
    expect(stored.attemptCount).toBe(3);
    expect(stored.operationId).toBe(operation.operationId);
    expect(stored.lastError).toBeUndefined();
    expect(stored.nextAttemptAt).toBeUndefined();
    expect(send.mock.calls.map(([sent]) => sent.operationId)).toEqual([
      operation.operationId, operation.operationId, operation.operationId,
    ]);
    expect(await engine.runOnce()).toEqual({ attempted: 0, acknowledged: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  test('honors batch size, marks processing before sending, and continues after a transport failure', async () => {
    const first = enqueueTestOperation();
    jest.setSystemTime(new Date('2026-09-03T08:00:01.000Z'));
    const second = enqueueTestOperation();
    jest.setSystemTime(new Date('2026-09-03T08:00:02.000Z'));
    const third = enqueueTestOperation();
    const send = jest.fn(async (operation: OutboxRecord): Promise<SyncAcknowledgement> => {
      expect(findOutboxById(operation.id)?.status).toBe('processing');
      if (operation.id === first.id) {
        throw 'Synthetic non-Error failure';
      }
      return { operationId: operation.operationId };
    });
    const engine = new SyncEngine({ send }, new ExponentialBackoffRetryPolicy(), { batchSize: 2 });

    expect(await engine.runOnce()).toEqual({ attempted: 2, acknowledged: 1, failed: 1 });
    expect(send.mock.calls.map(([operation]) => operation.id)).toEqual([first.id, second.id]);
    expect(findOutboxById(first.id)?.lastError).toBe('Unknown synchronization error');
    expect(findOutboxById(third.id)?.status).toBe('pending');
    expect(await engine.runOnce()).toEqual({ attempted: 1, acknowledged: 1, failed: 0 });
    expect(send.mock.calls.map(([operation]) => operation.id)).toEqual([first.id, second.id, third.id]);
  });

  test('recovers only processing rows strictly older than the cutoff without changing attempt counts', async () => {
    const stale = enqueueTestOperation();
    const boundary = enqueueTestOperation();
    const recent = enqueueTestOperation();
    const missingTimestamp = enqueueTestOperation();
    const pending = enqueueTestOperation();
    for (const record of [stale, boundary, recent, missingTimestamp]) {
      markOutboxProcessing(record.id);
    }
    const setAttemptTime = db.prepare('UPDATE outbox SET last_attempt_at = ? WHERE id = ?');
    setAttemptTime.run('2026-09-03T07:58:59.999Z', stale.id);
    setAttemptTime.run('2026-09-03T07:59:00.000Z', boundary.id);
    setAttemptTime.run('2026-09-03T07:59:30.000Z', recent.id);
    setAttemptTime.run(null, missingTimestamp.id);
    const unchanged = [boundary, recent, missingTimestamp, pending].map((record) => findOutboxById(record.id));
    const engine = new SyncEngine(new SuccessfulTransport(), new ExponentialBackoffRetryPolicy(), {
      staleProcessingMs: 60_000,
    });

    expect(engine.recoverStaleOperations()).toBe(1);
    expect(findOutboxById(stale.id)).toMatchObject({
      operationId: stale.operationId,
      status: 'failed',
      attemptCount: 1,
      lastError: 'Recovered stale processing operation after restart.',
      lastAttemptAt: '2026-09-03T07:58:59.999Z',
      nextAttemptAt: '2026-09-03T08:00:00.000Z',
      updatedAt: '2026-09-03T08:00:00.000Z',
    });
    expect(engine.recoverStaleOperations()).toBe(0);
    expect([boundary, recent, missingTimestamp, pending].map((record) => findOutboxById(record.id))).toEqual(unchanged);
    expect(await engine.runOnce()).toEqual({ attempted: 2, acknowledged: 2, failed: 0 });
    expect(findOutboxById(stale.id)).toMatchObject({
      operationId: stale.operationId, status: 'acknowledged', attemptCount: 2,
    });
  });

  test('uses the injected retry policy with the current attempt count', async () => {
    const operation = enqueueTestOperation();
    const calculateNextAttempt = jest.fn(() => new Date('2026-09-03T09:00:00.000Z'));
    const engine = new SyncEngine(new FailingTransport(), { calculateNextAttempt });

    await engine.runOnce();
    expect(calculateNextAttempt).toHaveBeenCalledWith(1);
    expect(findOutboxById(operation.id)?.nextAttemptAt).toBe('2026-09-03T09:00:00.000Z');
  });
});
