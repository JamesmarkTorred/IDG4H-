import type { ImmunizationInput, PatientInput } from '../domain';
import config from '../config';
import { db } from '../db/connection';
import { createPatient } from '../db/patientRepository';
import { createEncounter } from '../db/encounterRepository';
import {
  createImmunization,
  findImmunizationById,
  findImmunizationsByPatientId,
  findImmunizationsByEncounterId,
  findImmunizationsByPatientAndVaccine,
  findImmunizationBySourceRecord,
} from '../db/immunizationRepository';

const patientInput: PatientInput = {
  lastName: 'Reyes',
  firstName: 'Pedro',
  birthDate: '2025-01-15',
  sex: 'male',
};

let input: ImmunizationInput;

beforeEach(() => {
  db.exec('DELETE FROM immunizations; DELETE FROM encounters; DELETE FROM patients;');
  const patient = createPatient(patientInput);
  input = {
    patientId: patient.id,
    vaccineCode: 'BCG',
    administeredDate: '2026-09-03T08:00:00.000Z',
  };
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());

describe('immunization repository', () => {
  it('persists every field with encounter, provenance, and version metadata', () => {
    const encounter = createEncounter({
      patientId: input.patientId,
      encounterDate: '2026-09-03T08:00:00.000Z',
    });
    const fullInput: ImmunizationInput = {
      ...input,
      encounterId: encounter.id,
      sourceSystem: 'offline-form',
      sourceRecordId: 'test-immunization-001',
      vaccineName: 'BCG',
      doseLabel: 'dose-1',
      status: 'completed',
      remarks: 'Test record',
    };
    const immunization = createImmunization(fullInput);

    const { nodeId, ...persistedFields } = immunization;
    expect(nodeId).toBe(config.nodeId);
    expect(persistedFields).toEqual({
      ...fullInput,
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      version: 1,
      createdAt: expect.any(String),
      updatedAt: immunization.createdAt,
    });
    expect(new Date(immunization.createdAt).toISOString()).toBe(immunization.createdAt);
    expect(findImmunizationById(immunization.id)).toEqual(immunization);
    expect(findImmunizationsByEncounterId(encounter.id)).toEqual([immunization]);
    expect(findImmunizationBySourceRecord(' offline-form ', ' test-immunization-001 ')).toEqual(immunization);
  });

  it('defaults status to completed, trims values, and maps absent fields to undefined', () => {
    const immunization = createImmunization({
      ...input,
      vaccineCode: ' BCG ',
      vaccineName: ' BCG vaccine ',
      sourceSystem: ' offline-form ',
      sourceRecordId: ' test-trimmed ',
      doseLabel: ' dose-1 ',
      administeredDate: '   ',
      remarks: '',
    });

    expect(immunization).toMatchObject({
      status: 'completed',
      vaccineCode: 'BCG',
      vaccineName: 'BCG vaccine',
      sourceSystem: 'offline-form',
      sourceRecordId: 'test-trimmed',
      doseLabel: 'dose-1',
    });
    expect(immunization.encounterId).toBeUndefined();
    expect(immunization.administeredDate).toBeUndefined();
    expect(immunization.remarks).toBeUndefined();
    expect(db.prepare(`
      SELECT encounter_id, administered_date, remarks, status
      FROM immunizations WHERE id = ?
    `).get(immunization.id)).toEqual({
      encounter_id: null, administered_date: null, remarks: null, status: 'completed',
    });
    expect(findImmunizationById(immunization.id)).toEqual(immunization);
  });

  it.each(['not-done', 'unknown'] as const)('preserves explicit status %s without an administration date', (status) => {
    const immunization = createImmunization({ ...input, status, administeredDate: undefined });

    expect(immunization.status).toBe(status);
    expect(immunization.administeredDate).toBeUndefined();
    expect(findImmunizationById(immunization.id)).toEqual(immunization);
  });

  it.each(['', '   '])('rejects a blank vaccine code %j without inserting a row', (vaccineCode) => {
    expect(() => createImmunization({ ...input, vaccineCode })).toThrow('vaccineCode is required.');
    expect(db.prepare('SELECT COUNT(*) AS count FROM immunizations').get()).toEqual({ count: 0 });
  });

  it('rejects a nonexistent patient without inserting a row', () => {
    expect(() => createImmunization({ ...input, patientId: 'missing-patient' }))
      .toThrow('Cannot create immunization: patient missing-patient does not exist.');
    expect(db.prepare('SELECT COUNT(*) AS count FROM immunizations').get()).toEqual({ count: 0 });
  });

  it('rejects nonexistent encounters and encounters belonging to another patient', () => {
    const otherPatient = createPatient({ ...patientInput, firstName: 'Other' });
    const otherEncounter = createEncounter({
      patientId: otherPatient.id,
      encounterDate: '2026-09-03T08:00:00.000Z',
    });

    for (const encounterId of ['missing-encounter', otherEncounter.id]) {
      expect(() => createImmunization({ ...input, encounterId })).toThrow(
        `Cannot create immunization: encounter ${encounterId} does not belong to patient ${input.patientId}.`
      );
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM immunizations').get()).toEqual({ count: 0 });
  });

  it('keeps repeat events and filters histories with the requested date ordering', () => {
    const encounter = createEncounter({
      patientId: input.patientId,
      encounterDate: '2026-09-03T08:00:00.000Z',
    });
    const otherPatient = createPatient({ ...patientInput, firstName: 'Other' });
    jest.spyOn(Date.prototype, 'toISOString')
      .mockReturnValueOnce('2026-09-03T10:00:00.000Z')
      .mockReturnValueOnce('2026-09-03T11:00:00.000Z')
      .mockReturnValueOnce('2026-09-03T12:00:00.000Z');

    const earlierCreated = createImmunization({ ...input, encounterId: encounter.id });
    const laterCreated = createImmunization({ ...input, encounterId: encounter.id });
    const earlierAdministered = createImmunization({
      ...input, encounterId: encounter.id, administeredDate: '2026-09-02T08:00:00.000Z',
    });
    const undated = createImmunization({ ...input, encounterId: encounter.id, administeredDate: undefined });
    const otherVaccine = createImmunization({ ...input, vaccineCode: 'TEST-OTHER', administeredDate: '2026-09-01T08:00:00.000Z' });
    createImmunization({ ...input, patientId: otherPatient.id });

    expect(findImmunizationsByPatientId(input.patientId)).toEqual([
      laterCreated, earlierCreated, earlierAdministered, otherVaccine, undated,
    ]);
    expect(findImmunizationsByEncounterId(encounter.id)).toEqual([
      undated, earlierAdministered, earlierCreated, laterCreated,
    ]);
    expect(findImmunizationsByPatientAndVaccine(input.patientId, ' bcg ')).toEqual([
      undated, earlierAdministered, earlierCreated, laterCreated,
    ]);
  });

  it('uses both source identifiers and preserves their uniqueness constraint', () => {
    const first = createImmunization({ ...input, sourceSystem: 'source-a', sourceRecordId: '1' });
    const second = createImmunization({ ...input, sourceSystem: 'source-b', sourceRecordId: '1' });

    expect(findImmunizationBySourceRecord('source-a', '1')).toEqual(first);
    expect(findImmunizationBySourceRecord('source-b', '1')).toEqual(second);
    expect(() => createImmunization({ ...input, sourceSystem: ' source-a ', sourceRecordId: ' 1 ' }))
      .toThrow(/UNIQUE constraint failed/);
    expect(findImmunizationById(first.id)).toEqual(first);
    expect(findImmunizationsByPatientId(input.patientId)).toHaveLength(2);
  });

  it('returns undefined or empty histories when there is no match', () => {
    createImmunization(input);

    expect(findImmunizationById('missing')).toBeUndefined();
    expect(findImmunizationBySourceRecord('missing', 'missing')).toBeUndefined();
    expect(findImmunizationsByPatientId('missing')).toEqual([]);
    expect(findImmunizationsByEncounterId('missing')).toEqual([]);
    expect(findImmunizationsByPatientAndVaccine(input.patientId, 'missing')).toEqual([]);
  });
});
