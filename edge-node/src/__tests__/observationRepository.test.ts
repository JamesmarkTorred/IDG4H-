import type { ObservationInput, PatientInput } from '../domain';
import { db } from '../db/connection';
import { createPatient } from '../db/patientRepository';
import { createEncounter } from '../db/encounterRepository';
import {
  createObservation,
  findObservationById,
  findObservationsByPatientId,
  findObservationsByEncounterId,
  findObservationsByPatientAndCode,
  findObservationBySourceRecord,
} from '../db/observationRepository';

const patientInput: PatientInput = {
  nodeId: 'test-edge-001',
  lastName: 'Santos',
  firstName: 'Ana',
  birthDate: '1987-04-20',
  sex: 'female',
};

let input: ObservationInput;

beforeEach(() => {
  db.exec('DELETE FROM observations; DELETE FROM encounters; DELETE FROM patients;');
  const patient = createPatient(patientInput);
  input = {
    patientId: patient.id,
    nodeId: patientInput.nodeId,
    code: 'systolic-blood-pressure',
    valueNumeric: 120,
    observedAt: '2026-09-03T08:00:00.000Z',
  };
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());

describe('observation repository', () => {
  it('persists numeric observations with encounter, provenance, and version metadata', () => {
    const encounter = createEncounter({
      patientId: input.patientId,
      nodeId: input.nodeId,
      encounterDate: input.observedAt,
    });
    const fullInput: ObservationInput = {
      ...input,
      encounterId: encounter.id,
      sourceSystem: 'offline-form',
      sourceRecordId: 'test-observation-001',
      unit: 'mmHg',
    };
    const observation = createObservation(fullInput);

    expect(observation).toEqual({
      ...fullInput,
      valueText: undefined,
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      version: 1,
      createdAt: expect.any(String),
      updatedAt: observation.createdAt,
    });
    expect(new Date(observation.createdAt).toISOString()).toBe(observation.createdAt);
    expect(findObservationById(observation.id)).toEqual(observation);
    expect(findObservationsByEncounterId(encounter.id)).toEqual([observation]);
    expect(findObservationBySourceRecord(' offline-form ', ' test-observation-001 ')).toEqual(observation);
  });

  it('supports text observations without an encounter and normalizes nullable fields', () => {
    const observation = createObservation({
      ...input,
      code: ' test-note ',
      valueNumeric: undefined,
      valueText: ' Test finding ',
      unit: '   ',
      sourceSystem: ' offline-form ',
      sourceRecordId: ' test-text ',
    });

    expect(observation).toMatchObject({
      code: 'test-note',
      valueText: 'Test finding',
      sourceSystem: 'offline-form',
      sourceRecordId: 'test-text',
    });
    expect(observation.valueNumeric).toBeUndefined();
    expect(observation.encounterId).toBeUndefined();
    expect(observation.unit).toBeUndefined();
    expect(db.prepare(`
      SELECT encounter_id, value_numeric, unit FROM observations WHERE id = ?
    `).get(observation.id)).toEqual({ encounter_id: null, value_numeric: null, unit: null });
    expect(findObservationById(observation.id)).toEqual(observation);
  });

  it('preserves zero as a numeric value even when text is blank', () => {
    const observation = createObservation({ ...input, valueNumeric: 0, valueText: '   ' });

    expect(observation.valueNumeric).toBe(0);
    expect(observation.valueText).toBeUndefined();
    expect(findObservationById(observation.id)).toEqual(observation);
  });

  it.each([
    [{ valueNumeric: undefined }, 'Observation must contain valueText or valueNumeric.'],
    [{ valueNumeric: undefined, valueText: '   ' }, 'Observation must contain valueText or valueNumeric.'],
    [{ valueNumeric: 120, valueText: 'Test finding' }, 'Observation cannot contain both valueText and valueNumeric.'],
    [{ valueNumeric: NaN }, 'Observation valueNumeric must be a finite number.'],
    [{ valueNumeric: Infinity }, 'Observation valueNumeric must be a finite number.'],
    [{ valueNumeric: -Infinity }, 'Observation valueNumeric must be a finite number.'],
  ] satisfies [Partial<ObservationInput>, string][])(
    'rejects invalid values %j without inserting a row',
    (values, message) => {
      expect(() => createObservation({ ...input, ...values })).toThrow(message);
      expect(db.prepare('SELECT COUNT(*) AS count FROM observations').get()).toEqual({ count: 0 });
    }
  );

  it('rejects a nonexistent patient without inserting a row', () => {
    expect(() => createObservation({ ...input, patientId: 'missing-patient' }))
      .toThrow('Cannot create observation: patient missing-patient does not exist.');
    expect(db.prepare('SELECT COUNT(*) AS count FROM observations').get()).toEqual({ count: 0 });
  });

  it('rejects nonexistent encounters and encounters belonging to another patient', () => {
    const otherPatient = createPatient({ ...patientInput, firstName: 'Other' });
    const otherEncounter = createEncounter({
      patientId: otherPatient.id,
      nodeId: input.nodeId,
      encounterDate: input.observedAt,
    });

    for (const encounterId of ['missing-encounter', otherEncounter.id]) {
      expect(() => createObservation({ ...input, encounterId })).toThrow(
        `Cannot create observation: encounter ${encounterId} does not belong to patient ${input.patientId}.`
      );
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM observations').get()).toEqual({ count: 0 });
  });

  it('filters histories by patient, encounter, and code with the requested date ordering', () => {
    const encounter = createEncounter({
      patientId: input.patientId,
      nodeId: input.nodeId,
      encounterDate: input.observedAt,
    });
    const otherPatient = createPatient({ ...patientInput, firstName: 'Other' });
    jest.spyOn(Date.prototype, 'toISOString')
      .mockReturnValueOnce('2026-09-03T10:00:00.000Z')
      .mockReturnValueOnce('2026-09-03T11:00:00.000Z')
      .mockReturnValueOnce('2026-09-03T12:00:00.000Z');

    const earlierCreated = createObservation({ ...input, encounterId: encounter.id });
    const laterCreated = createObservation({ ...input, encounterId: encounter.id });
    const earlierObserved = createObservation({
      ...input, encounterId: encounter.id, observedAt: '2026-09-02T08:00:00.000Z',
    });
    const otherCode = createObservation({ ...input, code: 'diastolic-blood-pressure', observedAt: '2026-09-01T08:00:00.000Z' });
    createObservation({ ...input, patientId: otherPatient.id });

    expect(findObservationsByPatientId(input.patientId)).toEqual([
      laterCreated, earlierCreated, earlierObserved, otherCode,
    ]);
    expect(findObservationsByEncounterId(encounter.id)).toEqual([
      earlierObserved, earlierCreated, laterCreated,
    ]);
    expect(findObservationsByPatientAndCode(input.patientId, ' SYSTOLIC-BLOOD-PRESSURE ')).toEqual([
      laterCreated, earlierCreated, earlierObserved,
    ]);
  });

  it('uses both source identifiers and preserves their uniqueness constraint', () => {
    const first = createObservation({ ...input, sourceSystem: 'source-a', sourceRecordId: '1' });
    const second = createObservation({ ...input, sourceSystem: 'source-b', sourceRecordId: '1' });

    expect(findObservationBySourceRecord('source-a', '1')).toEqual(first);
    expect(findObservationBySourceRecord('source-b', '1')).toEqual(second);
    expect(() => createObservation({ ...input, sourceSystem: ' source-a ', sourceRecordId: ' 1 ' }))
      .toThrow(/UNIQUE constraint failed/);
    expect(findObservationById(first.id)).toEqual(first);
    expect(findObservationsByPatientId(input.patientId)).toHaveLength(2);
  });

  it('returns undefined or empty histories when there is no match', () => {
    createObservation(input);

    expect(findObservationById('missing')).toBeUndefined();
    expect(findObservationBySourceRecord('missing', 'missing')).toBeUndefined();
    expect(findObservationsByPatientId('missing')).toEqual([]);
    expect(findObservationsByEncounterId('missing')).toEqual([]);
    expect(findObservationsByPatientAndCode(input.patientId, 'missing')).toEqual([]);
  });
});
