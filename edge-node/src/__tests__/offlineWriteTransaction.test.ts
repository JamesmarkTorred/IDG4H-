import { db } from '../db/connection';
import { findPatientById } from '../db/patientRepository';

import {
  createPatientWithOutbox,
} from '../services/patientWriteService';

import {
  saveClinicalEncounter,
} from '../services/clinicalEncounterService';

import {
  findPendingOutbox,
} from '../db/outboxRepository';

describe('offline transactional writes', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM outbox;
      DELETE FROM observations;
      DELETE FROM immunizations;
      DELETE FROM encounters;
      DELETE FROM patients;
    `);
  });

  afterEach(() => db.exec('DROP TRIGGER IF EXISTS test_reject_outbox;'));
  afterAll(() => db.close());

  function snapshotRecords() {
    return {
      patients: db.prepare('SELECT * FROM patients ORDER BY id').all(),
      encounters: db.prepare('SELECT * FROM encounters ORDER BY id').all(),
      observations: db.prepare('SELECT * FROM observations ORDER BY id').all(),
      immunizations: db.prepare('SELECT * FROM immunizations ORDER BY id').all(),
      outbox: db.prepare('SELECT * FROM outbox ORDER BY id').all(),
    };
  }

  test(
    'patient creation and outbox enqueue commit together',
    () => {
      const patient =
        createPatientWithOutbox({
          lastName: 'Synthetic',
          firstName: 'Patient',
          birthDate: '1990-01-01',
          sex: 'unknown',
        });

      const outbox =
        findPendingOutbox();

      expect(patient.id).toBeTruthy();

      expect(outbox).toHaveLength(1);

      expect(outbox[0].entityType)
        .toBe('patient');

      expect(outbox[0].entityId)
        .toBe(patient.id);

      expect(outbox[0].operationType)
        .toBe('create');
      expect(outbox[0].payload).toEqual(JSON.parse(JSON.stringify(patient)));
      expect(outbox[0].nodeId).toBe(patient.nodeId);
      expect(findPatientById(patient.id)).toEqual(patient);
    }
  );

  test(
    'clinical encounter and all outbox records commit together',
    () => {
      const patient =
        createPatientWithOutbox({
          lastName: 'Synthetic',
          firstName: 'Encounter',
          birthDate: '1991-02-02',
          sex: 'female',
        });

      /*
       * Clear the patient creation operation so this
       * assertion only examines the encounter write.
       */
      db.prepare(`
        DELETE FROM outbox
      `).run();

      const now =
        new Date().toISOString();

      const result =
        saveClinicalEncounter({
          patientId: patient.id,

          encounter: {
            encounterDate: now,
            encounterType:
              'consultation',
          },

          observations: [
            {
              code:
                'systolic-blood-pressure',
              valueNumeric: 120,
              unit: 'mmHg',
              observedAt: now,
            },

            {
              code:
                'diastolic-blood-pressure',
              valueNumeric: 80,
              unit: 'mmHg',
              observedAt: now,
            },
          ],

          immunizations: [
            {
              vaccineCode:
                'TEST-VACCINE',
              vaccineName:
                'Synthetic Test Vaccine',
              administeredDate: now,
              status: 'completed',
            },
          ],
        });

      const outbox =
        findPendingOutbox();

      expect(outbox).toHaveLength(4);
      for (const record of [result.encounter, ...result.observations, ...result.immunizations]) {
        const operation = outbox.find((item) => item.entityId === record.id)!;
        expect(operation.operationType).toBe('create');
        expect(operation.status).toBe('pending');
        expect(operation.nodeId).toBe(record.nodeId);
        expect(operation.payload).toEqual(JSON.parse(JSON.stringify(record)));
      }
      expect(new Set(outbox.map((operation) => operation.operationId)).size).toBe(4);

      expect(
        outbox.some(
          (item) =>
            item.entityType ===
              'encounter' &&
            item.entityId ===
              result.encounter.id
        )
      ).toBe(true);

      for (
        const observation
        of result.observations
      ) {
        expect(
          outbox.some(
            (item) =>
              item.entityType ===
                'observation' &&
              item.entityId ===
                observation.id
          )
        ).toBe(true);
      }

      expect(
        outbox.some(
          (item) =>
            item.entityType ===
              'immunization' &&
            item.entityId ===
              result.immunizations[0].id
        )
      ).toBe(true);
    }
  );

  test(
    'failed clinical write rolls back domain and outbox records',
    () => {
      const patient =
        createPatientWithOutbox({
          lastName: 'Rollback',
          firstName: 'Patient',
          birthDate: '1992-03-03',
          sex: 'male',
        });

      db.prepare(`
        DELETE FROM outbox
      `).run();

      const beforeEncounters =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM encounters
        `).get() as {
          count: number;
        };

      const beforeObservations =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM observations
        `).get() as {
          count: number;
        };

      expect(() =>
        saveClinicalEncounter({
          patientId: patient.id,

          encounter: {
            encounterDate:
              new Date().toISOString(),

            encounterType:
              'consultation',
          },

          observations: [
            {
              code:
                'invalid-observation',

              valueText: 'invalid',
              valueNumeric: 123,

              observedAt:
                new Date().toISOString(),
            },
          ],
        })
      ).toThrow();

      const afterEncounters =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM encounters
        `).get() as {
          count: number;
        };

      const afterObservations =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM observations
        `).get() as {
          count: number;
        };

      const outbox =
        findPendingOutbox();

      expect(afterEncounters.count)
        .toBe(beforeEncounters.count);

      expect(afterObservations.count)
        .toBe(beforeObservations.count);

      expect(outbox).toHaveLength(0);
    }
  );
  test('outbox failure rolls back a new patient and preserves existing records', () => {
    createPatientWithOutbox({
      lastName: 'Existing', firstName: 'Patient', birthDate: '1990-01-01', sex: 'unknown',
    });
    const before = snapshotRecords();
    db.exec(`
      CREATE TEMP TRIGGER test_reject_outbox
      BEFORE INSERT ON outbox
      WHEN NEW.entity_type = 'patient'
      BEGIN
        SELECT RAISE(ABORT, 'Synthetic patient outbox failure');
      END;
    `);

    expect(() => createPatientWithOutbox({
      lastName: 'Rollback', firstName: 'Patient', birthDate: '1991-01-01', sex: 'unknown',
    })).toThrow('Synthetic patient outbox failure');
    expect(snapshotRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);
  });

  test('patient domain failure creates no extra outbox operation', () => {
    const input = {
      lastName: 'Existing', firstName: 'Patient', birthDate: '1990-01-01', sex: 'unknown' as const,
      sourceSystem: 'test-source', sourceRecordId: 'same-record',
    };
    createPatientWithOutbox(input);
    const before = snapshotRecords();

    expect(() => createPatientWithOutbox(input)).toThrow(/UNIQUE constraint failed/);
    expect(snapshotRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);
  });

  test('a late immunization outbox failure rolls back the entire visit and its earlier operations', () => {
    const patient = createPatientWithOutbox({
      lastName: 'Existing', firstName: 'Patient', birthDate: '1990-01-01', sex: 'unknown',
    });
    const visit = {
      patientId: patient.id,
      encounter: { encounterDate: '2026-09-03T08:00:00.000Z' },
      observations: [{
        code: 'test-observation', valueNumeric: 120, observedAt: '2026-09-03T08:00:00.000Z',
      }],
      immunizations: [{ vaccineCode: 'TEST-VACCINE' }],
    };
    saveClinicalEncounter(visit);
    const before = snapshotRecords();
    db.exec(`
      CREATE TEMP TRIGGER test_reject_outbox
      BEFORE INSERT ON outbox
      WHEN NEW.entity_type = 'immunization'
      BEGIN
        SELECT RAISE(ABORT, 'Synthetic immunization outbox failure');
      END;
    `);

    expect(() => saveClinicalEncounter(visit)).toThrow('Synthetic immunization outbox failure');
    expect(snapshotRecords()).toEqual(before);
    expect(db.inTransaction).toBe(false);

    db.exec('DROP TRIGGER test_reject_outbox;');
    const result = saveClinicalEncounter(visit);
    expect(findPendingOutbox()).toHaveLength(7);
    expect(findPendingOutbox().some((record) => record.entityId === result.encounter.id)).toBe(true);
  });
});
