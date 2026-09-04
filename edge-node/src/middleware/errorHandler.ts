import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import type { ZodError, ZodType } from 'zod';

import { EncounterNotFoundError } from '../domain/encounterErrors';
import {
  PatientNotFoundError,
  PatientVersionConflictError,
} from '../domain/patientErrors';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function requestValidationError(error: ZodError): ApiError {
  return new ApiError(
    400,
    'VALIDATION_ERROR',
    'Request validation failed.',
    {
      issues: error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  );
}

export function validateRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw requestValidationError(result.error);
  }

  return result.data;
}

function isMalformedJson(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const parserError = error as SyntaxError & {
    status?: unknown;
    type?: unknown;
  };

  return parserError.status === 400 || parserError.type === 'entity.parse.failed';
}

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next
) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    const invalidFileCount =
      error.code === 'LIMIT_FILE_COUNT' ||
      error.code === 'LIMIT_UNEXPECTED_FILE';

    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge
          ? 'FILE_TOO_LARGE'
          : invalidFileCount
            ? 'INVALID_FILE_COUNT'
            : 'INVALID_MULTIPART_REQUEST',
        message: tooLarge
          ? 'The uploaded file exceeds the configured size limit.'
          : invalidFileCount
            ? 'Exactly one file field named file is required.'
            : 'The multipart upload is invalid.',
      },
    } satisfies ApiErrorBody);
    return;
  }

  if (isMalformedJson(error)) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    } satisfies ApiErrorBody);
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    } satisfies ApiErrorBody);
    return;
  }

  if (error instanceof PatientNotFoundError) {
    res.status(404).json({
      error: {
        code: 'PATIENT_NOT_FOUND',
        message: `Patient ${error.patientId} was not found.`,
      },
    } satisfies ApiErrorBody);
    return;
  }

  if (error instanceof EncounterNotFoundError) {
    res.status(404).json({
      error: {
        code: 'ENCOUNTER_NOT_FOUND',
        message: `Encounter ${error.encounterId} was not found.`,
      },
    } satisfies ApiErrorBody);
    return;
  }

  if (error instanceof PatientVersionConflictError) {
    res.status(409).json({
      error: {
        code: 'VERSION_CONFLICT',
        message: `Patient record has been modified since version ${error.expectedVersion}.`,
        details: {
          patientId: error.patientId,
          expectedVersion: error.expectedVersion,
          currentVersion: error.currentVersion,
        },
      },
    } satisfies ApiErrorBody);
    return;
  }

  console.error('[edge-node] request failed:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected server error occurred.',
    },
  } satisfies ApiErrorBody);
};
