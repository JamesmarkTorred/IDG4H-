import type { EncounterInput, PatientInput } from '../domain';
import config from '../config';
import { db } from '../db/connection';
import { createPatient } from '../db/patientRepository';
import {
  createEncounter,
  findEncounterById,
  findEncountersByPatientId,
  findEncounterBySourceRecord,
} from '../db/encounterRepository';

const patientInput: PatientInput = {
  lastName: 'Dela Cruz',
  firstName: 'Maria',
  birthDate: '1995-06-15',
  sex: 'female',
};

let input: EncounterInput;

beforeEach(() => {
  db.exec('DELETE FROM encounters; DELETE FROM patients;');
  const patient = createPatient(patientInput);
  input = {
    patientId: patient.id,
    encounterDate: '2026-09-03T08:00:00.000Z',
  };
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());

describe('encounter repository', () => {
  it('persists every encounter field and initializes identity and version metadata', () => {
    const fullInput: EncounterInput = {
      ...input,
      sourceSystem: 'offline-form',
      sourceRecordId: 'test-encounter-001',
      encounterType: 'consultation',
      chiefComplaint: 'Test complaint',
      historyPresentIllness: 'Test history',
      assessmentPlan: 'Test assessment',
      outcome: 'follow-up',
      facilityId: 'test-facility',
      practitionerId: 'test-practitioner',
    };

    const encounter = createEncounter(fullInput);

    const { nodeId, ...persistedFields } = encounter;
    expect(nodeId).toBe(config.nodeId);
    expect(persistedFields).toEqual({
      ...fullInput,
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      version: 1,
      createdAt: expect.any(String),
      updatedAt: encounter.createdAt,
    });
    expect(new Date(encounter.createdAt).toISOString()).toBe(encounter.createdAt);
    expect(findEncounterById(encounter.id)).toEqual(encounter);
    expect(findEncounterBySourceRecord(' offline-form ', ' test-encounter-001 ')).toEqual(encounter);
    expect(findEncountersByPatientId(input.patientId)).toEqual([encounter]);
  });

  it('trims optional values and maps blank or omitted fields between NULL and undefined', () => {
    const encounter = createEncounter({
      ...input,
      sourceSystem: ' offline-form ',
      sourceRecordId: ' test-trimmed ',
      encounterType: ' consultation ',
      chiefComplaint: '   ',
      assessmentPlan: '',
    });

    expect(encounter.sourceSystem).toBe('offline-form');
    expect(encounter.sourceRecordId).toBe('test-trimmed');
    expect(encounter.encounterType).toBe('consultation');
    expect(encounter.chiefComplaint).toBeUndefined();
    expect(encounter.assessmentPlan).toBeUndefined();
    expect(encounter.practitionerId).toBeUndefined();
    expect(db.prepare(`
      SELECT chief_complaint, assessment_plan, practitioner_id
      FROM encounters WHERE id = ?
    `).get(encounter.id)).toEqual({
      chief_complaint: null,
      assessment_plan: null,
      practitioner_id: null,
    });
  });

  it('rejects a missing patient without inserting an encounter', () => {
    expect(() => createEncounter({ ...input, patientId: 'missing-patient' }))
      .toThrow('Cannot create encounter: patient missing-patient does not exist.');
    expect(db.prepare('SELECT COUNT(*) AS count FROM encounters').get()).toEqual({ count: 0 });
  });

  it('limits history to the patient and sorts by encounter date then creation time descending', () => {
    const otherPatient = createPatient({ ...patientInput, firstName: 'Other' });
    jest.spyOn(Date.prototype, 'toISOString')
      .mockReturnValueOnce('2026-09-03T10:00:00.000Z')
      .mockReturnValueOnce('2026-09-03T11:00:00.000Z')
      .mockReturnValueOnce('2026-09-03T12:00:00.000Z');

    const earlierCreated = createEncounter(input);
    const laterCreated = createEncounter(input);
    const earlierEncounter = createEncounter({ ...input, encounterDate: '2026-09-02T08:00:00.000Z' });
    createEncounter({ ...input, patientId: otherPatient.id });

    expect(findEncountersByPatientId(input.patientId)).toEqual([
      laterCreated, earlierCreated, earlierEncounter,
    ]);
  });

  it('looks up the source pair and preserves the existing unique source constraint', () => {
    const first = createEncounter({ ...input, sourceSystem: 'source-a', sourceRecordId: '1' });
    const second = createEncounter({ ...input, sourceSystem: 'source-b', sourceRecordId: '1' });

    expect(findEncounterBySourceRecord('source-a', '1')).toEqual(first);
    expect(findEncounterBySourceRecord('source-b', '1')).toEqual(second);
    expect(() => createEncounter({ ...input, sourceSystem: ' source-a ', sourceRecordId: ' 1 ' }))
      .toThrow(/UNIQUE constraint failed/);
    expect(findEncounterById(first.id)).toEqual(first);
    expect(findEncountersByPatientId(input.patientId)).toHaveLength(2);
  });

  it('returns undefined or an empty history when there is no match', () => {
    createEncounter(input);

    expect(findEncounterById('missing')).toBeUndefined();
    expect(findEncounterBySourceRecord('missing', 'missing')).toBeUndefined();
    expect(findEncountersByPatientId('missing')).toEqual([]);
  });
});
