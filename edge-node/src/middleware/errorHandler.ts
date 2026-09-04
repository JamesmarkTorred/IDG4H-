import type { ErrorRequestHandler } from 'express';
import type { ZodError } from 'zod';

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
