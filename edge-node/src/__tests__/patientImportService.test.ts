import { db } from '../db/connection';
import {
  findImportJobById,
  findImportRowsByJobId,
} from '../db/importRepository';
import { findPatientById } from '../db/patientRepository';
import { findPendingOutbox } from '../db/outboxRepository';
import { importPatientsFromCsv } from '../import/patientImportService';
import { SyntheticPatientMapper } from '../import/syntheticPatientMapper';
import { createPatientWithOutbox } from '../services/patientWriteService';

const header =
  'source_record_id,last_name,first_name,birth_date,sex,barangay,municipality_city';

describe('patientImportService', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM import_jobs;
      DELETE FROM outbox;
      DELETE FROM patients;
    `);
  });

  afterAll(() => {
    db.close();
  });

  function importCsv(csv: string) {
    return importPatientsFromCsv({
      fileName: 'synthetic-patients.csv',
      sourceSystem: 'iClinicSys',
      csv,
      mapper: new SyntheticPatientMapper('iClinicSys-synthetic'),
    });
  }

  test('a valid row atomically creates a patient, outbox operation, and imported audit', () => {
    const job = importCsv(
      `${header}\nSYN-001,Dela Cruz,Juan,1990-01-01,male,Baan 3,Butuan City`
    );

    expect(job).toMatchObject({
      sourceSystem: 'iClinicSys',
      fileName: 'synthetic-patients.csv',
      status: 'completed',
      totalRows: 1,
      importedRows: 1,
      candidateRows: 0,
      failedRows: 0,
    });
    const [audit] = findImportRowsByJobId(job.id);
    expect(audit).toMatchObject({
      rowNumber: 2,
      status: 'imported',
      sourceRecordId: 'SYN-001',
      entityType: 'patient',
      rawData: {
        source_record_id: 'SYN-001',
        last_name: 'Dela Cruz',
        first_name: 'Juan',
        birth_date: '1990-01-01',
        sex: 'male',
        barangay: 'Baan 3',
        municipality_city: 'Butuan City',
      },
    });
    const patient = findPatientById(audit.localEntityId!);
    expect(patient).toMatchObject({
      sourceSystem: 'iClinicSys-synthetic',
      sourceRecordId: 'SYN-001',
      lastName: 'Dela Cruz',
      firstName: 'Juan',
      sex: 'male',
      barangay: 'Baan 3',
      municipalityCity: 'Butuan City',
    });
    const [operation] = findPendingOutbox();
    expect(operation).toMatchObject({
      entityType: 'patient',
      entityId: patient?.id,
      operationType: 'create',
      payload: {
        id: patient?.id,
        sourceSystem: 'iClinicSys-synthetic',
        sourceRecordId: 'SYN-001',
        lastName: 'Dela Cruz',
        firstName: 'Juan',
        birthDate: '1990-01-01',
        sex: 'male',
        nodeId: patient?.nodeId,
        version: 1,
      },
    });
  });

  test('an existing patient becomes a candidate without creating a duplicate', () => {
    const existing = createPatientWithOutbox({
      lastName: 'Santos',
      firstName: 'Maria',
      birthDate: '1995-05-15',
      sex: 'female',
    });

    const job = importCsv(
      `${header}\nSYN-002,Santos,Maria,1995-05-15,female,Libertad,Butuan City`
    );

    expect(job).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 1,
      importedRows: 0,
      candidateRows: 1,
      failedRows: 0,
    });
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number }).count).toBe(1);
    expect(findPendingOutbox()).toHaveLength(1);
    expect(findImportRowsByJobId(job.id)[0]).toMatchObject({
      status: 'candidate',
      localEntityId: existing.id,
      sourceRecordId: 'SYN-002',
      errorMessage: '1 patient candidate(s) require identity review.',
    });
  });

  test('a malformed patient is rejected and its raw row is retained', () => {
    const job = importCsv(
      `${header}\nSYN-003,Invalid,Date,2025-02-30,unknown,Ampayon,Butuan City`
    );

    expect(job).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 1,
      importedRows: 0,
      candidateRows: 0,
      failedRows: 1,
    });
    expect(findImportRowsByJobId(job.id)[0]).toMatchObject({
      rowNumber: 2,
      status: 'rejected',
      sourceRecordId: 'SYN-003',
      errorMessage: 'birth_date is not a valid calendar date.',
      rawData: expect.objectContaining({ birth_date: '2025-02-30' }),
    });
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number }).count).toBe(0);
    expect(findPendingOutbox()).toEqual([]);
  });

  test('continues after a rejected row and preserves physical CSV row numbers', () => {
    const job = importCsv(
      `${header}\nSYN-BAD,Missing,,1990-01-01,male,Baan 3,Butuan City\n\nSYN-GOOD,Valid,Patient,1991-02-03,female,Baan 3,Butuan City`
    );

    expect(job).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 2,
      importedRows: 1,
      candidateRows: 0,
      failedRows: 1,
    });
    expect(findImportRowsByJobId(job.id).map(row => ({
      rowNumber: row.rowNumber,
      status: row.status,
    }))).toEqual([
      { rowNumber: 2, status: 'rejected' },
      { rowNumber: 4, status: 'imported' },
    ]);
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number }).count).toBe(1);
    expect(findPendingOutbox()).toHaveLength(1);
  });

  test('mixed outcomes maintain the import accounting invariant', () => {
    createPatientWithOutbox({
      lastName: 'Existing',
      firstName: 'Person',
      birthDate: '1980-01-01',
      sex: 'unknown',
    });

    const job = importCsv([
      header,
      'SYN-NEW,New,Person,1990-01-01,male,Baan 3,Butuan City',
      'SYN-MATCH,Existing,Person,1980-01-01,unknown,Baan 3,Butuan City',
      'SYN-BAD,Bad,Person,not-a-date,unknown,Baan 3,Butuan City',
    ].join('\n'));

    expect(job).toMatchObject({
      status: 'completed_with_issues',
      totalRows: 3,
      importedRows: 1,
      candidateRows: 1,
      failedRows: 1,
    });
    expect(job.totalRows).toBe(
      job.importedRows + job.candidateRows + job.failedRows
    );
    expect(findImportRowsByJobId(job.id).map(row => row.status)).toEqual([
      'imported',
      'candidate',
      'rejected',
    ]);
  });

  test('an imported audit failure rolls back its patient and outbox writes', () => {
    db.exec(`
      CREATE TRIGGER reject_imported_audit
      BEFORE INSERT ON import_row_results
      WHEN NEW.status = 'imported'
      BEGIN
        SELECT RAISE(ABORT, 'Synthetic imported audit failure');
      END;
    `);

    try {
      const job = importCsv(
        `${header}\nSYN-ROLLBACK,Rollback,Patient,1990-01-01,unknown,Baan 3,Butuan City`
      );

      expect(job).toMatchObject({
        status: 'completed_with_issues',
        totalRows: 1,
        importedRows: 0,
        candidateRows: 0,
        failedRows: 1,
      });
      expect(findImportRowsByJobId(job.id)[0]).toMatchObject({
        status: 'rejected',
        errorMessage: 'Synthetic imported audit failure',
      });
      expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number }).count).toBe(0);
      expect(findPendingOutbox()).toEqual([]);
    } finally {
      db.exec('DROP TRIGGER reject_imported_audit;');
    }
  });

  test('a fatal parser failure marks the import job failed', () => {
    const job = importCsv(
      `${header}\nSYN-001,Dela Cruz,Juan,1990-01-01,male,Baan 3,Butuan City,unexpected`
    );

    expect(job.status).toBe('failed');
    expect(job.errorMessage).toBeTruthy();
    expect(job.completedAt).toBeTruthy();
    expect(job.totalRows).toBe(0);
    expect(findImportJobById(job.id)).toEqual(job);
    expect(findImportRowsByJobId(job.id)).toEqual([]);
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number }).count).toBe(0);
  });
});
