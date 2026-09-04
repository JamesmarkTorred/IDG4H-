import { Router } from 'express';

import {
  findImportJobById,
  findImportRowsByJobId,
} from '../db/importRepository';
import type { ImportJob } from '../domain';
import {
  uploadPatientImport,
  validatePatientImportUpload,
} from '../middleware/upload';
import {
  ApiError,
  validateRequest,
} from '../middleware/errorHandler';
import {
  importPatientsFromCsv,
  importPatientsFromXlsx,
} from '../import/patientImportService';
import { SyntheticPatientMapper } from '../import/syntheticPatientMapper';
import {
  importIdSchema,
  patientImportFieldsSchema,
} from '../validation/importSchemas';

const router = Router();

function publicImportJob(job: ImportJob): ImportJob {
  if (!job.errorMessage) {
    return job;
  }

  return {
    ...job,
    errorMessage: 'Import processing failed.',
  };
}

/**
 * @openapi
 * /api/imports/patients:
 *   post:
 *     summary: Import synthetic patient CSV or XLSX data with a durable audit trail
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, mapper, sourceSystem]
 *             properties:
 *               file: { type: string, format: binary }
 *               mapper: { type: string, enum: [synthetic-patient] }
 *               sourceSystem: { type: string, example: iClinicSys-synthetic }
 *     responses:
 *       201: { description: Import job created and processed }
 *       400: { description: Invalid upload, mapper, source, or file content }
 *       413: { description: Upload exceeds the configured size limit }
 *       500: { description: Sanitized unexpected failure }
 */
router.post(
  '/imports/patients',
  uploadPatientImport,
  async (req, res) => {
    const fields = validateRequest(patientImportFieldsSchema, req.body);
    const upload = validatePatientImportUpload(req.file);
    const mapper = new SyntheticPatientMapper(fields.sourceSystem);
    const job = upload.fileType === 'csv'
      ? importPatientsFromCsv({
          fileName: upload.fileName,
          sourceSystem: fields.sourceSystem,
          csv: upload.csv,
          mapper,
        })
      : await importPatientsFromXlsx({
          fileName: upload.fileName,
          sourceSystem: fields.sourceSystem,
          xlsx: upload.xlsx,
          mapper,
        });

    if (job.status === 'failed') {
      throw new ApiError(
        400,
        'IMPORT_FAILED',
        'The uploaded file could not be imported.',
        { jobId: job.id }
      );
    }

    res.status(201).json({ job: publicImportJob(job) });
  }
);

/**
 * @openapi
 * /api/imports/{id}/rows:
 *   get:
 *     summary: Get ordered row audit results for an import job
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Ordered import row results }
 *       404: { description: Import job not found }
 */
router.get('/imports/:id/rows', (req, res) => {
  const id = validateRequest(importIdSchema, req.params.id);
  const job = findImportJobById(id);

  if (!job) {
    throw new ApiError(
      404,
      'IMPORT_NOT_FOUND',
      `Import job ${id} was not found.`
    );
  }

  const rows = findImportRowsByJobId(id);
  res.status(200).json({ rows });
});

/**
 * @openapi
 * /api/imports/{id}:
 *   get:
 *     summary: Get an import job and its accounting totals
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Import job found }
 *       404: { description: Import job not found }
 */
router.get('/imports/:id', (req, res) => {
  const id = validateRequest(importIdSchema, req.params.id);
  const job = findImportJobById(id);

  if (!job) {
    throw new ApiError(
      404,
      'IMPORT_NOT_FOUND',
      `Import job ${id} was not found.`
    );
  }

  res.status(200).json({ job: publicImportJob(job) });
});

export default router;
