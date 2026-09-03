// Build both workspaces first. This uses synthetic data and isolated databases.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const schema = `idg4h_e2e_${randomUUID().replace(/-/g, '')}`;
process.env.PGOPTIONS = `-c search_path=${schema}`;
process.env.NODE_ID = 'edge-integration-test';

const { pool, initSchema } = require('../dist/db/connection');
const app = require('../dist/app').default;

async function runManualSync() {
  // All command arguments are fixed; Windows needs cmd to execute npm.cmd.
  const windows = process.platform === 'win32';
  const child = spawn(windows ? (process.env.ComSpec || 'cmd.exe') : 'npm',
    windows ? ['/d', '/s', '/c', 'npm run sync --workspace=@idg4h/edge-node']
      : ['run', 'sync', '--workspace=@idg4h/edge-node'],
    { cwd: resolve(__dirname, '../..'), env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, output);
  console.log(output.trim());
  assert.match(output, /\[sync\] recovered 0 stale operation\(s\)/);
  assert.match(output, /\[sync\] attempted=1/);
  assert.match(output, /\[sync\] acknowledged=1/);
  assert.match(output, /\[sync\] failed=0/);
}

async function check() {
  let schemaCreated = false;
  let server;
  let edgeDb;
  let edgeDirectory;
  try {
    assert.match(schema, /^idg4h_e2e_[a-f0-9]{32}$/);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    await initSchema(1);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    process.env.CENTRAL_SERVER_URL = `http://127.0.0.1:${server.address().port}`;

    edgeDirectory = mkdtempSync(join(tmpdir(), 'idg4h-sync-'));
    process.env.DB_PATH = join(edgeDirectory, 'edge.sqlite');
    const connection = require('../../edge-node/dist/db/connection');
    edgeDb = connection.db;
    const { createPatientWithOutbox } = require('../../edge-node/dist/services/patientWriteService');
    const { saveClinicalEncounter } = require('../../edge-node/dist/services/clinicalEncounterService');
    const { findPendingOutbox, findOutboxById } = require('../../edge-node/dist/db/outboxRepository');
    const { HttpSyncTransport } = require('../../edge-node/dist/sync/httpSyncTransport');
    const { SyncEngine } = require('../../edge-node/dist/sync/syncEngine');
    const { ExponentialBackoffRetryPolicy } = require('../../edge-node/dist/sync/retryPolicy');

    const patient = createPatientWithOutbox({
      lastName: 'Patient', firstName: 'Synthetic', birthDate: '1990-01-01', sex: 'unknown',
    });
    const [patientOperation] = findPendingOutbox();
    assert.equal(patientOperation.entityId, patient.id);
    await runManualSync();
    assert.equal(findOutboxById(patientOperation.id).status, 'acknowledged');
    assert.ok(findOutboxById(patientOperation.id).acknowledgedAt);
    const storedPatient = await pool.query('SELECT id, originating_node_id FROM patients WHERE id=$1', [patient.id]);
    assert.equal(storedPatient.rowCount, 1);
    assert.equal(storedPatient.rows[0].originating_node_id, patient.nodeId);
    const patientLedger = await pool.query('SELECT status, applied_at FROM sync_operations WHERE operation_id=$1', [patientOperation.operationId]);
    assert.equal(patientLedger.rows[0].status, 'applied');
    assert.ok(patientLedger.rows[0].applied_at);
    console.log('Manual sync verified: PostgreSQL patient stored, ledger applied, Edge outbox acknowledged.');

    const now = new Date().toISOString();
    const visit = saveClinicalEncounter({
      patientId: patient.id,
      encounter: { encounterDate: now, encounterType: 'consultation' },
      observations: [{ code: 'body-temperature', valueNumeric: 36.8, unit: 'Cel', observedAt: now }],
      immunizations: [{ vaccineCode: 'BCG', administeredDate: now, status: 'completed' }],
    });
    const operations = findPendingOutbox();
    assert.equal(operations.length, 3);
    const transport = new HttpSyncTransport();
    let loseAcknowledgement = true;
    const engine = new SyncEngine({
      async send(record) {
        const acknowledgement = await transport.send(record);
        // Verify from another connection that the ACK follows both commits.
        const ledger = await pool.query('SELECT status, applied_at FROM sync_operations WHERE operation_id=$1', [record.operationId]);
        assert.equal(ledger.rows[0].status, 'applied');
        assert.ok(ledger.rows[0].applied_at);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error('Simulated lost acknowledgement after Central commit');
        }
        return acknowledgement;
      },
    }, new ExponentialBackoffRetryPolicy(0));

    assert.deepEqual(await engine.runOnce(), { attempted: 3, acknowledged: 2, failed: 1 });
    const before = (await pool.query('SELECT * FROM sync_operations ORDER BY operation_id')).rows;
    assert.equal(before.length, 4);
    assert.deepEqual(await engine.runOnce(), { attempted: 1, acknowledged: 1, failed: 0 });
    assert.deepEqual((await pool.query('SELECT * FROM sync_operations ORDER BY operation_id')).rows, before);
    for (const operation of operations) {
      assert.equal(findOutboxById(operation.id).status, 'acknowledged');
    }
    const patients = (await pool.query('SELECT * FROM patients')).rows;
    const encounters = (await pool.query('SELECT * FROM encounters')).rows;
    const observations = (await pool.query('SELECT * FROM observations')).rows;
    const immunizations = (await pool.query('SELECT * FROM immunizations')).rows;
    for (const rows of [patients, encounters, observations, immunizations]) {
      assert.equal(rows.length, 1);
      assert.equal(rows[0].originating_node_id, patient.nodeId);
    }
    assert.equal(patients[0].id, patient.id);
    assert.equal(encounters[0].id, visit.encounter.id);
    assert.equal(encounters[0].patient_id, patient.id);
    assert.equal(observations[0].id, visit.observations[0].id);
    assert.equal(observations[0].encounter_id, visit.encounter.id);
    assert.equal(observations[0].value_numeric, 36.8);
    assert.equal(immunizations[0].id, visit.immunizations[0].id);
    assert.equal(immunizations[0].encounter_id, visit.encounter.id);
    assert.equal(immunizations[0].status, 'completed');
    console.log('Edge-to-Central create sync passed: four canonical records, applied ACKs, and an idempotent lost-ACK retry.');
  } finally {
    try {
      if (edgeDb) edgeDb.close();
      if (edgeDirectory) {
        // Delete only known SQLite files, then remove the empty generated directory.
        for (const suffix of ['', '-wal', '-shm']) {
          rmSync(join(edgeDirectory, `edge.sqlite${suffix}`), { force: true });
        }
        rmdirSync(edgeDirectory);
      }
      if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally {
      try {
        if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally { await pool.end(); }
    }
  }
}

check().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
