export type ImportFileType =
  | 'csv'
  | 'xlsx';

export type ImportJobStatus =
  | 'processing'
  | 'completed'
  | 'completed_with_issues'
  | 'failed';

export type ImportRowStatus =
  | 'imported'
  | 'candidate'
  | 'rejected';

export interface CreateImportJobInput {
  sourceSystem: string;
  fileName: string;
  fileType: ImportFileType;
}

export interface CreateImportRowResultInput {
  importJobId: string;
  rowNumber: number;

  status: ImportRowStatus;

  sourceRecordId?: string;
  entityType?: string;
  localEntityId?: string;

  rawData: unknown;

  errorMessage?: string;
}

export interface ImportJob {
  id: string;

  sourceSystem: string;
  fileName: string;
  fileType: ImportFileType;

  status: ImportJobStatus;

  totalRows: number;
  importedRows: number;
  candidateRows: number;
  failedRows: number;

  startedAt: string;
  completedAt?: string;

  errorMessage?: string;
}

export interface ImportRowResult {
  id: string;

  importJobId: string;
  rowNumber: number;

  status: ImportRowStatus;

  sourceRecordId?: string;
  entityType?: string;

  localEntityId?: string;

  rawData: unknown;

  errorMessage?: string;

  createdAt: string;
}
