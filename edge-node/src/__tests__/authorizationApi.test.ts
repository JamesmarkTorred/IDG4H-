import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import request from 'supertest';

import app from '../app';
import type { PermissionKey } from '../auth/permissions';
import { db } from '../db/connection';
import { createPatient } from '../db/patientRepository';
import { createAuthenticatedAgent } from './authTestHelpers';

const patientInput = {
  lastName: 'Permission',
  firstName: 'Patient',
  birthDate: '1990-01-01',
  sex: 'unknown' as const,
};

async function agentWith(permissions: PermissionKey[]) {
  return createAuthenticatedAgent(app, permissions);
}

describe('Edge route authorization', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM import_jobs;
      DELETE FROM outbox;
      DELETE FROM immunizations;
      DELETE FROM observations;
      DELETE FROM encounters;
      DELETE FROM patients;
    `);
  });

  afterAll(() => {
    db.close();
  });

  test('all health-record write routes require authentication', async () => {
    const patient = createPatient(patientInput);
    const responses = await Promise.all([
      request(app).post('/api/patients').send(patientInput),
      request(app).patch(`/api/patients/${patient.id}`).send({
        expectedVersion: 1,
        contactNumber: '09123456789',
      }),
      request(app)
        .post(`/api/patients/${patient.id}/encounters`)
        .send({ encounterDate: '2026-09-04T10:00:00.000Z' }),
      request(app).post('/api/imports/patients'),
    ]);

    expect(responses.map(response => response.status)).toEqual([
      401, 401, 401, 401,
    ]);
    expect(responses.every(
      response => response.body.error.code === 'AUTHENTICATION_REQUIRED'
    )).toBe(true);
    expect((db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as {
      count: number;
    }).count).toBe(0);
  });

  test('all health-record read routes require authentication', async () => {
    const id = randomUUID();
    const responses = await Promise.all([
      request(app).get(`/api/patients/${id}`),
      request(app).get('/api/patients/search'),
      request(app).get(`/api/patients/${id}/encounters`),
      request(app).get(`/api/encounters/${id}`),
      request(app).get(`/api/imports/${id}`),
      request(app).get(`/api/imports/${id}/rows`),
    ]);

    expect(responses.every(response => response.status === 401)).toBe(true);
  });

  test('patient read permission allows reads but not writes', async () => {
    const patient = createPatient(patientInput);
    const agent = await agentWith(['patients:read']);
    const read = await agent.get(`/api/patients/${patient.id}`);
    const write = await agent.post('/api/patients').send({
      ...patientInput,
      lastName: 'Forbidden',
    });

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(write.body.error.code).toBe('FORBIDDEN');
  });

  test('encounter permission does not imply import permission', async () => {
    const patient = createPatient(patientInput);
    const agent = await agentWith(['encounters:write']);
    const encounter = await agent
      .post(`/api/patients/${patient.id}/encounters`)
      .send({ encounterDate: '2026-09-04T10:00:00.000Z' });
    const importAttempt = await agent
      .post('/api/imports/patients')
      .field('mapper', 'synthetic-patient')
      .field('sourceSystem', 'synthetic-test');

    expect(encounter.status).toBe(201);
    expect(importAttempt.status).toBe(403);
  });

  test('import write permission works independently', async () => {
    const agent = await agentWith(['imports:write']);
    const fixture = fs.readFileSync(path.resolve(
      __dirname,
      '../../test-fixtures/synthetic-patient-import.csv'
    ));
    const response = await agent
      .post('/api/imports/patients')
      .field('mapper', 'synthetic-patient')
      .field('sourceSystem', 'synthetic-rbac')
      .attach('file', fixture, { filename: 'synthetic.csv' });

    expect(response.status).toBe(201);
    expect(response.body.job.importedRows).toBe(2);
  });

  test('import read permission allows audit reads but not uploads', async () => {
    const writer = await agentWith(['imports:write']);
    const fixture = fs.readFileSync(path.resolve(
      __dirname,
      '../../test-fixtures/synthetic-patient-import.csv'
    ));
    const imported = await writer
      .post('/api/imports/patients')
      .field('mapper', 'synthetic-patient')
      .field('sourceSystem', 'synthetic-read-test')
      .attach('file', fixture, { filename: 'synthetic.csv' });
    const reader = await agentWith(['imports:read']);
    const read = await reader.get(`/api/imports/${imported.body.job.id}`);
    const upload = await reader
      .post('/api/imports/patients')
      .field('mapper', 'synthetic-patient')
      .field('sourceSystem', 'synthetic-forbidden');

    expect(read.status).toBe(200);
    expect(upload.status).toBe(403);
  });

  test('encounter read permission protects both encounter read routes', async () => {
    const patient = createPatient(patientInput);
    const writer = await agentWith(['encounters:write']);
    const created = await writer
      .post(`/api/patients/${patient.id}/encounters`)
      .send({ encounterDate: '2026-09-04T10:00:00.000Z' });
    const reader = await agentWith(['encounters:read']);

    expect((await reader.get(
      `/api/patients/${patient.id}/encounters`
    )).status).toBe(200);
    expect((await reader.get(
      `/api/encounters/${created.body.encounter.id}`
    )).status).toBe(200);
  });
});
