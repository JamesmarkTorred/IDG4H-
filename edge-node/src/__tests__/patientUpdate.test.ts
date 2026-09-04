import { db } from '../db/connection';
import { findPatientById } from '../db/patientRepository';
import {
  createPatientWithOutbox,
  updatePatientWithOutbox,
} from '../services/patientWriteService';

beforeEach(() => {
  db.exec('DELETE FROM outbox; DELETE FROM patients;');
});

afterAll(() => db.close());

function createPatient() {
  return createPatientWithOutbox({
    sourceSystem: 'update-test',
    sourceRecordId: `patient-${Date.now()}-${Math.random()}`,
    lastName: 'Version',
    firstName: 'Test',
    birthDate: '1990-01-01',
    sex: 'unknown',
    barangay: 'Original Barangay',
  });
}

it('updates a patient, preserves omitted fields, increments version, and queues the complete v2 record', () => {
  const patient = createPatient();
  const updated = updatePatientWithOutbox({
    id: patient.id,
    expectedVersion: 1,
    contactNumber: '09123456789',
    lastName: ' Updated ',
  });

  expect(updated).toMatchObject({
    id: patient.id,
    nodeId: patient.nodeId,
    version: 2,
    lastName: 'Updated',
    firstName: patient.firstName,
    barangay: 'Original Barangay',
    contactNumber: '09123456789',
    createdAt: patient.createdAt,
  });
  expect(updated.updatedAt >= patient.updatedAt).toBe(true);
  expect(findPatientById(patient.id)).toEqual(updated);

  const outbox = db.prepare(`
    SELECT operation_type, entity_id, payload FROM outbox
    WHERE entity_id = ? ORDER BY created_at, rowid
  `).all(patient.id) as Array<{ operation_type: string; entity_id: string; payload: string }>;
  expect(outbox).toHaveLength(2);
  expect(outbox.map(row => row.operation_type)).toEqual(['create', 'update']);
  expect(outbox[1].entity_id).toBe(patient.id);
  expect(JSON.parse(outbox[1].payload)).toEqual(updated);
});

it('rejects a stale update without changing the patient or adding an outbox entry', () => {
  const patient = createPatient();
  const current = updatePatientWithOutbox({
    id: patient.id,
    expectedVersion: 1,
    contactNumber: '111',
  });

  expect(() => updatePatientWithOutbox({
    id: patient.id,
    expectedVersion: 1,
    contactNumber: '222',
  })).toThrow('Patient version conflict. Expected 1, current 2.');
  expect(findPatientById(patient.id)).toEqual(current);
  expect(db.prepare('SELECT COUNT(*) AS count FROM outbox WHERE entity_id = ?')
    .get(patient.id)).toEqual({ count: 2 });
});

it('rejects an update for a missing patient without queuing it', () => {
  expect(() => updatePatientWithOutbox({
    id: 'missing-patient',
    expectedVersion: 1,
    contactNumber: '111',
  })).toThrow('Patient missing-patient does not exist.');
  expect(db.prepare('SELECT COUNT(*) AS count FROM outbox').get()).toEqual({ count: 0 });
});

it('rolls back the patient update if its outbox insert fails', () => {
  const patient = createPatient();
  db.exec(`
    CREATE TRIGGER reject_patient_update_outbox
    BEFORE INSERT ON outbox
    WHEN NEW.operation_type = 'update'
    BEGIN
      SELECT RAISE(ABORT, 'synthetic update outbox failure');
    END;
  `);
  try {
    expect(() => updatePatientWithOutbox({
      id: patient.id,
      expectedVersion: 1,
      contactNumber: 'should-roll-back',
    })).toThrow('synthetic update outbox failure');
  } finally {
    db.exec('DROP TRIGGER reject_patient_update_outbox');
  }

  expect(findPatientById(patient.id)).toEqual(patient);
  expect(db.prepare('SELECT operation_type FROM outbox WHERE entity_id = ?').all(patient.id))
    .toEqual([{ operation_type: 'create' }]);
});
