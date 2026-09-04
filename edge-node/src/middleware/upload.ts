import path from 'node:path';

import multer from 'multer';

import { ApiError } from './errorHandler';

export const maxImportUploadBytes = 5 * 1024 * 1024;

const supportedExtensions = new Set(['.csv', '.xlsx']);

export const uploadPatientImport = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxImportUploadBytes,
    files: 1,
    fields: 10,
    parts: 11,
    fieldNameSize: 100,
    fieldSize: 10_000,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!supportedExtensions.has(extension)) {
      callback(new ApiError(
        400,
        'UNSUPPORTED_FILE_TYPE',
        'Only .csv and .xlsx patient import files are supported.'
      ));
      return;
    }

    callback(null, true);
  },
}).single('file');

export type ValidatedImportUpload =
  | {
      fileName: string;
      fileType: 'csv';
      csv: string;
    }
  | {
      fileName: string;
      fileType: 'xlsx';
      xlsx: Buffer;
    };

function hasZipSignature(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return false;
  }

  return (
    (buffer[2] === 0x03 && buffer[3] === 0x04) ||
    (buffer[2] === 0x05 && buffer[3] === 0x06) ||
    (buffer[2] === 0x07 && buffer[3] === 0x08)
  );
}

export function validatePatientImportUpload(
  file: Express.Multer.File | undefined
): ValidatedImportUpload {
  if (!file) {
    throw new ApiError(
      400,
      'FILE_REQUIRED',
      'Exactly one patient import file is required.'
    );
  }

  if (file.buffer.length === 0) {
    throw new ApiError(400, 'EMPTY_FILE', 'The uploaded file is empty.');
  }

  const extension = path.extname(file.originalname).toLowerCase();

  if (extension === '.xlsx') {
    if (!hasZipSignature(file.buffer)) {
      throw new ApiError(
        400,
        'INVALID_FILE_CONTENT',
        'The uploaded .xlsx file is not a valid Excel workbook.'
      );
    }

    return {
      fileName: path.basename(file.originalname),
      fileType: 'xlsx',
      xlsx: file.buffer,
    };
  }

  let csv: string;

  try {
    csv = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    throw new ApiError(
      400,
      'INVALID_FILE_CONTENT',
      'The uploaded CSV file must contain valid UTF-8 text.'
    );
  }

  return {
    fileName: path.basename(file.originalname),
    fileType: 'csv',
    csv,
  };
}
