import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../app';
import { initSchema, pool } from '../db/connection';
import { findSyncOperationById, insertSyncOperation } from '../db/syncOperationRepository';
import { receiveSyncOperation } from '../services/syncOperationService';
import type { SyncOperationInput } from '../domain';
import swaggerSpec from '../docs/swagger';
import { operation, timestamp } from './syncFixtures';

const schema = process.env.IDG4H_TEST_SCHEMA;
if (!schema || !/^idg4h_test_[a-f0-9]{32}$/.test(schema)) throw new Error('A generated test schema is required.');
let schemaCreated = false;
beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  const result = await pool.query('SELECT current_schema() AS schema');
  if (result.rows[0].schema !== schema) throw new Error('Test schema isolation failed.');
  await initSchema(1);
});
beforeEach(() => pool.query('TRUNCATE sync_operations, immunizations, observations, encounters, patients'));
afterAll(async () => {
  try {
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally { await pool.end(); }
});
function post(input: SyncOperationInput) {
  return request(app).post('/api/sync/operations')
    .set('Idempotency-Key', input.operationId).set('X-IDG4H-Node-ID', input.nodeId).send(input);
}
async function receipts() { return (await pool.query('SELECT * FROM sync_operations ORDER BY operation_id')).rows; }
async function expectEmpty() {
  expect(await receipts()).toEqual([]);
  expect((await pool.query('SELECT * FROM patients')).rows).toEqual([]);
}
function patientUpdate(
  created: SyncOperationInput,
  version: number,
  fields: Record<string, unknown> = {}
): SyncOperationInput {
  return {
    ...created,
    operationId: randomUUID(),
    operationType: 'update',
    payload: {
      ...(created.payload as Record<string, unknown>),
      version,
      updatedAt: '2026-09-03T09:00:00.000Z',
      ...fields,
    },
  };
}

it('ACKs a committed patient and applied ledger record with source metadata', async () => {
  const input = operation('patient', {
    sourceSystem: 'offline-form', sourceRecordId: 'synthetic-source', familySerialNo: 'family', phicNo: 'phic',
    middleName: 'Middle', suffix: 'Jr', civilStatus: 'single', placeOfBirth: 'Butuan', religion: 'Synthetic',
    educationalAttainment: 'college', contactNumber: '000', addressLine: 'Synthetic address', purok: '1',
    barangay: 'Baan 3', municipalityCity: 'Butuan', province: 'Agusan del Norte', district: '2',
    phicMembershipCategory: 'member', phicMembershipType: 'direct', employmentStatus: 'employed', occupation: 'teacher',
    spouseName: 'Synthetic spouse', spouseBirthDate: '1991-02-03', spouseOccupation: 'nurse',
    memberMaidenName: 'Synthetic maiden', fatherName: 'Synthetic father', familyPosition: 'head',
    nodeId: 'ignored-payload-node',
  });
  const response = await post(input);
  expect(response.status).toBe(201);
  expect(response.body).toEqual({ operationId: input.operationId, status: 'applied', duplicate: false });
  const saved = await findSyncOperationById(input.operationId);
  expect(saved).toMatchObject({ ...input, status: 'applied' });
  expect(saved?.appliedAt).toBe(new Date(saved!.appliedAt!).toISOString());
  expect(saved?.failedAt).toBeUndefined();
  expect(saved?.errorMessage).toBeUndefined();
  const patient = (await pool.query(`SELECT *, birth_date::text AS birth_date,
    spouse_birth_date::text AS spouse_birth_date FROM patients WHERE id=$1`, [input.entityId])).rows[0];
  expect(patient).toEqual({
    id: input.entityId, originating_node_id: input.nodeId, first_name: 'Synthetic', last_name: 'Patient',
    birth_date: '1990-01-01', sex: 'unknown', source_system: 'offline-form', source_record_id: 'synthetic-source',
    family_serial_no: 'family', phic_no: 'phic', middle_name: 'Middle', suffix: 'Jr', civil_status: 'single',
    place_of_birth: 'Butuan', religion: 'Synthetic', educational_attainment: 'college', contact_number: '000',
    address_line: 'Synthetic address', purok: '1', barangay: 'Baan 3', municipality_city: 'Butuan',
    province: 'Agusan del Norte', district: '2', phic_membership_category: 'member', phic_membership_type: 'direct',
    employment_status: 'employed', occupation: 'teacher', spouse_name: 'Synthetic spouse', spouse_birth_date: '1991-02-03',
    spouse_occupation: 'nurse', member_maiden_name: 'Synthetic maiden', father_name: 'Synthetic father', family_position: 'head',
    version: 1, created_at: new Date(timestamp), updated_at: new Date(timestamp),
  });
});

it('preserves the original canonical row and ledger on retries, including a changed payload', async () => {
  const input = operation();
  await receiveSyncOperation(input);
  const before = await receipts();
  const patientBefore = (await pool.query('SELECT * FROM patients')).rows;
  const response = await post({ ...input, payload: { changed: true } });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ operationId: input.operationId, status: 'applied', duplicate: true });
  await initSchema(1);
  expect(await receipts()).toEqual(before);
  expect((await pool.query('SELECT * FROM patients')).rows).toEqual(patientBefore);
});

it('applies a patient v1 to v2 update and commits its ledger entry', async () => {
  const created = operation('patient', {
    contactNumber: 'old-number',
    barangay: 'Old Barangay',
  });
  await receiveSyncOperation(created);
  const before = (await pool.query(
    'SELECT originating_node_id, created_at FROM patients WHERE id=$1',
    [created.entityId]
  )).rows[0];
  const update = patientUpdate(created, 2, {
    firstName: 'Updated',
    contactNumber: '09123456789',
    barangay: 'New Barangay',
  });

  const response = await post(update);

  expect(response.status).toBe(201);
  expect(response.body).toEqual({
    operationId: update.operationId,
    status: 'applied',
    duplicate: false,
  });
  const patient = (await pool.query(
    'SELECT * FROM patients WHERE id=$1',
    [created.entityId]
  )).rows[0];
  expect(patient).toMatchObject({
    id: created.entityId,
    originating_node_id: before.originating_node_id,
    first_name: 'Updated',
    contact_number: '09123456789',
    barangay: 'New Barangay',
    version: 2,
    created_at: before.created_at,
    updated_at: new Date('2026-09-03T09:00:00.000Z'),
  });
  expect(await findSyncOperationById(update.operationId)).toMatchObject({
    status: 'applied',
    operationType: 'update',
  });
});

it.each([1, 2])(
  'rejects stale patient update v%i against current v2 without mutating canonical data',
  async (incomingVersion) => {
    const created = operation('patient', { contactNumber: 'v1' });
    await receiveSyncOperation(created);
    await receiveSyncOperation(patientUpdate(created, 2, { contactNumber: 'v2' }));
    const before = (await pool.query('SELECT * FROM patients WHERE id=$1', [created.entityId])).rows[0];
    const stale = patientUpdate(created, incomingVersion, { contactNumber: 'stale-overwrite' });

    const response = await post(stale);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: expect.any(String),
      conflict: {
        code: 'PATIENT_VERSION_CONFLICT',
        entityType: 'patient',
        entityId: created.entityId,
        reason: 'stale-version',
        currentVersion: 2,
        incomingVersion,
        expectedVersion: 3,
      },
    });
    expect((await pool.query('SELECT * FROM patients WHERE id=$1', [created.entityId])).rows[0]).toEqual(before);
    expect(await findSyncOperationById(stale.operationId)).toBeUndefined();
  }
);

it('rejects a patient version gap without mutating canonical data or marking the operation applied', async () => {
  const created = operation('patient', { contactNumber: 'v1' });
  await receiveSyncOperation(created);
  await receiveSyncOperation(patientUpdate(created, 2, { contactNumber: 'v2' }));
  const before = (await pool.query('SELECT * FROM patients WHERE id=$1', [created.entityId])).rows[0];
  const gap = patientUpdate(created, 4, { contactNumber: 'gap-overwrite' });

  const response = await post(gap);

  expect(response.status).toBe(409);
  expect(response.body.conflict).toEqual({
    code: 'PATIENT_VERSION_CONFLICT',
    entityType: 'patient',
    entityId: created.entityId,
    reason: 'version-gap',
    currentVersion: 2,
    incomingVersion: 4,
    expectedVersion: 3,
  });
  expect((await pool.query('SELECT * FROM patients WHERE id=$1', [created.entityId])).rows[0]).toEqual(before);
  expect(await findSyncOperationById(gap.operationId)).toBeUndefined();
});

it('returns a structured conflict when an update reaches Central before its patient create', async () => {
  const created = operation();
  const update = patientUpdate(created, 2);

  const response = await post(update);

  expect(response.status).toBe(409);
  expect(response.body.conflict).toEqual({
    code: 'PATIENT_VERSION_CONFLICT',
    entityType: 'patient',
    entityId: created.entityId,
    reason: 'missing-patient',
    currentVersion: null,
    incomingVersion: 2,
    expectedVersion: null,
  });
  await expectEmpty();
});

it('serializes competing patient v2 updates so only one is applied', async () => {
  const created = operation();
  await receiveSyncOperation(created);
  const updates = [
    patientUpdate(created, 2, { contactNumber: 'first' }),
    patientUpdate(created, 2, { contactNumber: 'second' }),
  ];

  const responses = await Promise.all(updates.map(post));

  expect(responses.filter(response => response.status === 201)).toHaveLength(1);
  const conflict = responses.find(response => response.status === 409);
  expect(conflict?.body.conflict).toMatchObject({
    reason: 'stale-version',
    currentVersion: 2,
    incomingVersion: 2,
    expectedVersion: 3,
  });
  expect((await pool.query('SELECT version FROM patients WHERE id=$1', [created.entityId])).rows[0].version).toBe(2);
  const appliedUpdates = await pool.query(
    "SELECT operation_id FROM sync_operations WHERE entity_id=$1 AND operation_type='update' AND status='applied'",
    [created.entityId]
  );
  expect(appliedUpdates.rowCount).toBe(1);
});

it('acknowledges an idempotent retry of an already applied patient update', async () => {
  const created = operation();
  await receiveSyncOperation(created);
  const update = patientUpdate(created, 2, { contactNumber: 'v2' });
  expect((await post(update)).status).toBe(201);

  const retry = await post({
    ...update,
    payload: { version: 999, contactNumber: 'must-not-apply' },
  });

  expect(retry.status).toBe(200);
  expect(retry.body).toEqual({ operationId: update.operationId, status: 'applied', duplicate: true });
  expect((await pool.query('SELECT version, contact_number FROM patients WHERE id=$1', [created.entityId])).rows[0])
    .toEqual({ version: 2, contact_number: 'v2' });
});

it('serializes concurrent first deliveries into one canonical create and seven duplicates', async () => {
  const input = operation();
  const responses = await Promise.all(Array.from({ length: 8 }, () => post(input)));
  expect(responses.filter(response => response.status === 201)).toHaveLength(1);
  expect(responses.filter(response => response.status === 200)).toHaveLength(7);
  for (const response of responses) expect(response.body.status).toBe('applied');
  expect(await receipts()).toHaveLength(1);
  expect((await pool.query('SELECT * FROM patients')).rows).toHaveLength(1);
});

it.each(['received', 'failed'] as const)('refuses to ACK an existing %s ledger entry', async (status) => {
  const input = operation();
  await insertSyncOperation(input);
  await pool.query('UPDATE sync_operations SET status=$1', [status]);
  const before = await receipts();
  expect((await post(input)).status).toBe(409);
  expect(await receipts()).toEqual(before);
  expect((await pool.query('SELECT * FROM patients')).rows).toEqual([]);
});

it('creates the full encounter, observation and immunization chain', async () => {
  const patient = operation();
  await receiveSyncOperation(patient);
  const encounter = operation('encounter', {
    patientId: patient.entityId, sourceSystem: 'form', sourceRecordId: 'visit', encounterType: 'consultation',
    chiefComplaint: 'Synthetic', historyPresentIllness: 'History', assessmentPlan: 'Plan', outcome: 'home',
    facilityId: 'facility', practitionerId: 'practitioner',
  });
  expect((await post(encounter)).status).toBe(201);
  const observation = operation('observation', { patientId: patient.entityId, encounterId: encounter.entityId,
    sourceSystem: 'form', sourceRecordId: 'reading', valueText: 'normal', valueNumeric: 0, unit: 'Cel' });
  const immunization = operation('immunization', { patientId: patient.entityId, encounterId: encounter.entityId,
    sourceSystem: 'form', sourceRecordId: 'dose', vaccineName: 'BCG vaccine', doseLabel: 'dose-1',
    administeredDate: timestamp, remarks: 'Synthetic remarks' });
  expect((await post(observation)).status).toBe(201);
  expect((await post(immunization)).status).toBe(201);
  expect((await pool.query('SELECT * FROM encounters')).rows[0]).toMatchObject({
    id: encounter.entityId, patient_id: patient.entityId, originating_node_id: encounter.nodeId,
    source_system: 'form', source_record_id: 'visit', encounter_type: 'consultation', chief_complaint: 'Synthetic',
    history_present_illness: 'History', assessment_plan: 'Plan', outcome: 'home', facility_id: 'facility',
    practitioner_id: 'practitioner', encounter_date: new Date(timestamp), version: 1,
    created_at: new Date(timestamp), updated_at: new Date(timestamp),
  });
  expect((await pool.query('SELECT * FROM observations')).rows[0]).toMatchObject({
    id: observation.entityId, patient_id: patient.entityId, encounter_id: encounter.entityId,
    originating_node_id: observation.nodeId, source_system: 'form', source_record_id: 'reading',
    code: 'temperature', value_text: 'normal', value_numeric: 0, unit: 'Cel', observed_at: new Date(timestamp),
    version: 1, created_at: new Date(timestamp), updated_at: new Date(timestamp),
  });
  expect((await pool.query('SELECT * FROM immunizations')).rows[0]).toMatchObject({
    id: immunization.entityId, patient_id: patient.entityId, encounter_id: encounter.entityId,
    originating_node_id: immunization.nodeId, source_system: 'form', source_record_id: 'dose',
    vaccine_code: 'BCG', vaccine_name: 'BCG vaccine', dose_label: 'dose-1', administered_date: new Date(timestamp),
    status: 'completed', remarks: 'Synthetic remarks', version: 1,
    created_at: new Date(timestamp), updated_at: new Date(timestamp),
  });
  for (const input of [encounter, observation, immunization]) expect((await post(input)).body.duplicate).toBe(true);
  expect(await receipts()).toHaveLength(4);
});

it('rejects unsupported delete without retaining the operation', async () => {
  const operationType = 'delete' as const;
  expect((await post({ ...operation(), operationType })).status).toBe(400);
  await expectEmpty();
});
it.each(['encounter', 'observation', 'immunization'] as const)(
  'rejects unsupported %s update without retaining the operation',
  async (entityType) => {
    expect((await post({ ...operation(entityType), operationType: 'update' })).status).toBe(400);
    await expectEmpty();
  }
);
it.each([null, [], 'opaque', 42, false, {}])('rejects noncanonical payload %j and rolls back its ledger entry', async (payload) => {
  expect((await post({ ...operation(), payload })).status).toBe(400);
  await expectEmpty();
});
it.each([
  { firstName: '' }, { firstName: ' ' }, { lastName: null }, { birthDate: 'bad-date' }, { sex: 'invalid' },
  { version: 1.5 }, { version: 0 }, { version: '1' }, { createdAt: 'not-a-timestamp' },
  { middleName: 123 }, { id: randomUUID() },
])('rolls back invalid canonical fields %j', async (fields) => {
  expect((await post(operation('patient', fields))).status).toBe(400);
  await expectEmpty();
});
it.each([
  { operationId: '' }, { operationId: 'not-a-uuid' }, { nodeId: 123 }, { nodeId: ' ' },
  { entityId: ' ' }, { entityType: 'invalid' }, { operationType: 'invalid' }, { payload: undefined },
])('rejects invalid envelope %j', async (changes) => {
  expect((await request(app).post('/api/sync/operations').send({ ...operation(), ...changes })).status).toBe(400);
  await expectEmpty();
});
it('accepts absent headers and trims envelope identifiers', async () => {
  const input = operation();
  const response = await request(app).post('/api/sync/operations').send({
    ...input, operationId: ` ${input.operationId} `, entityId: ` ${input.entityId} `, nodeId: ` ${input.nodeId} `,
  });
  expect(response.status).toBe(201);
  expect(await findSyncOperationById(input.operationId)).toMatchObject(input);
});
it.each(['Idempotency-Key', 'X-IDG4H-Node-ID'])('rejects a mismatched %s header', async (header) => {
  expect((await request(app).post('/api/sync/operations').set(header, 'wrong-header').send(operation())).status).toBe(400);
  await expectEmpty();
});
it('returns a safe JSON error for malformed JSON', async () => {
  const response = await request(app).post('/api/sync/operations').set('Content-Type', 'application/json').send('{invalid');
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: 'Invalid JSON body.' });
});

it('rolls back a missing dependency and accepts the same operation after its parent arrives', async () => {
  const patient = operation();
  const encounter = operation('encounter', { patientId: patient.entityId });
  expect((await post(encounter)).status).toBe(409);
  await expectEmpty();
  expect((await pool.query('SELECT * FROM encounters')).rows).toEqual([]);
  await receiveSyncOperation(patient);
  expect((await post(encounter)).status).toBe(201);
  expect((await findSyncOperationById(encounter.operationId))?.status).toBe('applied');
});
it('refuses a second operation ID that tries to recreate the same entity', async () => {
  const input = operation();
  await receiveSyncOperation(input);
  const duplicate = { ...input, operationId: randomUUID() };
  expect((await post(duplicate)).status).toBe(409);
  expect(await findSyncOperationById(duplicate.operationId)).toBeUndefined();
  expect((await pool.query('SELECT * FROM patients')).rowCount).toBe(1);
});
it.each(['observation', 'immunization'] as const)('prevents a %s from linking another patient encounter', async (entityType) => {
  const first = operation(); const second = operation();
  await receiveSyncOperation(first); await receiveSyncOperation(second);
  const encounter = operation('encounter', { patientId: first.entityId });
  await receiveSyncOperation(encounter);
  const child = operation(entityType, { patientId: second.entityId, encounterId: encounter.entityId });
  expect((await post(child)).status).toBe(400);
  expect(await findSyncOperationById(child.operationId)).toBeUndefined();
});

it.each(['ledger-update', 'commit'] as const)('rolls back canonical and ledger writes on a %s failure', async (stage) => {
  const input = operation();
  await pool.query(`CREATE FUNCTION reject_sync_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Synthetic storage failure'; END; $$;`);
  if (stage === 'ledger-update') {
    await pool.query(`CREATE TRIGGER reject_sync_test BEFORE UPDATE ON sync_operations
      FOR EACH ROW EXECUTE FUNCTION reject_sync_test()`);
  } else {
    await pool.query(`CREATE CONSTRAINT TRIGGER reject_sync_test AFTER INSERT ON patients
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_sync_test()`);
  }
  try {
    const response = await post(input);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Synchronization storage is unavailable.' });
    await expectEmpty();
  } finally {
    const table = stage === 'ledger-update' ? 'sync_operations' : 'patients';
    await pool.query(`DROP TRIGGER reject_sync_test ON ${table}; DROP FUNCTION reject_sync_test()`);
  }
  expect((await post(input)).status).toBe(201);
});
it('documents new and duplicate ACK responses', () => {
  expect(swaggerSpec).toHaveProperty('paths./api/sync/operations.post.responses.201');
  expect(swaggerSpec).toHaveProperty('paths./api/sync/operations.post.responses.200');
});
