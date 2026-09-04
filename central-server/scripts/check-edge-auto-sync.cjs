// Build both workspaces first. This uses synthetic data and isolated databases.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, rmdirSync } = require('node:fs');
const net = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const Database = require('better-sqlite3');

const schema = `idg4h_auto_${randomUUID().replace(/-/g, '')}`;
process.env.PGOPTIONS = `-c search_path=${schema}`;
process.env.NODE_ID = 'edge-auto-sync-test';
process.env.SYNC_INTERVAL_MS = '100';

const { pool, initSchema } = require('../dist/db/connection');
const centralApp = require('../dist/app').default;

async function availablePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => {
    probe.close(error => error ? reject(error) : resolve());
  });
  return port;
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (lastError) throw lastError;
  throw new Error(`Condition was not met within ${timeoutMs}ms.`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const outcome = await Promise.race([
    closed.then(() => 'closed'),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 5_000)),
  ]);
  if (outcome === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'close');
  }
}

async function check() {
  let schemaCreated = false;
  let centralServer;
  let edgeProcess;
  let edgeDirectory;
  let inspectionDb;
  let edgeOutput = '';

  try {
    assert.match(schema, /^idg4h_auto_[a-f0-9]{32}$/);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await initSchema(1);

    centralServer = centralApp.listen(0, '127.0.0.1');
    await once(centralServer, 'listening');
    process.env.CENTRAL_SERVER_URL = `http://127.0.0.1:${centralServer.address().port}`;

    edgeDirectory = mkdtempSync(join(tmpdir(), 'idg4h-auto-sync-'));
    const edgeDbPath = join(edgeDirectory, 'edge.sqlite');
    process.env.DB_PATH = edgeDbPath;
    process.env.PORT = String(await availablePort());

    const connection = require('../../edge-node/dist/db/connection');
    const { createPatientWithOutbox } = require('../../edge-node/dist/services/patientWriteService');
    const { findPendingOutbox } = require('../../edge-node/dist/db/outboxRepository');
    const patient = createPatientWithOutbox({
      sourceSystem: 'automatic-sync-test',
      sourceRecordId: `AUTO-${Date.now()}`,
      lastName: 'Automatic',
      firstName: 'Synchronization',
      birthDate: '1990-01-01',
      sex: 'unknown',
    });
    const [operation] = findPendingOutbox();
    assert.equal(operation.entityId, patient.id);
    assert.equal(operation.status, 'pending');
    connection.db.close();

    edgeProcess = spawn(
      process.execPath,
      [resolve(__dirname, '../../edge-node/dist/index.js')],
      {
        cwd: resolve(__dirname, '../..'),
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    edgeProcess.stdout.on('data', data => { edgeOutput += data.toString(); });
    edgeProcess.stderr.on('data', data => { edgeOutput += data.toString(); });

    inspectionDb = new Database(edgeDbPath, { readonly: true });
    const acknowledged = await waitFor(() => inspectionDb.prepare(`
      SELECT status, attempt_count, last_error
      FROM outbox
      WHERE operation_id = ?
    `).get(operation.operationId)?.status === 'acknowledged');
    assert.equal(acknowledged, true);

    const edgeRecord = inspectionDb.prepare(`
      SELECT status, attempt_count, last_error
      FROM outbox
      WHERE operation_id = ?
    `).get(operation.operationId);
    assert.deepEqual(edgeRecord, {
      status: 'acknowledged',
      attempt_count: 1,
      last_error: null,
    });

    const centralPatient = await pool.query(
      'SELECT id, originating_node_id, last_name, first_name, version FROM patients WHERE id=$1',
      [patient.id]
    );
    assert.deepEqual(centralPatient.rows[0], {
      id: patient.id,
      originating_node_id: patient.nodeId,
      last_name: 'Automatic',
      first_name: 'Synchronization',
      version: 1,
    });
    assert.deepEqual((await pool.query(
      'SELECT status FROM sync_operations WHERE operation_id=$1',
      [operation.operationId]
    )).rows[0], { status: 'applied' });

    await waitFor(() => edgeOutput.includes('[sync-worker] attempted=1 acknowledged=1 failed=0'));
    assert.match(edgeOutput, /\[sync-worker\] recovered 0 stale operation\(s\)/);
    console.log(edgeOutput.trim());
    console.log('Automatic Edge-to-Central synchronization passed: pending patient was acknowledged without running the manual sync command.');
  } finally {
    if (inspectionDb) inspectionDb.close();
    await stopChild(edgeProcess);
    if (centralServer) {
      await new Promise((resolve, reject) => {
        centralServer.close(error => error ? reject(error) : resolve());
      });
    }
    try {
      if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
    if (edgeDirectory) {
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(join(edgeDirectory, `edge.sqlite${suffix}`), { force: true });
      }
      rmdirSync(edgeDirectory);
    }
  }
}

check().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
