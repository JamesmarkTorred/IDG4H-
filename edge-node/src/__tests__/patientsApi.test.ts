import { randomUUID } from 'node:crypto';

import request from 'supertest';

import app from '../app';
import { db } from '../db/connection';
import * as patientRepository from '../db/patientRepository';

const validPatient = {
  sourceSystem: 'api-test',
  sourceRecordId: 'API-001',
  lastName: 'Santos',
  firstName: 'Maria',
  birthDate: '1990-01-01',
  sex: 'female',
};

describe('Edge patient REST API', () => {
  beforeEach(() => {
    db.exec('DELETE FROM outbox; DELETE FROM patients;');
  });

  afterAll(() => {
    db.close();
  });

  async function createPatient(
    overrides: Record<string, unknown> = {}
  ) {
    return request(app)
      .post('/api/patients')
      .send({
        ...validPatient,
        sourceRecordId: randomUUID(),
        ...overrides,
      });
  }

  test('valid POST returns 201 and the configured patient record', async () => {
    const response = await createPatient();

    expect(response.status).toBe(201);
    expect(response.body.patient).toMatchObject({
      lastName: 'Santos',
      firstName: 'Maria',
      birthDate: '1990-01-01',
      sex: 'female',
      version: 1,
    });
    expect(response.body.patient.id).toEqual(expect.any(String));
    expect(response.body.patient.nodeId).toEqual(expect.any(String));
  });

  test('POST atomically creates a patient and create outbox operation', async () => {
    const response = await createPatient();
    const patientId = response.body.patient.id as string;

    expect((db.prepare(
      'SELECT COUNT(*) AS count FROM patients WHERE id = ?'
    ).get(patientId) as { count: number }).count).toBe(1);
    const operation = db.prepare(`
      SELECT entity_id, operation_type, payload
      FROM outbox
      WHERE entity_id = ?
    `).get(patientId) as {
      entity_id: string;
      operation_type: string;
      payload: string;
    };
    expect(operation).toMatchObject({
      entity_id: patientId,
      operation_type: 'create',
    });
    expect(JSON.parse(operation.payload)).toEqual(response.body.patient);
  });

  test('missing required fields return a structured 400', async () => {
    const response = await request(app).post('/api/patients').send({
      firstName: 'Maria',
      birthDate: '1990-01-01',
      sex: 'female',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'lastName' }),
      ])
    );
  });

  test('invalid birth date returns 400', async () => {
    const response = await createPatient({ birthDate: '2025-02-30' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).toContain('valid calendar date');
  });

  test('invalid sex returns 400', async () => {
    const response = await createPatient({ sex: 'invalid' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('unknown patient fields are deliberately rejected', async () => {
    const response = await createPatient({ nodeId: 'caller-controlled-node' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as {
      count: number;
    }).count).toBe(0);
  });

  test('an existing strong identity returns 409 without creating a duplicate', async () => {
    const first = await request(app).post('/api/patients').send(validPatient);
    const duplicate = await request(app).post('/api/patients').send({
      ...validPatient,
      lastName: 'Different',
      firstName: 'Name',
      birthDate: '1985-05-20',
    });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({
      code: 'IDENTITY_CONFLICT',
      details: {
        candidates: [
          expect.objectContaining({
            reason: 'source-record',
            confidence: 'strong',
          }),
        ],
      },
    });
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as {
      count: number;
    }).count).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as {
      count: number;
    }).count).toBe(1);
  });

  test('GET returns an existing patient', async () => {
    const created = await createPatient();
    const response = await request(app).get(
      `/api/patients/${created.body.patient.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.patient).toEqual(created.body.patient);
  });

  test('GET returns 404 for a missing patient', async () => {
    const id = randomUUID();
    const response = await request(app).get(`/api/patients/${id}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'PATIENT_NOT_FOUND',
        message: `Patient ${id} was not found.`,
      },
    });
  });

  test('search returns exact demographic matches', async () => {
    const created = await createPatient();
    const response = await request(app)
      .get('/api/patients/search')
      .query({
        lastName: ' santos ',
        firstName: ' MARIA ',
        birthDate: '1990-01-01',
      });

    expect(response.status).toBe(200);
    expect(response.body.patients).toEqual([created.body.patient]);
  });

  test('invalid search parameters return 400', async () => {
    const response = await request(app)
      .get('/api/patients/search')
      .query({ lastName: 'Santos', firstName: 'Maria' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('valid PATCH updates v1 to v2 and creates an update outbox operation', async () => {
    const created = await createPatient();
    const patientId = created.body.patient.id as string;
    const response = await request(app)
      .patch(`/api/patients/${patientId}`)
      .send({
        expectedVersion: 1,
        contactNumber: '09123456789',
      });

    expect(response.status).toBe(200);
    expect(response.body.patient).toMatchObject({
      id: patientId,
      version: 2,
      contactNumber: '09123456789',
    });
    const operations = db.prepare(`
      SELECT operation_type, payload
      FROM outbox
      WHERE entity_id = ?
      ORDER BY rowid
    `).all(patientId) as Array<{
      operation_type: string;
      payload: string;
    }>;
    expect(operations.map(operation => operation.operation_type)).toEqual([
      'create',
      'update',
    ]);
    expect(JSON.parse(operations[1].payload)).toEqual(response.body.patient);
  });

  test('stale PATCH returns 409 and changes neither patient nor outbox', async () => {
    const created = await createPatient();
    const patientId = created.body.patient.id as string;
    const current = await request(app)
      .patch(`/api/patients/${patientId}`)
      .send({ expectedVersion: 1, contactNumber: '111' });
    const beforeOutbox = (db.prepare(
      'SELECT COUNT(*) AS count FROM outbox WHERE entity_id = ?'
    ).get(patientId) as { count: number }).count;

    const stale = await request(app)
      .patch(`/api/patients/${patientId}`)
      .send({ expectedVersion: 1, contactNumber: '222' });

    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: {
        patientId,
        expectedVersion: 1,
        currentVersion: 2,
      },
    });
    expect(patientRepository.findPatientById(patientId)).toEqual(
      current.body.patient
    );
    expect((db.prepare(
      'SELECT COUNT(*) AS count FROM outbox WHERE entity_id = ?'
    ).get(patientId) as { count: number }).count).toBe(beforeOutbox);
  });

  test('PATCH returns 404 for a missing patient', async () => {
    const id = randomUUID();
    const response = await request(app)
      .patch(`/api/patients/${id}`)
      .send({ expectedVersion: 1, contactNumber: '111' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  test('malformed JSON returns a controlled 400', async () => {
    const response = await request(app)
      .post('/api/patients')
      .set('Content-Type', 'application/json')
      .send('{"lastName":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    });
  });

  test('unexpected failures return a sanitized 500', async () => {
    const id = randomUUID();
    const repositoryError = jest
      .spyOn(patientRepository, 'findPatientById')
      .mockImplementationOnce(() => {
        throw new Error('secret SQLite failure');
      });
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await request(app).get(`/api/patients/${id}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected server error occurred.',
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('secret SQLite failure');
    } finally {
      repositoryError.mockRestore();
      log.mockRestore();
    }
  });
});
