import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../app';
import { initSchema, pool } from '../db/connection';
import { findSyncOperationById, insertSyncOperation } from '../db/syncOperationRepository';
import { receiveSyncOperation } from '../services/syncOperationService';
import type { SyncOperationInput } from '../domain';
import swaggerSpec from '../docs/swagger';

const schema = process.env.IDG4H_TEST_SCHEMA;
if (!schema || !/^idg4h_test_[a-f0-9]{32}$/.test(schema)) {
  throw new Error('A generated test schema is required.');
}
let schemaCreated = false;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  const result = await pool.query<{ schema: string }>('SELECT current_schema() AS schema');
  if (result.rows[0].schema !== schema) throw new Error('Test schema isolation failed.');
  await initSchema(1);
});
beforeEach(() => pool.query('TRUNCATE sync_operations'));
afterAll(async () => {
  try {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
});

function operation(): SyncOperationInput {
  const entityId = randomUUID();
  return {
    operationId: randomUUID(), nodeId: 'edge-integration-test', entityType: 'patient',
    entityId, operationType: 'create',
    payload: { id: entityId, nodeId: 'edge-integration-test', firstName: 'Synthetic', version: 1 },
  };
}
function post(input: SyncOperationInput) {
  return request(app).post('/api/sync/operations')
    .set('Idempotency-Key', input.operationId).set('X-IDG4H-Node-ID', input.nodeId).send(input);
}
async function receipts() {
  return (await pool.query('SELECT * FROM sync_operations ORDER BY operation_id')).rows;
}

describe('Central sync operation ledger', () => {
  it('returns a received ledger entry after storing the complete operation', async () => {
    const input = operation();
    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
    const response = await post(input);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ operationId: input.operationId, status: 'received', duplicate: false });
    const saved = await findSyncOperationById(input.operationId);
    expect(saved).toMatchObject({ ...input, status: 'received' });
    expect(saved?.receivedAt).toBe(new Date(saved!.receivedAt).toISOString());
    expect(saved?.appliedAt).toBeUndefined();
    expect(saved?.failedAt).toBeUndefined();
    expect(saved?.errorMessage).toBeUndefined();
  });

  it('returns the original operation without resetting its receipt timestamp on retry', async () => {
    const input = operation();
    expect((await post(input)).status).toBe(201);
    const before = await receipts();
    const response = await post(input);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ operationId: input.operationId, status: 'received', duplicate: true });
    await initSchema(1);
    expect(await receiveSyncOperation(input)).toEqual({ duplicate: true, operation: await findSyncOperationById(input.operationId) });
    expect(await receipts()).toEqual(before);
  });

  it('uses the original entry when the same ID is resubmitted with changed content', async () => {
    const input = operation();
    const first = await receiveSyncOperation(input);
    const duplicate = await receiveSyncOperation({ ...input, payload: { changed: true } });
    expect(duplicate).toEqual({ duplicate: true, operation: first.operation });
    expect(await receipts()).toHaveLength(1);
  });

  it('handles concurrent deliveries with exactly one new receipt', async () => {
    const input = operation();
    const responses = await Promise.all(Array.from({ length: 8 }, () => post(input)));
    expect(responses.filter(response => response.status === 201)).toHaveLength(1);
    expect(responses.filter(response => response.status === 200)).toHaveLength(7);
    for (const response of responses) {
      expect(response.body).toEqual({ operationId: input.operationId, status: 'received', duplicate: response.status === 200 });
    }
    expect(await receipts()).toHaveLength(1);
  });

  it.each(['applied', 'failed'] as const)('returns stored %s status and metadata without reprocessing', async (status) => {
    const input = operation();
    await insertSyncOperation(input);
    const timestamp = '2026-09-03T00:00:00.000Z';
    // Fixtures model a future processor; receipt handling itself never applies mutations.
    await pool.query(`UPDATE sync_operations SET status = $2,
      applied_at = $3, failed_at = $4, error_message = $5 WHERE operation_id = $1`,
    [input.operationId, status, status === 'applied' ? timestamp : null,
      status === 'failed' ? timestamp : null, status === 'failed' ? 'Synthetic failure' : null]);
    const before = await receipts();
    const result = await receiveSyncOperation(input);
    expect(result.duplicate).toBe(true);
    expect(result.operation.status).toBe(status);
    expect(result.operation.appliedAt).toBe(status === 'applied' ? timestamp : undefined);
    expect(result.operation.failedAt).toBe(status === 'failed' ? timestamp : undefined);
    expect(result.operation.errorMessage).toBe(status === 'failed' ? 'Synthetic failure' : undefined);
    expect((await post(input)).body).toEqual({ operationId: input.operationId, status, duplicate: true });
    expect(await receipts()).toEqual(before);
  });

  it.each([null, ['opaque'], 'opaque', 42, false, {}])('retains an opaque JSON payload %j', async (payload) => {
    const input = { ...operation(), payload };
    expect((await post(input)).status).toBe(201);
    expect((await findSyncOperationById(input.operationId))?.payload).toEqual(payload);
  });

  it.each(['patient', 'encounter', 'observation', 'immunization'] as const)('records %s operations without applying canonical mutations', async (entityType) => {
    const input = { ...operation(), entityType };
    for (const operationType of ['create', 'update', 'delete'] as const) {
      expect((await post({ ...input, operationId: randomUUID(), operationType })).status).toBe(201);
    }
    expect(await receipts()).toHaveLength(3);
  });

  it.each([
    { operationId: '' }, { operationId: 'not-a-uuid' }, { nodeId: 123 }, { nodeId: ' ' },
    { entityId: ' ' }, { entityId: 'not-a-uuid' }, { entityType: 'invalid' },
    { operationType: 'invalid' }, { payload: undefined },
  ])('rejects an invalid envelope %j without storing it', async (changes) => {
    const response = await request(app).post('/api/sync/operations').send({ ...operation(), ...changes });
    expect(response.status).toBe(400);
    expect(await receipts()).toEqual([]);
  });

  it('accepts absent headers and trims identifiers', async () => {
    const input = operation();
    const response = await request(app).post('/api/sync/operations').send({
      ...input, operationId: ` ${input.operationId} `, entityId: ` ${input.entityId} `, nodeId: ` ${input.nodeId} `,
    });
    expect(response.status).toBe(201);
    expect(await findSyncOperationById(input.operationId)).toMatchObject(input);
  });

  it.each(['Idempotency-Key', 'X-IDG4H-Node-ID'])('rejects a mismatched %s header', async (header) => {
    const response = await request(app).post('/api/sync/operations')
      .set(header, 'wrong-header').send(operation());
    expect(response.status).toBe(400);
    expect(await receipts()).toEqual([]);
  });

  it('returns a safe JSON error for malformed JSON', async () => {
    const response = await request(app).post('/api/sync/operations')
      .set('Content-Type', 'application/json').send('{invalid');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid JSON body.' });
    expect(await receipts()).toEqual([]);
  });

  it('returns a retryable storage error without claiming receipt when PostgreSQL rejects a write', async () => {
    const input = operation();
    await pool.query(`
      CREATE FUNCTION reject_sync_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic database failure'; END;
      $$;
      CREATE TRIGGER reject_sync_test BEFORE INSERT ON sync_operations
      FOR EACH ROW EXECUTE FUNCTION reject_sync_test();
    `);
    try {
      const response = await post(input);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Synchronization storage is unavailable.' });
      expect(await receipts()).toEqual([]);
    } finally {
      await pool.query('DROP TRIGGER reject_sync_test ON sync_operations; DROP FUNCTION reject_sync_test();');
    }
    expect((await post(input)).status).toBe(201);
  });

  it('enforces UUIDs, uniqueness and the status constraint in PostgreSQL', async () => {
    const input = operation();
    await insertSyncOperation(input);
    await expect(insertSyncOperation(input)).rejects.toMatchObject({ code: '23505' });
    await expect(insertSyncOperation({ ...operation(), entityId: 'invalid' })).rejects.toMatchObject({ code: '22P02' });
    await expect(pool.query('UPDATE sync_operations SET status = $1', ['invalid'])).rejects.toMatchObject({ code: '23514' });
  });

  it('documents separate creation and duplicate receipt responses', () => {
    expect(swaggerSpec).toHaveProperty('paths./api/sync/operations.post.responses.201');
    expect(swaggerSpec).toHaveProperty('paths./api/sync/operations.post.responses.200');
  });
});
