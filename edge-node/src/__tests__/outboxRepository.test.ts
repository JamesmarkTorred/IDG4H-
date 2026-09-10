import config from '../config';
import { db } from '../db/connection';
import { createPatient } from '../db/patientRepository';

import {
  enqueueOutboxOperation,
  findOutboxById,
  findOutboxByOperationId,
  findPendingOutbox,
  markOutboxProcessing,
  markOutboxFailed,
  markOutboxAcknowledged,
} from '../db/outboxRepository';

describe('outboxRepository', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T08:00:00.000Z'));

    db.prepare(`
      DELETE FROM outbox
    `).run();
  });

  afterEach(() => jest.useRealTimers());

  afterAll(() => db.close());

  function enqueueTestOperation() {
    return enqueueOutboxOperation({
      entityType: 'patient',
      entityId: 'test-entity',
      operationType: 'update',
      payload: {
        id: 'test-entity',
        nested: {
          values: [0, false, null, 'test'],
        },
      },
    });
  }

  test('creates a pending outbox operation', () => {
    const record = enqueueOutboxOperation({
      entityType: 'patient',
      entityId: 'patient-test-001',
      operationType: 'create',
      payload: {
        id: 'patient-test-001',
        firstName: 'Synthetic',
        lastName: 'Patient',
      },
    });

    expect(record.nodeId).toBe(config.nodeId);
    expect(record.status).toBe('pending');
    expect(record.attemptCount).toBe(0);

    expect(record.operationId).toBeTruthy();
    expect(record.operationId).not.toBe(record.id);

    expect(record.payload).toEqual({
      id: 'patient-test-001',
      firstName: 'Synthetic',
      lastName: 'Patient',
    });

    expect(record.createdAt).toBe('2026-09-03T08:00:00.000Z');
    expect(record.updatedAt).toBe(record.createdAt);

    expect(record.nextAttemptAt).toBeUndefined();
    expect(record.lastAttemptAt).toBeUndefined();
    expect(record.lastError).toBeUndefined();
    expect(record.acknowledgedAt).toBeUndefined();
  });

  test('retrieves operation by identifiers', () => {
    const created = enqueueOutboxOperation({
      entityType: 'encounter',
      entityId: 'encounter-test-001',
      operationType: 'create',
      payload: {
        id: 'encounter-test-001',
      },
    });

    expect(findOutboxById(created.id)?.id).toBe(created.id);

    expect(
      findOutboxByOperationId(created.operationId)?.operationId
    ).toBe(created.operationId);
  });

  test('returns pending operations', () => {
    const created = enqueueOutboxOperation({
      entityType: 'observation',
      entityId: 'observation-test-001',
      operationType: 'create',
      payload: {
        id: 'observation-test-001',
      },
    });

    const pending = findPendingOutbox();

    expect(
      pending.some((item) => item.id === created.id)
    ).toBe(true);
  });

  test('tracks processing attempts', () => {
    const created = enqueueOutboxOperation({
      entityType: 'patient',
      entityId: 'patient-test-002',
      operationType: 'update',
      payload: {
        id: 'patient-test-002',
      },
    });

    markOutboxProcessing(created.id);

    const updated = findOutboxById(created.id);

    expect(updated?.status).toBe('processing');
    expect(updated?.attemptCount).toBe(1);
    expect(updated?.lastAttemptAt).toBeTruthy();
  });

  test('records failed synchronization', () => {
    const created = enqueueOutboxOperation({
      entityType: 'patient',
      entityId: 'patient-test-003',
      operationType: 'update',
      payload: {
        id: 'patient-test-003',
      },
    });

    markOutboxProcessing(created.id);

    const nextAttemptAt = new Date(
      Date.now() + 60_000
    ).toISOString();

    markOutboxFailed(
      created.id,
      'Synthetic network failure',
      nextAttemptAt
    );

    const failed = findOutboxById(created.id);

    expect(failed?.status).toBe('failed');

    expect(failed?.lastError).toBe(
      'Synthetic network failure'
    );

    expect(failed?.nextAttemptAt).toBe(
      nextAttemptAt
    );
  });

  test('acknowledges synchronized operation', () => {
    const created = enqueueOutboxOperation({
      entityType: 'immunization',
      entityId: 'immunization-test-001',
      operationType: 'create',
      payload: {
        id: 'immunization-test-001',
      },
    });

    markOutboxProcessing(created.id);
    markOutboxAcknowledged(created.id);

    const acknowledged = findOutboxById(created.id);

    expect(acknowledged?.status).toBe('acknowledged');
    expect(acknowledged?.acknowledgedAt).toBeTruthy();
    expect(acknowledged?.lastError).toBeUndefined();
  });

  test('round-trips JSON payloads and keeps unique operation IDs separate from row IDs', () => {
    const first = enqueueTestOperation();
    const second = enqueueTestOperation();

    expect(
      new Set([
        first.id,
        first.operationId,
        second.id,
        second.operationId,
      ]).size
    ).toBe(4);

    expect(findOutboxById(first.id)).toEqual(first);
    expect(findOutboxByOperationId(first.operationId)).toEqual(first);

    const stored = db
      .prepare<[string], { payload: string }>(
        'SELECT payload FROM outbox WHERE id = ?'
      )
      .get(first.id);

    expect(JSON.parse(stored!.payload)).toEqual(
      first.payload
    );
  });

  test('returns only due pending or failed operations in creation order, respecting the limit', () => {
    const pending = enqueueTestOperation();

    jest.setSystemTime(
      new Date('2026-09-03T08:00:01.000Z')
    );

    const processing = enqueueTestOperation();
    markOutboxProcessing(processing.id);

    jest.setSystemTime(
      new Date('2026-09-03T08:00:02.000Z')
    );

    const acknowledged = enqueueTestOperation();
    markOutboxProcessing(acknowledged.id);
    markOutboxAcknowledged(acknowledged.id);

    jest.setSystemTime(
      new Date('2026-09-03T08:00:03.000Z')
    );

    const due = enqueueTestOperation();
    markOutboxProcessing(due.id);
    markOutboxFailed(
      due.id,
      'Retry due',
      '2026-09-03T08:00:10.000Z'
    );

    jest.setSystemTime(
      new Date('2026-09-03T08:00:04.000Z')
    );

    const deferred = enqueueTestOperation();
    markOutboxProcessing(deferred.id);
    markOutboxFailed(
      deferred.id,
      'Retry later',
      '2026-09-03T08:00:11.000Z'
    );

    jest.setSystemTime(
      new Date('2026-09-03T08:00:10.000Z')
    );

    expect(
      findPendingOutbox().map((record) => record.id)
    ).toEqual([
      pending.id,
      due.id,
    ]);

    expect(
      findPendingOutbox(1).map((record) => record.id)
    ).toEqual([
      pending.id,
    ]);

    expect(findPendingOutbox(0)).toEqual([]);

    jest.setSystemTime(
      new Date('2026-09-03T08:00:11.000Z')
    );

    expect(
      findPendingOutbox().map((record) => record.id)
    ).toEqual([
      pending.id,
      due.id,
      deferred.id,
    ]);
  });

  test('retries preserve operation identity and acknowledgment clears retry metadata', () => {
    const created = enqueueTestOperation();

    markOutboxProcessing(created.id);

    markOutboxFailed(
      created.id,
      'Temporary failure',
      '2026-09-03T08:01:00.000Z'
    );

    jest.setSystemTime(
      new Date('2026-09-03T08:01:00.000Z')
    );

    markOutboxProcessing(created.id);

    expect(findOutboxById(created.id)).toMatchObject({
      operationId: created.operationId,
      attemptCount: 2,
      lastAttemptAt: '2026-09-03T08:01:00.000Z',
      createdAt: created.createdAt,
    });

    jest.setSystemTime(
      new Date('2026-09-03T08:01:01.000Z')
    );

    markOutboxAcknowledged(created.id);

    const acknowledged = findOutboxById(created.id)!;

    expect(acknowledged.operationId).toBe(
      created.operationId
    );

    expect(acknowledged.attemptCount).toBe(2);
    expect(acknowledged.status).toBe('acknowledged');

    expect(acknowledged.acknowledgedAt).toBe(
      '2026-09-03T08:01:01.000Z'
    );

    expect(acknowledged.updatedAt).toBe(
      acknowledged.acknowledgedAt
    );

    expect(acknowledged.nextAttemptAt).toBeUndefined();
    expect(acknowledged.lastError).toBeUndefined();

    expect(findPendingOutbox()).toEqual([]);
  });

  test('prevents processing an already processing or acknowledged operation', () => {
    const created = enqueueTestOperation();

    markOutboxProcessing(created.id);

    expect(() =>
      markOutboxProcessing(created.id)
    ).toThrow('could not be marked processing');

    expect(
      findOutboxById(created.id)?.attemptCount
    ).toBe(1);

    markOutboxAcknowledged(created.id);

    expect(() =>
      markOutboxProcessing(created.id)
    ).toThrow('could not be marked processing');

    expect(
      findOutboxById(created.id)?.status
    ).toBe('acknowledged');

    expect(
      findOutboxById(created.id)?.attemptCount
    ).toBe(1);
  });

  test('returns undefined for missing identifiers and reports missing update targets', () => {
    expect(findOutboxById('missing')).toBeUndefined();
    expect(
      findOutboxByOperationId('missing')
    ).toBeUndefined();

    expect(() =>
      markOutboxProcessing('missing')
    ).toThrow('could not be marked processing');

    expect(() =>
      markOutboxAcknowledged('missing')
    ).toThrow('could not be acknowledged');

    expect(() =>
      markOutboxFailed(
        'missing',
        'Test error',
        '2026-09-03T08:01:00.000Z'
      )
    ).toThrow('could not be marked failed');
  });

  test('retains deletion payloads after the clinical record is removed, with no foreign keys', () => {
    const patient = createPatient({
      lastName: 'Synthetic',
      firstName: 'Patient',
      birthDate: '1990-01-01',
      sex: 'unknown',
    });

    const record = enqueueOutboxOperation({
      entityType: 'patient',
      entityId: patient.id,
      operationType: 'delete',
      payload: patient,
    });

    expect(
      db.pragma('foreign_key_list(outbox)')
    ).toEqual([]);

    db.prepare(
      'DELETE FROM patients WHERE id = ?'
    ).run(patient.id);

    expect(findOutboxById(record.id)).toEqual(record);
  });

  test('schema initialization preserves queued records and enforces its indexes and constraints', () => {
    const first = enqueueTestOperation();
    const second = enqueueTestOperation();

    expect(findOutboxById(first.id)).toEqual(first);

    const indexes = db
      .prepare<[], { name: string }>(
        'PRAGMA index_list(outbox)'
      )
      .all();

    expect(
      indexes.map((index) => index.name)
    ).toEqual(
      expect.arrayContaining([
        'idx_outbox_status',
        'idx_outbox_next_attempt',
        'idx_outbox_entity',
        'idx_outbox_created_at',
      ])
    );

    expect(() =>
      db
        .prepare(
          'UPDATE outbox SET operation_id = ? WHERE id = ?'
        )
        .run(first.operationId, second.id)
    ).toThrow(/UNIQUE constraint failed/);

    expect(() =>
      db
        .prepare(
          'UPDATE outbox SET entity_type = ? WHERE id = ?'
        )
        .run('invalid', first.id)
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db
        .prepare(
          'UPDATE outbox SET operation_type = ? WHERE id = ?'
        )
        .run('invalid', first.id)
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db
        .prepare(
          'UPDATE outbox SET status = ? WHERE id = ?'
        )
        .run('invalid', first.id)
    ).toThrow(/CHECK constraint failed/);

    expect(findOutboxById(first.id)).toEqual(first);
  });

  test('participates in an enclosing SQLite transaction without committing it independently', () => {
    const existing = enqueueTestOperation();
    const before = findPendingOutbox();

    const failingTransaction = db.transaction(() => {
      enqueueTestOperation();
      throw new Error(
        'Synthetic transaction failure'
      );
    });

    expect(failingTransaction).toThrow(
      'Synthetic transaction failure'
    );

    expect(findPendingOutbox()).toEqual(before);
    expect(findOutboxById(existing.id)).toEqual(existing);
    expect(db.inTransaction).toBe(false);
  });
});