import { db, initSchema } from '../db/connection';
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
    expect(job.startedAt).toBe(new Date(job.startedAt).toISOString());
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
      rawData: { name: 'Imported Patient' },
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
      rawData: { name: 'Possible Existing Patient' },
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
      rawData: { birthDate: 'invalid' },
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
      nested: { values: [1, true, null, 'text'] },
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
    expect(result.createdAt).toBe(new Date(result.createdAt).toISOString());
    expect(findImportRowsByJobId(job.id)).toEqual([result]);
  });

  test('totalRows equals imported, candidate, and failed counters', () => {
    const job = createJob();
    const statuses = ['imported', 'candidate', 'rejected'] as const;

    statuses.forEach((status, index) => {
      recordImportRowResult({
        importJobId: job.id,
        rowNumber: index + 2,
        status,
        rawData: { status },
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
      counted.importedRows + counted.candidateRows + counted.failedRows
    );
    expect(findImportRowsByJobId(job.id).map(row => row.rowNumber)).toEqual([
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
      new Date(completed.completedAt!).toISOString()
    );
  });

  test.each(['candidate', 'rejected'] as const)(
    'a job containing a %s row becomes completed_with_issues',
    (status) => {
      const job = createJob();
      recordImportRowResult({
        importJobId: job.id,
        rowNumber: 2,
        status,
        rawData: {},
      });

      expect(completeImportJob(job.id).status).toBe(
        'completed_with_issues'
      );
    }
  );

  test('a fatal import job becomes failed with its error', () => {
    const job = createJob();

    const failed = failImportJob(job.id, 'Synthetic file read failure.');

    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Synthetic file read failure.');
    expect(failed.completedAt).toBe(new Date(failed.completedAt!).toISOString());
  });

  test('deleting a job cascades to its row results', () => {
    const job = createJob();
    recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'imported',
      rawData: {},
    });
    expect(findImportRowsByJobId(job.id)).toHaveLength(1);

    db.prepare('DELETE FROM import_jobs WHERE id = ?').run(job.id);

    expect(findImportRowsByJobId(job.id)).toEqual([]);
  });

  test('row and counter writes roll back when the job is no longer processing', () => {
    const job = completeImportJob(createJob().id);

    expect(() => recordImportRowResult({
      importJobId: job.id,
      rowNumber: 2,
      status: 'imported',
      rawData: {},
    })).toThrow(/not processing/);

    expect(findImportRowsByJobId(job.id)).toEqual([]);
    expect(findImportJobById(job.id)).toMatchObject({
      totalRows: 0,
      importedRows: 0,
      candidateRows: 0,
      failedRows: 0,
    });
  });

  test('migrates legacy import accounting without losing row audit data', () => {
    db.exec(`
      DROP TABLE import_row_results;
      DROP TABLE import_jobs;

      CREATE TABLE import_jobs (
        id TEXT PRIMARY KEY,
        source_system TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
        status TEXT NOT NULL CHECK (
          status IN ('processing', 'completed', 'completed_with_errors', 'failed')
        ),
        total_rows INTEGER NOT NULL DEFAULT 0,
        successful_rows INTEGER NOT NULL DEFAULT 0,
        failed_rows INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT
      );

      CREATE TABLE import_row_results (
        id TEXT PRIMARY KEY,
        import_job_id TEXT NOT NULL,
        row_number INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('imported', 'candidate', 'rejected')),
        source_record_id TEXT,
        entity_type TEXT,
        local_entity_id TEXT,
        raw_data TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
      );

      INSERT INTO import_jobs (
        id, source_system, file_name, file_type, status,
        total_rows, successful_rows, failed_rows, started_at, completed_at
      ) VALUES (
        'legacy-job', 'iClinicSys', 'legacy.csv', 'csv',
        'completed_with_errors', 3, 1, 1,
        '2026-09-04T00:00:00.000Z', '2026-09-04T00:01:00.000Z'
      );

      INSERT INTO import_row_results (
        id, import_job_id, row_number, status, raw_data, created_at
      ) VALUES
        ('legacy-imported', 'legacy-job', 2, 'imported', '{"value":1}', '2026-09-04T00:00:01.000Z'),
        ('legacy-candidate', 'legacy-job', 3, 'candidate', '{"value":2}', '2026-09-04T00:00:02.000Z'),
        ('legacy-rejected', 'legacy-job', 4, 'rejected', '{"value":3}', '2026-09-04T00:00:03.000Z');
    `);

    initSchema();

    expect(findImportJobById('legacy-job')).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 3,
      importedRows: 1,
      candidateRows: 1,
      failedRows: 1,
    });
    expect(findImportRowsByJobId('legacy-job').map(row => row.rawData)).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
    expect(db.pragma('foreign_key_check')).toEqual([]);

    db.prepare('DELETE FROM import_jobs WHERE id = ?').run('legacy-job');
    expect(findImportRowsByJobId('legacy-job')).toEqual([]);
  });
});
