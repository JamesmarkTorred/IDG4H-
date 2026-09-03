import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../app';
import { initSchema, pool } from '../db/connection';
import type { SyncOperationInput } from '../domain/syncOperation';
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
    .set('Idempotency-Key', input.operationId)
    .set('X-IDG4H-Node-ID', input.nodeId)
    .send(input);
}

async function receipts() {
  return (await pool.query('SELECT * FROM sync_operations ORDER BY operation_id')).rows;
}

describe('POST /api/sync/operations', () => {
  it('acknowledges only after the complete operation has been persisted', async () => {
    const input = operation();
    const response = await post(input);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ operationId: input.operationId });
    const records = await receipts();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      operation_id: input.operationId, node_id: input.nodeId, entity_type: input.entityType,
      entity_id: input.entityId, operation_type: input.operationType, payload: input.payload,
    });
  });

  it('acknowledges an identical retry without replacing or duplicating the receipt', async () => {
    const input = operation();
    expect((await post(input)).status).toBe(200);
    const before = await receipts();
    const retry = { ...input, payload: { version: 1, firstName: 'Synthetic', nodeId: input.nodeId, id: input.entityId } };

    expect((await post(retry)).body).toEqual({ operationId: input.operationId });
    expect(await receipts()).toEqual(before);
    await initSchema(1);
    expect((await post(input)).status).toBe(200);
    expect(await receipts()).toEqual(before);
  });

  it('handles concurrent deliveries of one operation exactly once', async () => {
    const input = operation();
    const responses = await Promise.all(Array.from({ length: 8 }, () => post(input)));

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ operationId: input.operationId });
    }
    expect(await receipts()).toHaveLength(1);
  });

  it.each(['payload', 'node', 'entity', 'operation'] as const)('rejects operation ID reuse with different %s content', async (field) => {
    const input = operation();
    expect((await post(input)).status).toBe(200);
    const before = await receipts();
    let changed: SyncOperationInput = { ...input };
    if (field === 'payload') changed.payload = { ...input.payload, firstName: 'Different' };
    if (field === 'node') changed = { ...input, nodeId: 'another-node', payload: { ...input.payload, nodeId: 'another-node' } };
    if (field === 'entity') changed.entityType = 'encounter';
    if (field === 'operation') changed.operationType = 'update';

    expect((await post(changed)).status).toBe(409);
    expect(await receipts()).toEqual(before);
  });

  it('accepts separate operations for one entity and retains deletion payloads', async () => {
    const first = operation();
    const deletion: SyncOperationInput = { ...first, operationId: randomUUID(), operationType: 'delete', payload: { id: first.entityId } };
    expect((await post(first)).status).toBe(200);
    expect((await post(deletion)).status).toBe(200);
    expect(await receipts()).toHaveLength(2);
  });

  it.each([
    { operationId: '' }, { nodeId: 123 }, { entityId: ' ' }, { entityType: 'invalid' },
    { operationType: 'invalid' }, { payload: null }, { payload: [] }, { payload: { id: 'wrong-entity' } },
    { payload: { nodeId: 'wrong-node' } }, { unexpected: true },
  ])('rejects an invalid envelope %j without storing it', async (changes) => {
    const input = operation();
    const response = await request(app).post('/api/sync/operations')
      .set('Idempotency-Key', input.operationId).set('X-IDG4H-Node-ID', input.nodeId)
      .send({ ...input, ...changes });

    expect(response.status).toBe(400);
    expect(await receipts()).toEqual([]);
  });

  it('rejects missing or mismatched headers', async () => {
    const input = operation();
    const missing = await request(app).post('/api/sync/operations').send(input);
    const mismatch = await request(app).post('/api/sync/operations')
      .set('Idempotency-Key', randomUUID()).set('X-IDG4H-Node-ID', input.nodeId).send(input);

    expect(missing.status).toBe(400);
    expect(mismatch.status).toBe(400);
    expect(await receipts()).toEqual([]);
  });

  it('returns a safe JSON error for malformed JSON', async () => {
    const response = await request(app).post('/api/sync/operations')
      .set('Content-Type', 'application/json').send('{invalid');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid JSON body.' });
    expect(await receipts()).toEqual([]);
  });

  it('does not acknowledge an operation when PostgreSQL rejects its write', async () => {
    const input = operation();
    // This trigger belongs only to this suite's generated schema.
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
    expect((await post(input)).status).toBe(200);
    expect(await receipts()).toHaveLength(1);
  });

  it('includes the ingestion endpoint in generated OpenAPI documentation', () => {
    expect(swaggerSpec).toHaveProperty('paths./api/sync/operations.post');
  });
});
