// Synthetic development evaluation. Build Edge and Central before running.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

const {
  calculateSyncMetrics,
} = require('../dist/evaluation/syncMetrics');
const {
  getNetworkProfile,
  networkProfileNames,
} = require('../dist/evaluation/networkProfiles');
const {
  startFaultProxy,
} = require('../dist/evaluation/faultProxy');

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(argument => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);

  if (index >= 0) {
    return process.argv[index + 1];
  }

  const npmValue = process.env[`npm_config_${name.replace(/-/g, '_')}`];
  return npmValue && npmValue !== 'true' ? npmValue : fallback;
}

function parseOptions() {
  const positional = process.argv.slice(2).filter(argument => {
    return !argument.startsWith('--');
  });
  const profile = getNetworkProfile(
    readOption('profile', positional[0] ?? 'stable')
  );
  const operationCount = Number.parseInt(
    readOption('operations', positional[1] ?? '20'),
    10
  );

  if (!Number.isSafeInteger(operationCount) || operationCount < 1 || operationCount > 1_000) {
    throw new Error('--operations must be an integer from 1 to 1000.');
  }

  const generatedName = `sync-${profile.name}-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.json`;
  const outputPath = resolve(
    readOption(
      'output',
      positional[2] ?? join('artifacts', 'evaluation', generatedName)
    )
  );

  return {
    profile,
    operationCount,
    outputPath,
    requireComplete:
      process.argv.includes('--require-complete') ||
      process.env.npm_config_require_complete === 'true',
  };
}

function fileSize(path) {
  return existsSync(path) ? statSync(path).size : 0;
}

function sqliteStorageSize(databasePath) {
  return ['', '-wal', '-shm']
    .map(suffix => fileSize(`${databasePath}${suffix}`))
    .reduce((total, size) => total + size, 0);
}

async function listen(application) {
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function closeServer(server) {
  if (!server) {
    return;
  }

  await new Promise((resolvePromise, reject) => {
    server.close(error => error ? reject(error) : resolvePromise());
  });
}

function centralUrl(server) {
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function main() {
  const options = parseOptions();
  const schema = `idg4h_eval_${randomUUID().replace(/-/g, '')}`;
  const edgeDirectory = mkdtempSync(join(tmpdir(), 'idg4h-evaluation-'));
  const edgeDatabasePath = join(edgeDirectory, 'edge.sqlite');
  let schemaCreated = false;
  let centralServer;
  let proxy;
  let edgeDatabase;
  let pool;
  let memoryTimer;

  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.NODE_ID = `edge-evaluation-${options.profile.name}`;
  process.env.DB_PATH = edgeDatabasePath;

  try {
    const centralConnection = require('../dist/db/connection');
    pool = centralConnection.pool;
    const centralApp = require('../dist/app').default;
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await centralConnection.initSchema(1);
    centralServer = await listen(centralApp);
    proxy = await startFaultProxy({
      centralUrl: centralUrl(centralServer),
      profile: options.profile,
      totalOperations: options.operationCount,
    });
    process.env.CENTRAL_SERVER_URL = proxy.url;

    const edgeRoot = resolve(__dirname, '../../edge-node/dist');
    const connection = require(join(edgeRoot, 'db/connection'));
    edgeDatabase = connection.db;
    const {
      createPatientWithOutbox,
    } = require(join(edgeRoot, 'services/patientWriteService'));
    const {
      HttpSyncTransport,
    } = require(join(edgeRoot, 'sync/httpSyncTransport'));
    const {
      ExponentialBackoffRetryPolicy,
    } = require(join(edgeRoot, 'sync/retryPolicy'));
    const { SyncEngine } = require(join(edgeRoot, 'sync/syncEngine'));

    const storageBefore = sqliteStorageSize(edgeDatabasePath);
    const expectedPatients = [];

    for (let index = 0; index < options.operationCount; index += 1) {
      expectedPatients.push(createPatientWithOutbox({
        sourceSystem: 'synthetic-evaluation',
        sourceRecordId: `EVAL-${schema}-${index + 1}`,
        familySerialNo: `EVAL-FAMILY-${index + 1}`,
        lastName: `Evaluation-${index + 1}`,
        firstName: 'Synthetic',
        birthDate: '1990-01-01',
        sex: index % 2 === 0 ? 'unknown' : 'other',
        barangay: 'Synthetic Barangay',
        municipalityCity: 'Butuan City',
      }));
    }

    const operationRows = edgeDatabase.prepare(`
      SELECT operation_id, entity_id
      FROM outbox
      ORDER BY created_at, rowid
    `).all();
    assert.equal(operationRows.length, options.operationCount);

    const engine = new SyncEngine(
      new HttpSyncTransport(),
      new ExponentialBackoffRetryPolicy(0, 0),
      { batchSize: options.operationCount }
    );
    const startedAt = new Date();
    const cpuBefore = process.cpuUsage();
    let peakMemoryBytes = process.memoryUsage().rss;
    memoryTimer = setInterval(() => {
      peakMemoryBytes = Math.max(peakMemoryBytes, process.memoryUsage().rss);
    }, 10);

    let cycles = 0;
    let acknowledgedCount = 0;

    while (acknowledgedCount < options.operationCount && cycles < 25) {
      cycles += 1;
      await engine.runOnce();
      acknowledgedCount = edgeDatabase.prepare(`
        SELECT COUNT(*) AS count
        FROM outbox
        WHERE status = 'acknowledged'
      `).get().count;

      if (acknowledgedCount < options.operationCount) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
      }
    }

    clearInterval(memoryTimer);
    memoryTimer = undefined;
    peakMemoryBytes = Math.max(peakMemoryBytes, process.memoryUsage().rss);
    const completedAt = new Date();
    const cpu = process.cpuUsage(cpuBefore);
    edgeDatabase.pragma('wal_checkpoint(PASSIVE)');
    const storageAfter = sqliteStorageSize(edgeDatabasePath);

    const edgeOperations = edgeDatabase.prepare(`
      SELECT
        operation_id,
        status,
        attempt_count,
        created_at,
        acknowledged_at
      FROM outbox
      ORDER BY created_at, rowid
    `).all();
    const centralOperations = (await pool.query(`
      SELECT operation_id::text, status
      FROM sync_operations
    `)).rows;
    const centralPatients = (await pool.query(`
      SELECT
        id::text,
        originating_node_id,
        source_system,
        source_record_id,
        family_serial_no,
        phic_no,
        last_name,
        first_name,
        middle_name,
        suffix,
        birth_date::text,
        sex,
        civil_status,
        place_of_birth,
        religion,
        educational_attainment,
        contact_number,
        address_line,
        purok,
        barangay,
        municipality_city,
        province,
        district,
        phic_membership_category,
        phic_membership_type,
        employment_status,
        occupation,
        spouse_name,
        spouse_birth_date::text,
        spouse_occupation,
        member_maiden_name,
        father_name,
        family_position,
        version,
        created_at,
        updated_at
      FROM patients
    `)).rows;
    const centralOperationMap = new Map(
      centralOperations.map(row => [row.operation_id, row.status])
    );
    const operationObservations = operationRows.map(expected => {
      const edge = edgeOperations.find(
        row => row.operation_id === expected.operation_id
      );

      return {
        operationId: expected.operation_id,
        edgeStatus: edge?.status,
        centralStatus: centralOperationMap.get(expected.operation_id),
        attemptCount: edge?.attempt_count,
        createdAt: edge?.created_at,
        acknowledgedAt: edge?.acknowledged_at ?? undefined,
      };
    });
    const expectedEntities = expectedPatients.map(patient => ({
      entityType: 'patient',
      entityId: patient.id,
      fields: {
        originatingNodeId: patient.nodeId,
        sourceSystem: patient.sourceSystem ?? null,
        sourceRecordId: patient.sourceRecordId ?? null,
        familySerialNo: patient.familySerialNo ?? null,
        phicNo: patient.phicNo ?? null,
        lastName: patient.lastName,
        firstName: patient.firstName,
        middleName: patient.middleName ?? null,
        suffix: patient.suffix ?? null,
        birthDate: patient.birthDate,
        sex: patient.sex,
        civilStatus: patient.civilStatus ?? null,
        placeOfBirth: patient.placeOfBirth ?? null,
        religion: patient.religion ?? null,
        educationalAttainment: patient.educationalAttainment ?? null,
        contactNumber: patient.contactNumber ?? null,
        addressLine: patient.addressLine ?? null,
        purok: patient.purok ?? null,
        barangay: patient.barangay ?? null,
        municipalityCity: patient.municipalityCity ?? null,
        province: patient.province ?? null,
        district: patient.district ?? null,
        phicMembershipCategory: patient.phicMembershipCategory ?? null,
        phicMembershipType: patient.phicMembershipType ?? null,
        employmentStatus: patient.employmentStatus ?? null,
        occupation: patient.occupation ?? null,
        spouseName: patient.spouseName ?? null,
        spouseBirthDate: patient.spouseBirthDate ?? null,
        spouseOccupation: patient.spouseOccupation ?? null,
        memberMaidenName: patient.memberMaidenName ?? null,
        fatherName: patient.fatherName ?? null,
        familyPosition: patient.familyPosition ?? null,
        version: patient.version,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
    }));
    const actualEntities = centralPatients.map(patient => ({
      entityType: 'patient',
      entityId: patient.id,
      fields: {
        originatingNodeId: patient.originating_node_id,
        sourceSystem: patient.source_system,
        sourceRecordId: patient.source_record_id,
        familySerialNo: patient.family_serial_no,
        phicNo: patient.phic_no,
        lastName: patient.last_name,
        firstName: patient.first_name,
        middleName: patient.middle_name,
        suffix: patient.suffix,
        birthDate: patient.birth_date,
        sex: patient.sex,
        civilStatus: patient.civil_status,
        placeOfBirth: patient.place_of_birth,
        religion: patient.religion,
        educationalAttainment: patient.educational_attainment,
        contactNumber: patient.contact_number,
        addressLine: patient.address_line,
        purok: patient.purok,
        barangay: patient.barangay,
        municipalityCity: patient.municipality_city,
        province: patient.province,
        district: patient.district,
        phicMembershipCategory: patient.phic_membership_category,
        phicMembershipType: patient.phic_membership_type,
        employmentStatus: patient.employment_status,
        occupation: patient.occupation,
        spouseName: patient.spouse_name,
        spouseBirthDate: patient.spouse_birth_date,
        spouseOccupation: patient.spouse_occupation,
        memberMaidenName: patient.member_maiden_name,
        fatherName: patient.father_name,
        familyPosition: patient.family_position,
        version: patient.version,
        createdAt: patient.created_at.toISOString(),
        updatedAt: patient.updated_at.toISOString(),
      },
    }));
    const metrics = calculateSyncMetrics({
      expectedOperations: operationRows.map(row => row.operation_id),
      operations: operationObservations,
      expectedEntities,
      actualEntities,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      cpuTimeMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
      peakMemoryBytes,
      edgeStorageGrowthBytes: Math.max(0, storageAfter - storageBefore),
    });
    const artifact = {
      schemaVersion: 1,
      kind: 'synthetic-development-sync-evaluation',
      generatedAt: new Date().toISOString(),
      scope: [
        'Synthetic patient-create operations on one development host.',
        'Deterministic application-level fault injection through a loopback proxy.',
        'This is not a final manuscript result or a measurement of a deployed barangay network.',
      ],
      definitions: {
        ssr: 'Acknowledged Edge operations with applied Central ledger rows divided by expected queued operations.',
        dci: 'Matching expected scalar canonical elements divided by total expected scalar canonical elements.',
        lostOperation: 'Expected operation absent from both the Edge outbox and Central operation ledger.',
        duplicateEntity: 'Additional Central canonical row with the same entity type and identifier.',
      },
      profile: options.profile,
      workload: {
        entityType: 'patient',
        operationType: 'create',
        operationCount: options.operationCount,
        syncCycles: cycles,
      },
      injectedFaults: proxy.stats,
      metrics,
    };

    mkdirSync(dirname(options.outputPath), { recursive: true });
    writeFileSync(options.outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(JSON.stringify(artifact, null, 2));
    console.log(`Evaluation artifact: ${options.outputPath}`);

    if (options.requireComplete) {
      assert.equal(metrics.synchronization.ssrPercent, 100);
      assert.equal(metrics.consistency.dciPercent, 100);
      assert.equal(metrics.synchronization.lostOperations, 0);
      assert.equal(metrics.consistency.duplicateEntities, 0);
      assert.equal(metrics.synchronization.retainedUnacknowledgedOperations, 0);
    }
  } finally {
    if (memoryTimer) {
      clearInterval(memoryTimer);
    }
    edgeDatabase?.close();
    await proxy?.close();
    await closeServer(centralServer);

    if (pool) {
      try {
        if (schemaCreated) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        await pool.end();
      }
    }

    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${edgeDatabasePath}${suffix}`, { force: true });
    }
    rmdirSync(edgeDirectory);
  }
}

main().catch(error => {
  console.error(error);
  console.error(`Available profiles: ${networkProfileNames.join(', ')}`);
  process.exitCode = 1;
});
