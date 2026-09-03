import type { PatientInput } from '../domain';
import { db } from '../db/connection';
import { createPatient, findPatientById } from '../db/patientRepository';
import { findPatientCandidates } from '../services/patientIdentityService';
import { registerPatient } from '../services/patientRegistrationService';

const input: PatientInput = {
  sourceSystem: 'offline-form',
  sourceRecordId: 'test-source-001',
  phicNo: 'test-phic-001',
  lastName: 'Dela Cruz',
  firstName: 'Juan',
  birthDate: '1990-05-10',
  sex: 'male',
};

beforeEach(() => db.exec('DELETE FROM patients'));
afterAll(() => db.close());

describe('patient identity and registration', () => {
  it('creates and persists a patient when no candidates exist', () => {
    const result = registerPatient(input);

    expect(result.created).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(result.patient).toMatchObject(input);
    expect(findPatientById(result.patient!.id)).toEqual(result.patient);
  });

  it('returns one strong source candidate when all three identifiers match', () => {
    const patient = createPatient(input);

    expect(registerPatient(input)).toEqual({
      created: false,
      candidates: [{ patient, reason: 'source-record', confidence: 'strong' }],
    });
    expect(findPatientById(patient.id)).toEqual(patient);
    expect(db.prepare('SELECT COUNT(*) AS count FROM patients').get()).toEqual({ count: 1 });
  });

  it('keeps the strong PHIC reason when the source differs and demographics also match', () => {
    const patient = createPatient(input);

    expect(registerPatient({ ...input, sourceRecordId: 'different-source' })).toEqual({
      created: false,
      candidates: [{ patient, reason: 'phic-number', confidence: 'strong' }],
    });
    expect(findPatientById(patient.id)).toEqual(patient);
    expect(db.prepare('SELECT COUNT(*) AS count FROM patients').get()).toEqual({ count: 1 });
  });

  it('returns every demographic candidate without merging, updating, or inserting records', () => {
    const demographicInput: PatientInput = {
      lastName: input.lastName,
      firstName: input.firstName,
      birthDate: input.birthDate,
      sex: input.sex,
    };
    const first = createPatient(demographicInput);
    const second = createPatient(demographicInput);
    const result = registerPatient({
      ...demographicInput,
      lastName: ' dela cruz ',
      firstName: ' JUAN ',
      contactNumber: 'TEST-NEW-CONTACT',
    });

    expect(result.created).toBe(false);
    expect(result.patient).toBeUndefined();
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates).toEqual(expect.arrayContaining([
      { patient: first, reason: 'demographic-match', confidence: 'candidate' },
      { patient: second, reason: 'demographic-match', confidence: 'candidate' },
    ]));
    expect(findPatientById(first.id)).toEqual(first);
    expect(findPatientById(second.id)).toEqual(second);
    expect(db.prepare('SELECT COUNT(*) AS count FROM patients').get()).toEqual({ count: 2 });
  });

  it('retains distinct source, PHIC, and demographic candidates in priority order', () => {
    const source = createPatient({ ...input, phicNo: 'other-phic', firstName: 'Source' });
    const phic = createPatient({ ...input, sourceRecordId: 'other-source', firstName: 'Phic' });
    const demographic = createPatient({ ...input, sourceRecordId: undefined, phicNo: undefined });

    expect(findPatientCandidates(input)).toEqual([
      { patient: source, reason: 'source-record', confidence: 'strong' },
      { patient: phic, reason: 'phic-number', confidence: 'strong' },
      { patient: demographic, reason: 'demographic-match', confidence: 'candidate' },
    ]);
  });

  it('does not treat a shared family number or names with a different birth date as a match', () => {
    createPatient({ ...input, familySerialNo: 'shared-family' });
    const result = registerPatient({
      ...input,
      sourceSystem: undefined,
      sourceRecordId: undefined,
      phicNo: undefined,
      familySerialNo: 'shared-family',
      birthDate: '1991-05-10',
    });

    expect(result.created).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM patients').get()).toEqual({ count: 2 });
  });
});
