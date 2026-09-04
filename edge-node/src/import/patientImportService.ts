import { db } from '../db/connection';
import {
  completeImportJob,
  createImportJob,
  failImportJob,
  recordImportRowResult,
} from '../db/importRepository';
import { createPatientWithOutbox } from '../services/patientWriteService';
import { findPatientCandidates } from '../services/patientIdentityService';

import type { ImportFileType, ImportJob, PatientInput } from '../domain';
import type { ParsedImportRow } from './parsedImportRow';
import type { PatientSourceMapper } from './patientSourceMapper';

import { parseCsv } from './csvParser';
import { validatePatientImport } from './patientImportValidation';
import { parseXlsx } from './xlsxParser';

export interface PatientCsvImportInput {
  fileName: string;
  sourceSystem: string;
  csv: string;
  mapper: PatientSourceMapper;
}

export interface PatientXlsxImportInput {
  fileName: string;
  sourceSystem: string;
  xlsx: Buffer;
  mapper: PatientSourceMapper;
}

function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return String(error);
}

function recordImportedPatient(
  jobId: string,
  row: ParsedImportRow,
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
  row: ParsedImportRow,
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

function createPatientImportJob(
  fileName: string,
  sourceSystem: string,
  fileType: ImportFileType
): ImportJob {
  return createImportJob({
    sourceSystem,
    fileName,
    fileType,
  });
}

function processRows(
  job: ImportJob,
  rows: ParsedImportRow[],
  mapper: PatientSourceMapper
): ImportJob {
  for (const row of rows) {
    processRow(job.id, row, mapper);
  }

  return completeImportJob(job.id);
}

export function importPatientsFromCsv(
  input: PatientCsvImportInput
): ImportJob {
  const job = createPatientImportJob(
    input.fileName,
    input.sourceSystem,
    'csv'
  );

  try {
    return processRows(job, parseCsv(input.csv), input.mapper);
  } catch (error) {
    return failImportJob(job.id, errorMessage(error));
  }
}

export async function importPatientsFromXlsx(
  input: PatientXlsxImportInput
): Promise<ImportJob> {
  const job = createPatientImportJob(
    input.fileName,
    input.sourceSystem,
    'xlsx'
  );

  try {
    const rows = await parseXlsx(input.xlsx);
    return processRows(job, rows, input.mapper);
  } catch (error) {
    return failImportJob(job.id, errorMessage(error));
  }
}
