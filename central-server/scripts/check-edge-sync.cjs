// Build both workspaces before running this integration check from any directory.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');

const schema = `idg4h_e2e_${randomUUID().replace(/-/g, '')}`;
process.env.PGOPTIONS = `-c search_path=${schema}`;
process.env.DB_PATH = ':memory:';
process.env.NODE_ID = 'edge-integration-test';

const { pool, initSchema } = require('../dist/db/connection');
const app = require('../dist/app').default;

async function check() {
  let schemaCreated = false;
  let server;
  let edgeDb;
  try {
    // Only this generated schema may be created or removed by this check.
    assert.match(schema, /^idg4h_e2e_[a-f0-9]{32}$/);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const current = await pool.query('SELECT current_schema() AS schema');
    assert.equal(current.rows[0].schema, schema);
    await initSchema(1);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    process.env.CENTRAL_SERVER_URL = `http://127.0.0.1:${server.address().port}`;

    // Load Edge only after setting its isolated database and HTTP destination.
    const connection = require('../../edge-node/dist/db/connection');
    edgeDb = connection.db;
    connection.initSchema();
    const { createPatientWithOutbox } = require('../../edge-node/dist/services/patientWriteService');
    const { findPendingOutbox, findOutboxById } = require('../../edge-node/dist/db/outboxRepository');
    const { HttpSyncTransport } = require('../../edge-node/dist/sync/httpSyncTransport');
    const { SyncEngine } = require('../../edge-node/dist/sync/syncEngine');
    const { ExponentialBackoffRetryPolicy } = require('../../edge-node/dist/sync/retryPolicy');

    const patient = createPatientWithOutbox({
      lastName: 'Patient', firstName: 'Synthetic', birthDate: '1990-01-01', sex: 'unknown',
    });
    const [operation] = findPendingOutbox();
    const transport = new HttpSyncTransport();
    let loseAcknowledgement = true;
    const engine = new SyncEngine({
      async send(record) {
        const acknowledgement = await transport.send(record);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error('Simulated lost acknowledgement after Central commit');
        }
        return acknowledgement;
      },
    }, new ExponentialBackoffRetryPolicy(0));

    assert.deepEqual(await engine.runOnce(), { attempted: 1, acknowledged: 0, failed: 1 });
    assert.equal(findOutboxById(operation.id).status, 'failed');
    const before = await pool.query('SELECT * FROM sync_operations');
    assert.equal(before.rowCount, 1);
    assert.equal(before.rows[0].entity_id, patient.id);
    assert.deepEqual(before.rows[0].payload, operation.payload);

    assert.deepEqual(await engine.runOnce(), { attempted: 1, acknowledged: 1, failed: 0 });
    const saved = findOutboxById(operation.id);
    assert.equal(saved.status, 'acknowledged');
    assert.equal(saved.attemptCount, 2);
    assert.equal(saved.operationId, operation.operationId);
    assert.deepEqual((await pool.query('SELECT * FROM sync_operations')).rows, before.rows);

    console.log('Edge-to-Central HTTP sync passed: lost acknowledgement retried, one durable receipt, Edge acknowledged.');
  } finally {
    try {
      if (edgeDb) edgeDb.close();
      if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally {
      try {
        if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await pool.end();
      }
    }
  }
}

check().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
