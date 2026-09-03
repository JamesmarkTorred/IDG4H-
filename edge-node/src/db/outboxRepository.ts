import { randomUUID } from 'crypto';

import config from '../config';
import { db } from './connection';

import type {
  OutboxInput,
  OutboxRecord,
  OutboxStatus,
} from '../domain';

interface OutboxRow {
  id: string;
  operation_id: string;

  node_id: string;

  entity_type: OutboxRecord['entityType'];
  entity_id: string;
  operation_type: OutboxRecord['operationType'];

  payload: string;

  status: OutboxStatus;

  attempt_count: number;

  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;

  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
}

function mapOutboxRow(
  row: OutboxRow
): OutboxRecord {
  return {
    id: row.id,
    operationId: row.operation_id,

    nodeId: row.node_id,

    entityType: row.entity_type,
    entityId: row.entity_id,
    operationType: row.operation_type,

    payload: JSON.parse(row.payload),

    status: row.status,

    attemptCount: row.attempt_count,

    nextAttemptAt:
      row.next_attempt_at ?? undefined,

    lastAttemptAt:
      row.last_attempt_at ?? undefined,

    lastError:
      row.last_error ?? undefined,

    createdAt: row.created_at,
    updatedAt: row.updated_at,

    acknowledgedAt:
      row.acknowledged_at ?? undefined,
  };
}

export function enqueueOutboxOperation(
  input: OutboxInput
): OutboxRecord {
  const id = randomUUID();

  /*
   * operationId is deliberately independent from the
   * database row ID.
   *
   * It will later become the idempotency identifier used
   * between the Edge Node and Central Server.
   */
  const operationId = randomUUID();

  const now = new Date().toISOString();

  const serializedPayload = JSON.stringify(
    input.payload
  );

  db.prepare(`
    INSERT INTO outbox (
      id,
      operation_id,
      node_id,
      entity_type,
      entity_id,
      operation_type,
      payload,
      status,
      attempt_count,
      next_attempt_at,
      last_attempt_at,
      last_error,
      created_at,
      updated_at,
      acknowledged_at
    )
    VALUES (
      @id,
      @operationId,
      @nodeId,
      @entityType,
      @entityId,
      @operationType,
      @payload,
      'pending',
      0,
      NULL,
      NULL,
      NULL,
      @createdAt,
      @updatedAt,
      NULL
    )
  `).run({
    id,
    operationId,

    nodeId: config.nodeId,

    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,

    payload: serializedPayload,

    createdAt: now,
    updatedAt: now,
  });

  const record = findOutboxById(id);

  if (!record) {
    throw new Error(
      `Outbox operation ${id} was inserted but could not be retrieved.`
    );
  }

  return record;
}

export function findOutboxById(
  id: string
): OutboxRecord | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM outbox
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as OutboxRow | undefined;

  return row
    ? mapOutboxRow(row)
    : undefined;
}

export function findOutboxByOperationId(
  operationId: string
): OutboxRecord | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM outbox
      WHERE operation_id = ?
      LIMIT 1
    `)
    .get(operationId) as OutboxRow | undefined;

  return row
    ? mapOutboxRow(row)
    : undefined;
}

export function findPendingOutbox(
  limit = 100
): OutboxRecord[] {
  const now = new Date().toISOString();

  const rows = db
    .prepare(`
      SELECT *
      FROM outbox
      WHERE status IN ('pending', 'failed')
        AND (
          next_attempt_at IS NULL
          OR next_attempt_at <= ?
        )
      ORDER BY created_at ASC
      LIMIT ?
    `)
    .all(
      now,
      limit
    ) as OutboxRow[];

  return rows.map(mapOutboxRow);
}

export function markOutboxProcessing(
  id: string
): void {
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      UPDATE outbox
      SET
        status = 'processing',
        attempt_count = attempt_count + 1,
        last_attempt_at = @now,
        updated_at = @now
      WHERE id = @id
        AND status IN ('pending', 'failed')
    `)
    .run({
      id,
      now,
    });

  if (result.changes !== 1) {
    throw new Error(
      `Outbox ${id} could not be marked processing.`
    );
  }
}

export function markOutboxAcknowledged(
  id: string
): void {
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      UPDATE outbox
      SET
        status = 'acknowledged',
        acknowledged_at = @now,
        next_attempt_at = NULL,
        last_error = NULL,
        updated_at = @now
      WHERE id = @id
    `)
    .run({
      id,
      now,
    });

  if (result.changes !== 1) {
    throw new Error(
      `Outbox ${id} could not be acknowledged.`
    );
  }
}

export function markOutboxFailed(
  id: string,
  error: string,
  nextAttemptAt: string
): void {
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      UPDATE outbox
      SET
        status = 'failed',
        last_error = @error,
        next_attempt_at = @nextAttemptAt,
        updated_at = @now
      WHERE id = @id
    `)
    .run({
      id,
      error,
      nextAttemptAt,
      now,
    });

  if (result.changes !== 1) {
    throw new Error(
      `Outbox ${id} could not be marked failed.`
    );
  }
}

export function recoverStaleProcessing(
  staleBefore: string
): number {
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      UPDATE outbox
      SET
        status = 'failed',
        last_error = 'Recovered stale processing operation after restart.',
        next_attempt_at = @now,
        updated_at = @now
      WHERE status = 'processing'
        AND last_attempt_at IS NOT NULL
        AND last_attempt_at < @staleBefore
    `)
    .run({
      now,
      staleBefore,
    });

  return result.changes;
}
