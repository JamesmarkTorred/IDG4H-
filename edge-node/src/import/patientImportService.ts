import { db } from '../db/connection';
import {
  completeImportJob,
  createImportJob,
  failImportJob,
  recordImportRowResult,
} from '../db/importRepository';
import { createPatientWithOutbox } from '../services/patientWriteService';
import { findPatientCandidates } from '../services/patientIdentityService';

import type { ImportJob, PatientInput } from '../domain';
import type { ParsedCsvRow } from './csvParser';
import type { PatientSourceMapper } from './patientSourceMapper';

import { parseCsv } from './csvParser';
import { validatePatientImport } from './patientImportValidation';

export interface PatientCsvImportInput {
  fileName: string;
  sourceSystem: string;
  csv: string;
  mapper: PatientSourceMapper;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordImportedPatient(
  jobId: string,
  row: ParsedCsvRow,
  patientInput: PatientInput
): void {
  db.transaction(() => {
    const patient = createPatientWithOutbox(patientInput);

    recordImportRowResult({
      importJobId: jobId,
      rowNumber: row.rowNumber,
      status: 'imported',
      sourceRecordId: patient.sourceRecordId,
      entityType: 'patient',
      localEntityId: patient.id,
      rawData: row.data,
    });
  })();
}

function processRow(
  jobId: string,
  row: ParsedCsvRow,
  mapper: PatientSourceMapper
): void {
  try {
    const patientInput = mapper.map(row.data);
    validatePatientImport(patientInput);

    const candidates = findPatientCandidates(patientInput);

    if (candidates.length > 0) {
      recordImportRowResult({
        importJobId: jobId,
        rowNumber: row.rowNumber,
        status: 'candidate',
        sourceRecordId: patientInput.sourceRecordId,
        entityType: 'patient',
        localEntityId: candidates[0].patient.id,
        rawData: row.data,
        errorMessage: `${candidates.length} patient candidate(s) require identity review.`,
      });
      return;
    }

    recordImportedPatient(jobId, row, patientInput);
  } catch (error) {
    recordImportRowResult({
      importJobId: jobId,
      rowNumber: row.rowNumber,
      status: 'rejected',
      sourceRecordId: row.data.source_record_id?.trim() || undefined,
      entityType: 'patient',
      rawData: row.data,
      errorMessage: errorMessage(error),
    });
  }
}

export function importPatientsFromCsv(
  input: PatientCsvImportInput
): ImportJob {
  const job = createImportJob({
    sourceSystem: input.sourceSystem,
    fileName: input.fileName,
    fileType: 'csv',
  });

  try {
    const rows = parseCsv(input.csv);

    for (const row of rows) {
      processRow(job.id, row, input.mapper);
    }

    return completeImportJob(job.id);
  } catch (error) {
    return failImportJob(job.id, errorMessage(error));
  }
}
