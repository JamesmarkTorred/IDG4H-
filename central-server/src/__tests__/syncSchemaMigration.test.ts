import { randomUUID } from 'node:crypto';
import { initSchema, pool } from '../db/connection';
import { findSyncOperationById, insertSyncOperation } from '../db/syncOperationRepository';

const schema = process.env.IDG4H_TEST_SCHEMA;
if (!schema || !/^idg4h_test_[a-f0-9]{32}$/.test(schema)) {
  throw new Error('A generated test schema is required.');
}
let schemaCreated = false;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  const current = await pool.query('SELECT current_schema() AS schema');
  if (current.rows[0].schema !== schema) throw new Error('Test schema isolation failed.');
});

beforeEach(async () => {
  // This suite alone owns the table in its generated schema.
  await pool.query(`
    DROP TABLE IF EXISTS sync_operations;
    CREATE TABLE sync_operations (
      operation_id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('patient', 'encounter', 'observation', 'immunization')),
      entity_id TEXT NOT NULL,
      operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
      payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_sync_operations_node_received ON sync_operations(node_id, received_at);
    CREATE INDEX idx_sync_operations_entity ON sync_operations(entity_type, entity_id);
  `);
});

afterAll(async () => {
  try {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
});

async function insertLegacy(operationId: string, entityId: string) {
  await pool.query(`INSERT INTO sync_operations VALUES
    ($1, 'edge-test', 'patient', $2, 'create', '{"synthetic":true}', '2026-09-01T00:00:00Z')`,
  [operationId, entityId]);
}

it('upgrades existing receipts to UUID ledger records without losing payloads or timestamps', async () => {
  const operationId = randomUUID();
  const entityId = randomUUID();
  await insertLegacy(operationId, entityId);
  await initSchema(1);
  const saved = await findSyncOperationById(operationId);
  expect(saved).toEqual({ operationId, entityId, nodeId: 'edge-test', entityType: 'patient',
    operationType: 'create', payload: { synthetic: true }, status: 'received',
    receivedAt: '2026-09-01T00:00:00.000Z', appliedAt: undefined, failedAt: undefined, errorMessage: undefined });
  const types = await pool.query(`SELECT pg_typeof(operation_id)::text AS operation_type,
    pg_typeof(entity_id)::text AS entity_type FROM sync_operations`);
  expect(types.rows[0]).toEqual({ operation_type: 'uuid', entity_type: 'uuid' });
  await initSchema(1);
  expect(await findSyncOperationById(operationId)).toEqual(saved);
  // The old object-only payload constraint must also be migrated.
  expect((await insertSyncOperation({ ...saved!, operationId: randomUUID(), payload: null })).payload).toBeNull();
  const indexes = await pool.query('SELECT indexname FROM pg_indexes WHERE schemaname = $1', [schema]);
  expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining([
    'idx_sync_operations_node', 'idx_sync_operations_entity',
    'idx_sync_operations_status', 'idx_sync_operations_received',
  ]));
});

it('rolls back schema conversion without discarding an invalid legacy identifier', async () => {
  await insertLegacy(randomUUID(), 'invalid-legacy-entity-id');
  const before = await pool.query('SELECT * FROM sync_operations');
  await expect(initSchema(1)).rejects.toMatchObject({ code: '22P02' });
  expect((await pool.query('SELECT * FROM sync_operations')).rows).toEqual(before.rows);
  const types = await pool.query(`SELECT pg_typeof(operation_id)::text AS operation_type,
    pg_typeof(entity_id)::text AS entity_type FROM sync_operations`);
  expect(types.rows[0]).toEqual({ operation_type: 'text', entity_type: 'text' });
});
