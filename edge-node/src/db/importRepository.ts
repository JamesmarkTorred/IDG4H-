import { randomUUID } from 'crypto';

import { db } from './connection';

import type {
  CreateImportJobInput,
  CreateImportRowResultInput,
  ImportJob,
  ImportJobStatus,
  ImportRowResult,
  ImportRowStatus,
} from '../domain';

interface ImportJobRow {
  id: string;

  source_system: string;
  file_name: string;
  file_type: ImportJob['fileType'];

  status: ImportJobStatus;

  total_rows: number;
  imported_rows: number;
  candidate_rows: number;
  failed_rows: number;

  started_at: string;
  completed_at: string | null;

  error_message: string | null;
}

interface ImportRowResultRow {
  id: string;

  import_job_id: string;
  row_number: number;

  status: ImportRowStatus;

  source_record_id: string | null;
  entity_type: string | null;
  local_entity_id: string | null;

  raw_data: string;

  error_message: string | null;

  created_at: string;
}

function mapJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,

    sourceSystem: row.source_system,
    fileName: row.file_name,
    fileType: row.file_type,

    status: row.status,

    totalRows: row.total_rows,
    importedRows: row.imported_rows,
    candidateRows: row.candidate_rows,
    failedRows: row.failed_rows,

    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,

    errorMessage: row.error_message ?? undefined,
  };
}

function mapRowResult(
  row: ImportRowResultRow
): ImportRowResult {
  return {
    id: row.id,

    importJobId: row.import_job_id,
    rowNumber: row.row_number,

    status: row.status,

    sourceRecordId: row.source_record_id ?? undefined,
    entityType: row.entity_type ?? undefined,
    localEntityId: row.local_entity_id ?? undefined,

    rawData: JSON.parse(row.raw_data),

    errorMessage: row.error_message ?? undefined,

    createdAt: row.created_at,
  };
}

export function createImportJob(
  input: CreateImportJobInput
): ImportJob {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO import_jobs (
      id,
      source_system,
      file_name,
      file_type,
      status,
      total_rows,
      imported_rows,
      candidate_rows,
      failed_rows,
      started_at
    )
    VALUES (
      @id,
      @sourceSystem,
      @fileName,
      @fileType,
      'processing',
      0,
      0,
      0,
      0,
      @startedAt
    )
  `).run({
    id,
    sourceSystem: input.sourceSystem.trim(),
    fileName: input.fileName.trim(),
    fileType: input.fileType,
    startedAt: now,
  });

  const job = findImportJobById(id);

  if (!job) {
    throw new Error(`Import job ${id} could not be retrieved.`);
  }

  return job;
}

export function recordImportRowResult(
  input: CreateImportRowResultInput
): ImportRowResult {
  const id = randomUUID();
  const now = new Date().toISOString();

  const insertRow = db.transaction(() => {
    db.prepare(`
      INSERT INTO import_row_results (
        id,
        import_job_id,
        row_number,
        status,
        source_record_id,
        entity_type,
        local_entity_id,
        raw_data,
        error_message,
        created_at
      )
      VALUES (
        @id,
        @importJobId,
        @rowNumber,
        @status,
        @sourceRecordId,
        @entityType,
        @localEntityId,
        @rawData,
        @errorMessage,
        @createdAt
      )
    `).run({
      id,
      importJobId: input.importJobId,
      rowNumber: input.rowNumber,
      status: input.status,
      sourceRecordId: input.sourceRecordId ?? null,
      entityType: input.entityType ?? null,
      localEntityId: input.localEntityId ?? null,
      rawData: JSON.stringify(input.rawData),
      errorMessage: input.errorMessage ?? null,
      createdAt: now,
    });

    const counterColumn =
      input.status === 'imported'
        ? 'imported_rows'
        : input.status === 'candidate'
          ? 'candidate_rows'
          : 'failed_rows';

    const result = db.prepare(`
      UPDATE import_jobs
      SET
        total_rows = total_rows + 1,
        ${counterColumn} = ${counterColumn} + 1
      WHERE id = ?
        AND status = 'processing'
    `).run(input.importJobId);

    if (result.changes !== 1) {
      throw new Error(
        `Import job ${input.importJobId} does not exist or is not processing.`
      );
    }
  });

  insertRow();

  const row = db
    .prepare(`
      SELECT *
      FROM import_row_results
      WHERE id = ?
    `)
    .get(id) as ImportRowResultRow | undefined;

  if (!row) {
    throw new Error(`Import row result ${id} could not be retrieved.`);
  }

  return mapRowResult(row);
}

export function completeImportJob(
  id: string
): ImportJob {
  const job = findImportJobById(id);

  if (!job) {
    throw new Error(`Import job ${id} does not exist.`);
  }

  const status: ImportJobStatus =
    job.candidateRows > 0 || job.failedRows > 0
      ? 'completed_with_issues'
      : 'completed';

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE import_jobs
    SET
      status = @status,
      completed_at = @completedAt
    WHERE id = @id
  `).run({
    id,
    status,
    completedAt: now,
  });

  const completed = findImportJobById(id);

  if (!completed) {
    throw new Error(`Completed import job ${id} could not be retrieved.`);
  }

  return completed;
}

export function failImportJob(
  id: string,
  message: string
): ImportJob {
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      UPDATE import_jobs
      SET
        status = 'failed',
        error_message = @message,
        completed_at = @completedAt
      WHERE id = @id
    `)
    .run({
      id,
      message,
      completedAt: now,
    });

  if (result.changes !== 1) {
    throw new Error(`Import job ${id} does not exist.`);
  }

  const failed = findImportJobById(id);

  if (!failed) {
    throw new Error(`Failed import job ${id} could not be retrieved.`);
  }

  return failed;
}

export function findImportJobById(
  id: string
): ImportJob | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM import_jobs
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as ImportJobRow | undefined;

  return row ? mapJob(row) : undefined;
}

export function findImportRowsByJobId(
  importJobId: string
): ImportRowResult[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM import_row_results
      WHERE import_job_id = ?
      ORDER BY row_number ASC
    `)
    .all(importJobId) as ImportRowResultRow[];

  return rows.map(mapRowResult);
}
