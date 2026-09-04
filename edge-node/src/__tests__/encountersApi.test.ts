import { randomUUID } from 'node:crypto';

import request from 'supertest';

import app from '../app';
import { db } from '../db/connection';
import * as encounterRepository from '../db/encounterRepository';
import { createPatient } from '../db/patientRepository';
import type { Patient } from '../domain';

const encounterDate = '2026-09-04T09:30:00.000Z';
const observedAt = '2026-09-04T09:35:00.000Z';

describe('Edge clinical encounter REST API', () => {
  let patient: Patient;

  beforeEach(() => {
    db.exec(`
      DROP TRIGGER IF EXISTS reject_api_immunization;
      DELETE FROM outbox;
      DELETE FROM immunizations;
      DELETE FROM observations;
      DELETE FROM encounters;
      DELETE FROM patients;
    `);
    patient = createPatient({
      lastName: 'Encounter',
      firstName: 'Patient',
      birthDate: '1990-01-01',
      sex: 'unknown',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    db.close();
  });

  function postEncounter(body: Record<string, unknown>) {
    return request(app)
      .post(`/api/patients/${patient.id}/encounters`)
      .send(body);
  }

  test('valid encounter-only request returns 201', async () => {
    const response = await postEncounter({
      encounterDate,
      encounterType: 'consultation',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      encounter: {
        patientId: patient.id,
        encounterDate,
        encounterType: 'consultation',
        version: 1,
      },
      observations: [],
      immunizations: [],
    });
    expect(response.body.encounter.nodeId).toBe(patient.nodeId);
  });

  test('encounter with an observation returns 201', async () => {
    const response = await postEncounter({
      encounterDate,
      observations: [
        {
          code: 'blood-pressure-systolic',
          valueNumeric: 120,
          unit: 'mmHg',
          observedAt,
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.observations).toHaveLength(1);
    expect(response.body.observations[0]).toMatchObject({
      patientId: patient.id,
      encounterId: response.body.encounter.id,
      code: 'blood-pressure-systolic',
      valueNumeric: 120,
    });
  });

  test('encounter with an immunization returns 201', async () => {
    const response = await postEncounter({
      encounterDate,
      immunizations: [
        {
          vaccineCode: 'BCG',
          vaccineName: 'BCG',
          administeredDate: '2026-09-04T09:40:00.000Z',
          status: 'completed',
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.immunizations).toHaveLength(1);
    expect(response.body.immunizations[0]).toMatchObject({
      patientId: patient.id,
      encounterId: response.body.encounter.id,
      vaccineCode: 'BCG',
      status: 'completed',
    });
  });

  test('multiple children are committed and every domain record gets an outbox operation', async () => {
    const response = await postEncounter({
      encounterDate,
      chiefComplaint: 'Headache',
      observations: [
        {
          code: 'blood-pressure-systolic',
          valueNumeric: 120,
          unit: 'mmHg',
          observedAt,
        },
        {
          code: 'clinical-note',
          valueText: 'Patient stable',
          observedAt: '2026-09-04T09:36:00.000Z',
        },
      ],
      immunizations: [
        {
          vaccineCode: 'BCG',
          administeredDate: '2026-09-04T09:40:00.000Z',
        },
        {
          vaccineCode: 'HEP-B',
          status: 'not-done',
          remarks: 'Deferred',
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.observations).toHaveLength(2);
    expect(response.body.immunizations).toHaveLength(2);
    expect((db.prepare('SELECT COUNT(*) AS count FROM encounters').get() as {
      count: number;
    }).count).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS count FROM observations').get() as {
      count: number;
    }).count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) AS count FROM immunizations').get() as {
      count: number;
    }).count).toBe(2);

    const operations = db.prepare(`
      SELECT entity_type, entity_id, operation_type, payload
      FROM outbox
      ORDER BY rowid
    `).all() as Array<{
      entity_type: string;
      entity_id: string;
      operation_type: string;
      payload: string;
    }>;
    expect(operations.map(operation => operation.entity_type)).toEqual([
      'encounter',
      'observation',
      'observation',
      'immunization',
      'immunization',
    ]);
    expect(operations.every(operation => operation.operation_type === 'create'))
      .toBe(true);
    expect(operations.map(operation => operation.entity_id)).toEqual([
      response.body.encounter.id,
      ...response.body.observations.map((item: { id: string }) => item.id),
      ...response.body.immunizations.map((item: { id: string }) => item.id),
    ]);
    expect(operations.map(operation => JSON.parse(operation.payload))).toEqual([
      response.body.encounter,
      ...response.body.observations,
      ...response.body.immunizations,
    ]);
  });

  test('nonexistent patient returns 404 without visit writes', async () => {
    const missingPatientId = randomUUID();
    const response = await request(app)
      .post(`/api/patients/${missingPatientId}/encounters`)
      .send({ encounterDate });

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'PATIENT_NOT_FOUND',
      message: `Patient ${missingPatientId} was not found.`,
    });
    expect((db.prepare('SELECT COUNT(*) AS count FROM encounters').get() as {
      count: number;
    }).count).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as {
      count: number;
    }).count).toBe(0);
  });

  test('missing encounter date returns 400', async () => {
    const response = await postEncounter({ encounterType: 'consultation' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'encounterDate' })])
    );
  });

  test('malformed encounter datetime returns 400', async () => {
    const response = await postEncounter({ encounterDate: 'September 4' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('observation with text and numeric values returns 400', async () => {
    const response = await postEncounter({
      encounterDate,
      observations: [
        {
          code: 'invalid',
          valueText: 'both',
          valueNumeric: 1,
          observedAt,
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain(
      'exactly one of valueText or valueNumeric'
    );
  });

  test('observation with neither value returns 400', async () => {
    const response = await postEncounter({
      encounterDate,
      observations: [{ code: 'invalid', observedAt }],
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain(
      'exactly one of valueText or valueNumeric'
    );
  });

  test('non-finite numeric observation returns 400', async () => {
    const response = await request(app)
      .post(`/api/patients/${patient.id}/encounters`)
      .set('Content-Type', 'application/json')
      .send(
        `{"encounterDate":"${encounterDate}","observations":[` +
        `{"code":"invalid","valueNumeric":1e400,"observedAt":"${observedAt}"}]}`
      );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('malformed immunization returns 400', async () => {
    const response = await postEncounter({
      encounterDate,
      immunizations: [
        { vaccineCode: 'BCG', status: 'partially-completed' },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('a child persistence failure rolls back encounter, children, and outbox', async () => {
    db.exec(`
      CREATE TRIGGER reject_api_immunization
      BEFORE INSERT ON immunizations
      BEGIN
        SELECT RAISE(ABORT, 'secret synthetic child failure');
      END;
    `);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await postEncounter({
      encounterDate,
      observations: [
        { code: 'note', valueText: 'created first', observedAt },
      ],
      immunizations: [{ vaccineCode: 'BCG' }],
    });

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected server error occurred.',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret synthetic');
    for (const table of [
      'encounters',
      'observations',
      'immunizations',
      'outbox',
    ]) {
      expect((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        count: number;
      }).count).toBe(0);
    }
    log.mockRestore();
  });

  test('unknown request and child fields are rejected', async () => {
    const response = await postEncounter({
      encounterDate,
      patientId: patient.id,
      observations: [
        { code: 'note', valueText: 'test', observedAt, nodeId: 'caller-node' },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect((db.prepare('SELECT COUNT(*) AS count FROM encounters').get() as {
      count: number;
    }).count).toBe(0);
  });

  test('unexpected internal errors return a sanitized 500', async () => {
    const encounterId = randomUUID();
    const lookup = jest
      .spyOn(encounterRepository, 'findEncounterById')
      .mockImplementationOnce(() => {
        throw new Error('secret encounter lookup failure');
      });
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get(`/api/encounters/${encounterId}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'secret encounter lookup failure'
    );
    lookup.mockRestore();
    log.mockRestore();
  });

  test('read encounter by ID returns 200', async () => {
    const created = await postEncounter({ encounterDate });
    const response = await request(app).get(
      `/api/encounters/${created.body.encounter.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.encounter).toEqual(created.body.encounter);
  });

  test('missing encounter returns 404', async () => {
    const encounterId = randomUUID();
    const response = await request(app).get(`/api/encounters/${encounterId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'ENCOUNTER_NOT_FOUND',
        message: `Encounter ${encounterId} was not found.`,
      },
    });
  });

  test('list patient encounters returns the patient history', async () => {
    const first = await postEncounter({
      encounterDate: '2026-09-03T08:00:00.000Z',
    });
    const second = await postEncounter({
      encounterDate: '2026-09-04T08:00:00.000Z',
    });

    const response = await request(app).get(
      `/api/patients/${patient.id}/encounters`
    );

    expect(response.status).toBe(200);
    expect(response.body.encounters).toEqual([
      second.body.encounter,
      first.body.encounter,
    ]);
  });
});
