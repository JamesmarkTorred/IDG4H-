import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import request from 'supertest';

import app from '../app';
import { db } from '../db/connection';
import * as importRepository from '../db/importRepository';
import * as patientImportService from '../import/patientImportService';
import { maxImportUploadBytes } from '../middleware/upload';
import { permissionKeys } from '../auth/permissions';
import { createAuthenticatedAgent } from './authTestHelpers';

const csvFixture = fs.readFileSync(path.resolve(
  __dirname,
  '../../test-fixtures/synthetic-patient-import.csv'
));
const xlsxFixture = fs.readFileSync(path.resolve(
  __dirname,
  '../../test-fixtures/synthetic-patient-import.xlsx'
));
const header =
  'source_record_id,last_name,first_name,birth_date,sex,barangay,municipality_city';

describe('Edge patient import REST API', () => {
  let api: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    api = await createAuthenticatedAgent(app, permissionKeys);
  });

  beforeEach(() => {
    db.exec(`
      DELETE FROM import_jobs;
      DELETE FROM outbox;
      DELETE FROM patients;
    `);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    db.close();
  });

  function upload(
    contents: Buffer | string,
    fileName: string,
    mapper = 'synthetic-patient',
    sourceSystem = 'iClinicSys-synthetic',
    contentType?: string
  ) {
    return api
      .post('/api/imports/patients')
      .field('mapper', mapper)
      .field('sourceSystem', sourceSystem)
      .attach('file', typeof contents === 'string'
        ? Buffer.from(contents, 'utf8')
        : contents, {
        filename: fileName,
        ...(contentType ? { contentType } : {}),
      });
  }

  test('CSV upload returns 201 with a completed job', async () => {
    const response = await upload(csvFixture, 'synthetic-patients.csv');

    expect(response.status).toBe(201);
    expect(response.body.job).toMatchObject({
      fileName: 'synthetic-patients.csv',
      fileType: 'csv',
      sourceSystem: 'iClinicSys-synthetic',
      status: 'completed',
      totalRows: 2,
      importedRows: 2,
      candidateRows: 0,
      failedRows: 0,
    });
  });

  test('XLSX upload returns 201 without relying on its MIME type', async () => {
    const response = await upload(
      xlsxFixture,
      'synthetic-patients.xlsx',
      'synthetic-patient',
      'synthetic-xlsx',
      'text/plain'
    );

    expect(response.status).toBe(201);
    expect(response.body.job).toMatchObject({
      fileType: 'xlsx',
      sourceSystem: 'synthetic-xlsx',
      status: 'completed',
      totalRows: 2,
      importedRows: 2,
      candidateRows: 0,
      failedRows: 0,
    });
  });

  test('an upload creates patients, outbox operations, and row audit records', async () => {
    const response = await upload(csvFixture, 'synthetic-patients.csv');
    const jobId = response.body.job.id as string;

    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as {
      count: number;
    }).count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as {
      count: number;
    }).count).toBe(2);
    expect(importRepository.findImportRowsByJobId(jobId)).toHaveLength(2);
    expect(importRepository.findImportRowsByJobId(jobId).every(
      row => row.status === 'imported' && row.localEntityId !== undefined
    )).toBe(true);
  });

  test('a mixed file completes with visible issue accounting', async () => {
    const mixedCsv = [
      header,
      'API-MIXED-001,Valid,Patient,1990-01-01,female,Baan 3,Butuan City',
      'API-MIXED-002,Invalid,Patient,2025-02-30,male,Baan 3,Butuan City',
    ].join('\n');
    const response = await upload(mixedCsv, 'mixed.csv');

    expect(response.status).toBe(201);
    expect(response.body.job).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 2,
      importedRows: 1,
      candidateRows: 0,
      failedRows: 1,
    });
    expect(importRepository.findImportRowsByJobId(response.body.job.id)
      .map(row => row.status)).toEqual(['imported', 'rejected']);
  });

  test('duplicate source rows become candidates without duplicate patients', async () => {
    const duplicateCsv = [
      header,
      'API-DUP-001,Duplicate,Patient,1990-01-01,unknown,Baan 3,Butuan City',
      'API-DUP-001,Changed,Identity,1980-01-01,other,Libertad,Butuan City',
    ].join('\n');
    const response = await upload(duplicateCsv, 'duplicates.csv');

    expect(response.status).toBe(201);
    expect(response.body.job).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 2,
      importedRows: 1,
      candidateRows: 1,
      failedRows: 0,
    });
    expect(importRepository.findImportRowsByJobId(response.body.job.id)
      .map(row => row.status)).toEqual(['imported', 'candidate']);
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as {
      count: number;
    }).count).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as {
      count: number;
    }).count).toBe(1);
  });

  test('invalid CSV returns a controlled error and retains its failed audit job', async () => {
    const response = await upload(
      'last_name,first_name\n"unterminated',
      'invalid.csv'
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'IMPORT_FAILED',
      message: 'The uploaded file could not be imported.',
      details: { jobId: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('Quote Not Closed');
    expect(importRepository.findImportJobById(
      response.body.error.details.jobId
    )?.status).toBe('failed');
  });

  test('invalid XLSX returns a controlled error and retains its failed audit job', async () => {
    const invalidWorkbook = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
    ]);
    const response = await upload(invalidWorkbook, 'invalid.xlsx');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'IMPORT_FAILED',
      details: { jobId: expect.any(String) },
    });
    expect(importRepository.findImportJobById(
      response.body.error.details.jobId
    )?.status).toBe('failed');
  });

  test('unsupported extension returns 400 before creating a job', async () => {
    const response = await upload(csvFixture, 'patients.txt');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((db.prepare('SELECT COUNT(*) AS count FROM import_jobs').get() as {
      count: number;
    }).count).toBe(0);
  });

  test('missing file returns 400', async () => {
    const response = await api
      .post('/api/imports/patients')
      .field('mapper', 'synthetic-patient')
      .field('sourceSystem', 'iClinicSys-synthetic');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('FILE_REQUIRED');
  });

  test('empty file returns 400', async () => {
    const response = await upload(Buffer.alloc(0), 'empty.csv');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('EMPTY_FILE');
  });

  test('multiple files are rejected', async () => {
    const response = await api
      .post('/api/imports/patients')
      .field('mapper', 'synthetic-patient')
      .field('sourceSystem', 'iClinicSys-synthetic')
      .attach('file', csvFixture, { filename: 'one.csv' })
      .attach('file', csvFixture, { filename: 'two.csv' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_FILE_COUNT');
  });

  test('oversized file is rejected with 413', async () => {
    const oversized = Buffer.alloc(maxImportUploadBytes + 1, 0x61);
    const response = await upload(oversized, 'oversized.csv');

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    expect((db.prepare('SELECT COUNT(*) AS count FROM import_jobs').get() as {
      count: number;
    }).count).toBe(0);
  });

  test('unknown mapper is rejected', async () => {
    const response = await upload(
      csvFixture,
      'patients.csv',
      'iclinicsys-patient'
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('an unverified official source label is rejected', async () => {
    const response = await upload(
      csvFixture,
      'patients.csv',
      'synthetic-patient',
      'iClinicSys'
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain(
      'explicitly synthetic source system'
    );
  });

  test('GET import returns job status and counters', async () => {
    const imported = await upload(csvFixture, 'patients.csv');
    const response = await api.get(
      `/api/imports/${imported.body.job.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.job).toEqual(imported.body.job);
  });

  test('GET missing import returns 404', async () => {
    const id = randomUUID();
    const response = await api.get(`/api/imports/${id}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'IMPORT_NOT_FOUND',
      message: `Import job ${id} was not found.`,
    });
  });

  test('GET import rows returns physical row order and retained raw data', async () => {
    const csv = [
      header,
      'API-ROWS-001,First,Patient,1990-01-01,female,Baan 3,Butuan City',
      '',
      'API-ROWS-002,Second,Patient,invalid,unknown,Baan 3,Butuan City',
    ].join('\n');
    const imported = await upload(csv, 'rows.csv');
    const response = await api.get(
      `/api/imports/${imported.body.job.id}/rows`
    );

    expect(response.status).toBe(200);
    expect(response.body.rows.map((row: {
      rowNumber: number;
      status: string;
      rawData: { source_record_id: string };
    }) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      sourceRecordId: row.rawData.source_record_id,
    }))).toEqual([
      { rowNumber: 2, status: 'imported', sourceRecordId: 'API-ROWS-001' },
      { rowNumber: 4, status: 'rejected', sourceRecordId: 'API-ROWS-002' },
    ]);
  });

  test('unexpected import failures return a sanitized 500', async () => {
    jest.spyOn(patientImportService, 'importPatientsFromCsv')
      .mockImplementationOnce(() => {
        throw new Error('secret import database failure');
      });
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await upload(csvFixture, 'patients.csv');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'secret import database failure'
    );
    log.mockRestore();
  });
});
