import config from '../config';
import { db } from '../db/connection';
import { createPatient, findPatientById } from '../db/patientRepository';
import { findEncountersByPatientId } from '../db/encounterRepository';
import { findObservationsByPatientId } from '../db/observationRepository';
import { findImmunizationsByPatientId } from '../db/immunizationRepository';
import {
  saveClinicalEncounter,
  type ClinicalEncounterInput,
} from '../services/clinicalEncounterService';

let input: ClinicalEncounterInput;

function snapshotVisitRecords() {
  return {
    outbox: db.prepare('SELECT * FROM outbox ORDER BY id').all(),
    encounters: db.prepare('SELECT * FROM encounters ORDER BY id').all(),
    observations: db.prepare('SELECT * FROM observations ORDER BY id').all(),
    immunizations: db.prepare('SELECT * FROM immunizations ORDER BY id').all(),
  };
}

beforeEach(() => {
  db.exec(`
    DELETE FROM outbox;
    DELETE FROM immunizations;
    DELETE FROM observations;
    DELETE FROM encounters;
    DELETE FROM patients;
  `);
  const patient = createPatient({
    lastName: 'Garcia',
    firstName: 'Elena',
    birthDate: '1992-08-12',
    sex: 'female',
  });
  input = {
    patientId: patient.id,
    encounter: {
      encounterDate: '2026-09-03T08:00:00.000Z',
      encounterType: 'consultation',
    },
    observations: [
      {
        code: 'test-numeric',
        valueNumeric: 118,
        observedAt: '2026-09-03T08:00:00.000Z',
      },
      {
        code: 'test-text',
        valueText: 'Test finding',
        observedAt: '2026-09-03T08:01:00.000Z',
      },
    ],
    immunizations: [
      {
        vaccineCode: 'TEST-VACCINE',
        administeredDate: '2026-09-03T08:02:00.000Z',
      },
    ],
  };
});

afterAll(() => db.close());

describe('clinical encounter transaction', () => {
  it('commits a complete visit with every child linked to the same patient and new encounter', () => {
    const patientBefore = findPatientById(input.patientId);
    const result = saveClinicalEncounter(input);

    expect(result.encounter.nodeId).toBe(config.nodeId);
    expect(result.encounter).toMatchObject({
      ...input.encounter,
      patientId: input.patientId,
    });
    expect(result.observations).toHaveLength(2);
    expect(result.immunizations).toHaveLength(1);
    for (const child of [...result.observations, ...result.immunizations]) {
      expect(child.nodeId).toBe(config.nodeId);
      expect(child).toMatchObject({
        patientId: input.patientId,
        encounterId: result.encounter.id,
        version: 1,
      });
    }
    expect(findEncountersByPatientId(input.patientId)).toEqual([result.encounter]);
    expect(findObservationsByPatientId(input.patientId)).toEqual([
      result.observations[1], result.observations[0],
    ]);
    expect(findImmunizationsByPatientId(input.patientId)).toEqual(result.immunizations);
    expect(findPatientById(input.patientId)).toEqual(patientBefore);
    expect(db.inTransaction).toBe(false);
  });

  it('supports a visit with both optional collections omitted', () => {
    const result = saveClinicalEncounter({ patientId: input.patientId, encounter: input.encounter });

    expect(result.observations).toEqual([]);
    expect(result.immunizations).toEqual([]);
    expect(findEncountersByPatientId(input.patientId)).toEqual([result.encounter]);
    expect(findObservationsByPatientId(input.patientId)).toEqual([]);
    expect(findImmunizationsByPatientId(input.patientId)).toEqual([]);
  });

  it('rejects a missing patient without writing any visit records', () => {
    const before = snapshotVisitRecords();

    expect(() => saveClinicalEncounter({ ...input, patientId: 'missing-patient' }))
      .toThrow('Cannot create encounter: patient missing-patient does not exist.');
    expect(snapshotVisitRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);
  });

  it('rolls back the encounter and earlier observations when a later observation is invalid', () => {
    saveClinicalEncounter(input);
    const before = snapshotVisitRecords();
    const invalid: ClinicalEncounterInput = {
      ...input,
      observations: [
        ...input.observations!,
        {
          code: 'invalid-value',
          valueNumeric: 123,
          valueText: 'invalid',
          observedAt: '2026-09-03T08:03:00.000Z',
        },
      ],
    };

    expect(() => saveClinicalEncounter(invalid))
      .toThrow('Observation cannot contain both valueText and valueNumeric.');
    expect(snapshotVisitRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);
  });

  it('rolls back all three record types when a later immunization fails and can save afterward', () => {
    saveClinicalEncounter(input);
    const before = snapshotVisitRecords();
    const invalid: ClinicalEncounterInput = {
      ...input,
      immunizations: [
        ...input.immunizations!,
        { vaccineCode: '   ' },
      ],
    };

    expect(() => saveClinicalEncounter(invalid)).toThrow('vaccineCode is required.');
    expect(snapshotVisitRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);

    const result = saveClinicalEncounter(input);
    expect(findEncountersByPatientId(input.patientId)).toHaveLength(2);
    expect(findEncountersByPatientId(input.patientId)).toContainEqual(result.encounter);
    expect(findObservationsByPatientId(input.patientId)).toHaveLength(4);
    expect(findImmunizationsByPatientId(input.patientId)).toHaveLength(2);
  });

  it('rolls back earlier inserts on a SQLite source-record constraint failure', () => {
    const sourceObservation = {
      ...input.observations![0],
      sourceSystem: 'test-source',
      sourceRecordId: 'existing-observation',
    };
    saveClinicalEncounter({ ...input, observations: [sourceObservation] });
    const before = snapshotVisitRecords();

    expect(() => saveClinicalEncounter({
      ...input,
      observations: [...input.observations!, sourceObservation],
    })).toThrow(/UNIQUE constraint failed/);
    expect(snapshotVisitRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);
  });
});
