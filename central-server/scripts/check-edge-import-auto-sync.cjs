// Build both workspaces first. This uses only synthetic data and isolated databases.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, rmdirSync } = require('node:fs');
const net = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const Database = require('better-sqlite3');

const isXlsx = process.argv.includes('--xlsx');
const importFormat = isXlsx ? 'xlsx' : 'csv';
const importCommand = isXlsx
  ? 'npm run import:synthetic:xlsx --workspace=@idg4h/edge-node'
  : 'npm run import:synthetic --workspace=@idg4h/edge-node';
const sourceSystem = isXlsx ? 'synthetic-xlsx' : 'iClinicSys-synthetic';
const expectedPatients = isXlsx
  ? [
      {
        rowNumber: 2,
        sourceRecordId: 'E2E-XLSX-001',
        lastName: 'ExcelImport',
        firstName: 'Alpha',
      },
      {
        rowNumber: 4,
        sourceRecordId: 'E2E-XLSX-002',
        lastName: 'ExcelImport',
        firstName: 'Beta',
      },
    ]
  : [
      {
        rowNumber: 2,
        sourceRecordId: 'E2E-IMPORT-001',
        lastName: 'ImportTest',
        firstName: 'Alpha',
      },
      {
        rowNumber: 3,
        sourceRecordId: 'E2E-IMPORT-002',
        lastName: 'ImportTest',
        firstName: 'Beta',
      },
    ];
const schema = `idg4h_import_${randomUUID().replace(/-/g, '')}`;
process.env.PGOPTIONS = `-c search_path=${schema}`;
process.env.NODE_ID = `edge-import-${importFormat}-auto-sync-test`;
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

async function runSyntheticImport(environment) {
  const windows = process.platform === 'win32';
  const child = spawn(
    windows ? (process.env.ComSpec || 'cmd.exe') : 'npm',
    windows
      ? ['/d', '/s', '/c', importCommand]
      : [
          'run',
          isXlsx ? 'import:synthetic:xlsx' : 'import:synthetic',
          '--workspace=@idg4h/edge-node',
        ],
    {
      cwd: resolve(__dirname, '../..'),
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, output);
  return output;
}

async function check() {
  let schemaCreated = false;
  let centralServer;
  let edgeProcess;
  let edgeDirectory;
  let inspectionDb;
  let edgeOutput = '';

  try {
    assert.match(schema, /^idg4h_import_[a-f0-9]{32}$/);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await initSchema(1);

    centralServer = centralApp.listen(0, '127.0.0.1');
    await once(centralServer, 'listening');
    const centralUrl = `http://127.0.0.1:${centralServer.address().port}`;
    process.env.CENTRAL_SERVER_URL = centralUrl;
    await waitFor(async () => (await fetch(`${centralUrl}/health`)).ok);

    edgeDirectory = mkdtempSync(join(tmpdir(), 'idg4h-import-sync-'));
    const edgeDbPath = join(edgeDirectory, 'edge.sqlite');
    process.env.DB_PATH = edgeDbPath;
    const edgePort = await availablePort();
    process.env.PORT = String(edgePort);

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
    await waitFor(async () => (await fetch(`http://127.0.0.1:${edgePort}/health`)).ok);

    const firstImportOutput = await runSyntheticImport(process.env);
    inspectionDb = new Database(edgeDbPath, { readonly: true });

    const firstJobs = inspectionDb.prepare('SELECT * FROM import_jobs').all();
    assert.equal(firstJobs.length, 1);
    const firstJob = firstJobs[0];
    assert.deepEqual({
      fileType: firstJob.file_type,
      status: firstJob.status,
      totalRows: firstJob.total_rows,
      importedRows: firstJob.imported_rows,
      candidateRows: firstJob.candidate_rows,
      failedRows: firstJob.failed_rows,
    }, {
      fileType: importFormat,
      status: 'completed',
      totalRows: 2,
      importedRows: 2,
      candidateRows: 0,
      failedRows: 0,
    });

    const importedRows = inspectionDb.prepare(`
      SELECT row_number, status, source_record_id, local_entity_id, raw_data
      FROM import_row_results
      WHERE import_job_id = ?
      ORDER BY row_number
    `).all(firstJob.id);
    assert.deepEqual(importedRows.map(row => ({
      rowNumber: row.row_number,
      status: row.status,
      sourceRecordId: row.source_record_id,
    })), expectedPatients.map(patient => ({
      rowNumber: patient.rowNumber,
      status: 'imported',
      sourceRecordId: patient.sourceRecordId,
    })));
    for (const row of importedRows) {
      assert.ok(row.local_entity_id);
      assert.equal(JSON.parse(row.raw_data).source_record_id, row.source_record_id);
    }

    const edgePatients = inspectionDb.prepare(`
      SELECT id, source_system, source_record_id, last_name, first_name, version
      FROM patients
      ORDER BY source_record_id
    `).all();
    assert.equal(edgePatients.length, 2);
    assert.deepEqual(
      edgePatients.map(patient => patient.source_record_id),
      expectedPatients.map(patient => patient.sourceRecordId)
    );
    assert.equal(inspectionDb.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 2);

    await waitFor(() => inspectionDb.prepare(`
      SELECT COUNT(*) AS count
      FROM outbox
      WHERE status = 'acknowledged'
    `).get().count === 2);
    const outbox = inspectionDb.prepare(`
      SELECT operation_id, entity_id, operation_type, status, attempt_count, last_error
      FROM outbox
      ORDER BY entity_id
    `).all();
    assert.ok(outbox.every(operation =>
      operation.operation_type === 'create' &&
      operation.status === 'acknowledged' &&
      operation.attempt_count === 1 &&
      operation.last_error === null
    ));

    await waitFor(async () => (await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM patients
      WHERE source_system = $1
    `, [sourceSystem])).rows[0].count === 2);
    const centralPatients = (await pool.query(`
      SELECT id, originating_node_id, source_system, source_record_id,
             last_name, first_name, version
      FROM patients
      WHERE source_system = $1
      ORDER BY source_record_id
    `, [sourceSystem])).rows;
    assert.deepEqual(centralPatients.map(patient => ({
      originatingNodeId: patient.originating_node_id,
      sourceSystem: patient.source_system,
      sourceRecordId: patient.source_record_id,
      lastName: patient.last_name,
      firstName: patient.first_name,
      version: patient.version,
    })), expectedPatients.map(patient => ({
      originatingNodeId: `edge-import-${importFormat}-auto-sync-test`,
      sourceSystem,
      sourceRecordId: patient.sourceRecordId,
      lastName: patient.lastName,
      firstName: patient.firstName,
      version: 1,
    })));
    const ledgers = (await pool.query(`
      SELECT operation_id, entity_id, operation_type, status
      FROM sync_operations
      WHERE entity_id = ANY($1::uuid[])
      ORDER BY entity_id
    `, [centralPatients.map(patient => patient.id)])).rows;
    assert.equal(ledgers.length, 2);
    assert.ok(ledgers.every(operation =>
      operation.operation_type === 'create' && operation.status === 'applied'
    ));

    const secondImportOutput = await runSyntheticImport(process.env);
    const allJobs = inspectionDb.prepare('SELECT * FROM import_jobs ORDER BY started_at').all();
    assert.equal(allJobs.length, 2);
    const secondJob = allJobs.find(job => job.id !== firstJob.id);
    assert.deepEqual({
      status: secondJob.status,
      totalRows: secondJob.total_rows,
      importedRows: secondJob.imported_rows,
      candidateRows: secondJob.candidate_rows,
      failedRows: secondJob.failed_rows,
    }, {
      status: 'completed_with_issues',
      totalRows: 2,
      importedRows: 0,
      candidateRows: 2,
      failedRows: 0,
    });
    const candidateRows = inspectionDb.prepare(`
      SELECT row_number, status, source_record_id, local_entity_id
      FROM import_row_results
      WHERE import_job_id = ?
      ORDER BY row_number
    `).all(secondJob.id);
    assert.deepEqual(candidateRows.map(row => ({
      rowNumber: row.row_number,
      status: row.status,
      sourceRecordId: row.source_record_id,
    })), expectedPatients.map(patient => ({
      rowNumber: patient.rowNumber,
      status: 'candidate',
      sourceRecordId: patient.sourceRecordId,
    })));
    assert.deepEqual(
      candidateRows.map(row => row.local_entity_id).sort(),
      edgePatients.map(patient => patient.id).sort()
    );
    assert.equal(inspectionDb.prepare('SELECT COUNT(*) AS count FROM patients').get().count, 2);
    assert.equal(inspectionDb.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, 2);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM patients')).rows[0].count, 2);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM sync_operations')).rows[0].count, 2);

    await waitFor(() => edgeOutput.includes('[sync-worker] attempted=2 acknowledged=2 failed=0'));
    console.log(firstImportOutput.trim());
    console.log(secondImportOutput.trim());
    console.log(edgeOutput.trim());
    console.log(`End-to-end audited synthetic ${importFormat.toUpperCase()} import and automatic O2O synchronization passed without manual sync or duplicate patients.`);
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
