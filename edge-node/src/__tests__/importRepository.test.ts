import { db } from '../db/connection';

import {
  completeImportJob,
  createImportJob,
  failImportJob,
  findImportJobById,
  findImportRowsByJobId,
  recordImportRowResult,
} from '../db/importRepository';

describe('importRepository', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM import_jobs').run();
  });

  afterAll(() => {
    db.close();
  });

  function createJob() {
    return createImportJob({
      sourceSystem: ' iClinicSys ',
      fileName: ' synthetic-patients.csv ',
      fileType: 'csv',
    });
  }

  test('creates a processing job with zero counters', () => {
    const job = createJob();

    expect(job).toMatchObject({
      sourceSystem: 'iClinicSys',
      fileName: 'synthetic-patients.csv',
      fileType: 'csv',
      status: 'processing',
      totalRows: 0,
      importedRows: 0,
      candidateRows: 0,
      failedRows: 0,
    });

    expect(job.startedAt).toBe(
      new Date(job.startedAt).toISOString()
    );

    expect(job.completedAt).toBeUndefined();
    expect(job.errorMessage).toBeUndefined();

    expect(findImportJobById(job.id)).toEqual(job);
  });

  test('an imported row increments importedRows', () => {
    const job = createJob();

    recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'imported',
      localEntityId: 'patient-1',
      rawData: {
        name: 'Imported Patient',
      },
    });

    expect(findImportJobById(job.id)).toMatchObject({
      totalRows: 1,
      importedRows: 1,
      candidateRows: 0,
      failedRows: 0,
    });
  });

  test('a candidate row increments candidateRows', () => {
    const job = createJob();

    recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'candidate',
      rawData: {
        name: 'Possible Existing Patient',
      },
    });

    expect(findImportJobById(job.id)).toMatchObject({
      totalRows: 1,
      importedRows: 0,
      candidateRows: 1,
      failedRows: 0,
    });
  });

  test('a rejected row increments failedRows', () => {
    const job = createJob();

    recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'rejected',
      rawData: {
        birthDate: 'invalid',
      },
      errorMessage: 'Invalid birth date.',
    });

    expect(findImportJobById(job.id)).toMatchObject({
      totalRows: 1,
      importedRows: 0,
      candidateRows: 0,
      failedRows: 1,
    });
  });

  test('raw data and optional audit fields survive the JSON round trip', () => {
    const job = createJob();

    const rawData = {
      record: 'SRC-001',
      nested: {
        values: [1, true, null, 'text'],
      },
    };

    const result = recordImportRowResult({
      importJobId: job.id,
      rowNumber: 7,
      status: 'candidate',
      sourceRecordId: 'SRC-001',
      entityType: 'patient',
      localEntityId: 'existing-patient',
      rawData,
      errorMessage: 'Identity review required.',
    });

    expect(result).toMatchObject({
      importJobId: job.id,
      rowNumber: 7,
      status: 'candidate',
      sourceRecordId: 'SRC-001',
      entityType: 'patient',
      localEntityId: 'existing-patient',
      rawData,
      errorMessage: 'Identity review required.',
    });

    expect(result.createdAt).toBe(
      new Date(result.createdAt).toISOString()
    );

    expect(findImportRowsByJobId(job.id)).toEqual([
      result,
    ]);
  });

  test('totalRows equals imported, candidate, and failed counters', () => {
    const job = createJob();

    const statuses = [
      'imported',
      'candidate',
      'rejected',
    ] as const;

    statuses.forEach((status, index) => {
      recordImportRowResult({
        importJobId: job.id,
        rowNumber: index + 2,
        status,
        rawData: {
          status,
        },
      });
    });

    const counted = findImportJobById(job.id)!;

    expect(counted).toMatchObject({
      totalRows: 3,
      importedRows: 1,
      candidateRows: 1,
      failedRows: 1,
    });

    expect(counted.totalRows).toBe(
      counted.importedRows +
        counted.candidateRows +
        counted.failedRows
    );

    expect(
      findImportRowsByJobId(job.id).map(
        (row) => row.rowNumber
      )
    ).toEqual([
      2,
      3,
      4,
    ]);
  });

  test('a clean job becomes completed', () => {
    const job = createJob();

    recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'imported',
      rawData: {},
    });

    const completed = completeImportJob(job.id);

    expect(completed.status).toBe('completed');

    expect(completed.completedAt).toBe(
      new Date(
        completed.completedAt!
      ).toISOString()
    );
  });

  test.each([
    'candidate',
    'rejected',
  ] as const)(
    'a job containing a %s row becomes completed_with_issues',
    (status) => {
      const job = createJob();

      recordImportRowResult({
        importJobId: job.id,
        rowNumber: 2,
        status,
        rawData: {},
      });

      expect(
        completeImportJob(job.id).status
      ).toBe('completed_with_issues');
    }
  );

  test('a fatal import job becomes failed with its error', () => {
    const job = createJob();

    const failed = failImportJob(
      job.id,
      'Synthetic file read failure.'
    );

    expect(failed.status).toBe('failed');

    expect(failed.errorMessage).toBe(
      'Synthetic file read failure.'
    );

    expect(failed.completedAt).toBe(
      new Date(
        failed.completedAt!
      ).toISOString()
    );
  });

  test('deleting a job cascades to its row results', () => {
    const job = createJob();

    recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'imported',
      rawData: {},
    });

    expect(
      findImportRowsByJobId(job.id)
    ).toHaveLength(1);

    db.prepare(
      'DELETE FROM import_jobs WHERE id = ?'
    ).run(job.id);

    expect(
      findImportRowsByJobId(job.id)
    ).toEqual([]);
  });

  test('row and counter writes roll back when the job is no longer processing', () => {
    const job = completeImportJob(
      createJob().id
    );

    expect(() =>
      recordImportRowResult({
        importJobId: job.id,
        rowNumber: 2,
        status: 'imported',
        rawData: {},
      })
    ).toThrow(/not processing/);

    expect(
      findImportRowsByJobId(job.id)
    ).toEqual([]);

    expect(
      findImportJobById(job.id)
    ).toMatchObject({
      totalRows: 0,
      importedRows: 0,
      candidateRows: 0,
      failedRows: 0,
    });
  });
});