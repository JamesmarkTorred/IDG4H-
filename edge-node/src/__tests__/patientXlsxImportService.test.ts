import fs from 'node:fs';
import path from 'node:path';

import { db } from '../db/connection';
import { findImportRowsByJobId } from '../db/importRepository';
import { findPendingOutbox } from '../db/outboxRepository';
import { importPatientsFromXlsx } from '../import/patientImportService';
import { SyntheticPatientMapper } from '../import/syntheticPatientMapper';

const fixturePath = path.resolve(
  __dirname,
  '../../test-fixtures/synthetic-patient-import.xlsx'
);

describe('patient XLSX import service', () => {
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

  function importFixture() {
    return importPatientsFromXlsx({
      fileName: 'synthetic-patient-import.xlsx',
      sourceSystem: 'synthetic-xlsx',
      xlsx: fs.readFileSync(fixturePath),
      mapper: new SyntheticPatientMapper('synthetic-xlsx'),
    });
  }

  test('creates patients, outbox operations, and audits from the shared import pipeline', async () => {
    const job = await importFixture();

    expect(job).toMatchObject({
      sourceSystem: 'synthetic-xlsx',
      fileName: 'synthetic-patient-import.xlsx',
      fileType: 'xlsx',
      status: 'completed',
      totalRows: 2,
      importedRows: 2,
      candidateRows: 0,
      failedRows: 0,
    });

    const audits = findImportRowsByJobId(job.id);
    expect(audits.map(row => ({
      rowNumber: row.rowNumber,
      status: row.status,
      sourceRecordId: row.sourceRecordId,
    }))).toEqual([
      { rowNumber: 2, status: 'imported', sourceRecordId: 'E2E-XLSX-001' },
      { rowNumber: 4, status: 'imported', sourceRecordId: 'E2E-XLSX-002' },
    ]);
    expect(audits[0].rawData).toMatchObject({
      source_record_id: 'E2E-XLSX-001',
      last_name: 'ExcelImport',
    });
    expect(audits.every(row => row.localEntityId)).toBe(true);

    const patients = db.prepare(`
      SELECT source_system, source_record_id, node_id, version
      FROM patients
      ORDER BY source_record_id
    `).all() as Array<{
      source_system: string;
      source_record_id: string;
      node_id: string;
      version: number;
    }>;
    expect(patients.map(patient => patient.source_record_id)).toEqual([
      'E2E-XLSX-001',
      'E2E-XLSX-002',
    ]);
    expect(patients.every(patient =>
      patient.source_system === 'synthetic-xlsx' &&
      patient.node_id.length > 0 &&
      patient.version === 1
    )).toBe(true);

    const operations = findPendingOutbox();
    expect(operations).toHaveLength(2);
    expect(operations.every(operation => {
      const payload = operation.payload as { sourceSystem?: unknown };

      return operation.entityType === 'patient' &&
        operation.operationType === 'create' &&
        payload.sourceSystem === 'synthetic-xlsx';
    })).toBe(true);
  });

  test('turns a duplicate workbook import into candidates without duplicate writes', async () => {
    const firstJob = await importFixture();
    const initialPatientIds = (db.prepare(
      'SELECT id FROM patients ORDER BY id'
    ).all() as Array<{ id: string }>).map(row => row.id);

    const duplicateJob = await importFixture();

    expect(firstJob.importedRows).toBe(2);
    expect(duplicateJob).toMatchObject({
      fileType: 'xlsx',
      status: 'completed_with_issues',
      totalRows: 2,
      importedRows: 0,
      candidateRows: 2,
      failedRows: 0,
    });
    const candidateRows = findImportRowsByJobId(duplicateJob.id);
    expect(candidateRows.map(row => ({
      rowNumber: row.rowNumber,
      status: row.status,
      sourceRecordId: row.sourceRecordId,
    }))).toEqual([
      { rowNumber: 2, status: 'candidate', sourceRecordId: 'E2E-XLSX-001' },
      { rowNumber: 4, status: 'candidate', sourceRecordId: 'E2E-XLSX-002' },
    ]);
    expect(candidateRows.map(row => row.localEntityId).sort()).toEqual(
      initialPatientIds.sort()
    );
    expect((db.prepare('SELECT COUNT(*) AS count FROM patients').get() as {
      count: number;
    }).count).toBe(2);
    expect(findPendingOutbox()).toHaveLength(2);
  });
});
