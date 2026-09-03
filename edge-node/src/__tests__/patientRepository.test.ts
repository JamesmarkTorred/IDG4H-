import type { PatientInput } from '../domain';
import { db } from '../db/connection';
import {
  createPatient,
  findPatientById,
  findPatientByPhicNo,
  findPatientByFamilySerialNo,
  searchPatientsByDemographics,
  findPatientBySourceRecord,
} from '../db/patientRepository';

const input: PatientInput = {
  nodeId: 'test-edge-001',
  lastName: 'Dela Cruz',
  firstName: 'Juan',
  birthDate: '1990-05-10',
  sex: 'male',
};

beforeEach(() => db.exec('DELETE FROM patients'));
afterAll(() => db.close());

describe('patient repository', () => {
  it('round-trips every patient field and initializes identity and version metadata', () => {
    const fullInput: PatientInput = {
      ...input,
      sourceSystem: 'test-source',
      sourceRecordId: 'record-001',
      familySerialNo: 'family-001',
      phicNo: 'phic-001',
      middleName: 'Santos',
      suffix: 'Jr.',
      civilStatus: 'married',
      placeOfBirth: 'Butuan City',
      religion: 'Test religion',
      educationalAttainment: 'Secondary',
      contactNumber: 'TEST-CONTACT',
      addressLine: 'Test address',
      purok: 'Purok 1',
      barangay: 'Baan 3',
      municipalityCity: 'Butuan City',
      province: 'Agusan del Norte',
      district: 'Test district',
      phicMembershipCategory: 'Test category',
      phicMembershipType: 'Test type',
      employmentStatus: 'Self-employed',
      occupation: 'Farmer',
      spouseName: 'Test spouse',
      spouseBirthDate: '1991-06-11',
      spouseOccupation: 'Teacher',
      memberMaidenName: 'Test maiden name',
      fatherName: 'Test father',
      familyPosition: 'Head',
    };

    const patient = createPatient(fullInput);

    expect(patient).toEqual({
      ...fullInput,
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      version: 1,
      createdAt: expect.any(String),
      updatedAt: patient.createdAt,
    });
    expect(new Date(patient.createdAt).toISOString()).toBe(patient.createdAt);
    expect(findPatientById(patient.id)).toEqual(patient);
    expect(findPatientByPhicNo(' phic-001 ')).toEqual(patient);
    expect(findPatientBySourceRecord(' test-source ', ' record-001 ')).toEqual(patient);
  });

  it('trims names and optional values, storing blanks as NULL and returning undefined', () => {
    const patient = createPatient({
      ...input,
      lastName: ' Dela Cruz ',
      firstName: ' Juan ',
      middleName: '   ',
      suffix: '',
      phicNo: ' phic-trimmed ',
    });

    expect(patient.lastName).toBe('Dela Cruz');
    expect(patient.firstName).toBe('Juan');
    expect(patient.phicNo).toBe('phic-trimmed');
    expect(patient.middleName).toBeUndefined();
    expect(patient.suffix).toBeUndefined();
    expect(patient.occupation).toBeUndefined();
    expect(db.prepare('SELECT middle_name, suffix, occupation FROM patients WHERE id = ?')
      .get(patient.id)).toEqual({ middle_name: null, suffix: null, occupation: null });
  });

  it('returns all family members ordered by last name, first name, and birth date', () => {
    const family = { ...input, familySerialNo: 'shared-family' };
    const laterBirth = createPatient(family);
    const otherLastName = createPatient({ ...family, lastName: 'Santos' });
    const earlierBirth = createPatient({ ...family, birthDate: '1980-01-01' });
    const earlierName = createPatient({ ...family, firstName: 'Ana' });
    createPatient({ ...input, familySerialNo: 'another-family' });

    expect(findPatientByFamilySerialNo(' shared-family ')).toEqual([
      earlierName, earlierBirth, laterBirth, otherLastName,
    ]);
  });

  it('searches demographics case-insensitively with an exact birth date and keeps separate matches', () => {
    const first = createPatient(input);
    const second = createPatient(input);
    createPatient({ ...input, birthDate: '1990-05-11' });
    createPatient({ ...input, firstName: 'Juana' });

    const matches = searchPatientsByDemographics(' dela cruz ', ' JUAN ', input.birthDate);
    expect(matches).toHaveLength(2);
    expect(matches).toEqual(expect.arrayContaining([first, second]));
    expect(first.id).not.toBe(second.id);
  });

  it('uses the source system and record ID together and preserves the unique source constraint', () => {
    const first = createPatient({ ...input, sourceSystem: 'source-a', sourceRecordId: '1' });
    const second = createPatient({ ...input, sourceSystem: 'source-b', sourceRecordId: '1' });

    expect(findPatientBySourceRecord('source-a', '1')).toEqual(first);
    expect(findPatientBySourceRecord('source-b', '1')).toEqual(second);
    expect(() => createPatient({ ...input, sourceSystem: ' source-a ', sourceRecordId: ' 1 ' }))
      .toThrow(/UNIQUE constraint failed/);
    expect(findPatientById(first.id)).toEqual(first);
  });

  it('returns undefined or an empty array for missing records', () => {
    createPatient(input);

    expect(findPatientById('missing')).toBeUndefined();
    expect(findPatientByPhicNo('missing')).toBeUndefined();
    expect(findPatientBySourceRecord('missing', 'missing')).toBeUndefined();
    expect(findPatientByFamilySerialNo('missing')).toEqual([]);
    expect(searchPatientsByDemographics('missing', 'missing', input.birthDate)).toEqual([]);
  });
});
