import { Router } from 'express';
import type { ZodType } from 'zod';

import {
  findPatientById,
  searchPatientsByDemographics,
} from '../db/patientRepository';
import {
  ApiError,
  requestValidationError,
} from '../middleware/errorHandler';
import { PatientNotFoundError } from '../domain/patientErrors';
import { registerPatient } from '../services/patientRegistrationService';
import { updatePatientWithOutbox } from '../services/patientWriteService';
import {
  patientCreateSchema,
  patientIdSchema,
  patientSearchSchema,
  patientUpdateSchema,
} from '../validation/patientSchemas';

const router = Router();

function validate<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw requestValidationError(result.error);
  }

  return result.data;
}

/**
 * @openapi
 * /api/patients/search:
 *   get:
 *     summary: Search patients by exact name and birth date
 *     parameters:
 *       - { in: query, name: lastName, required: true, schema: { type: string } }
 *       - { in: query, name: firstName, required: true, schema: { type: string } }
 *       - { in: query, name: birthDate, required: true, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Matching patients }
 *       400: { description: Invalid search parameters }
 */
router.get('/search', (req, res) => {
  const query = validate(patientSearchSchema, req.query);
  const patients = searchPatientsByDemographics(
    query.lastName,
    query.firstName,
    query.birthDate
  );

  res.status(200).json({ patients });
});

/**
 * @openapi
 * /api/patients/{id}:
 *   get:
 *     summary: Get a patient by ID
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Patient found }
 *       400: { description: Invalid patient ID }
 *       404: { description: Patient not found }
 */
router.get('/:id', (req, res) => {
  const id = validate(patientIdSchema, req.params.id);
  const patient = findPatientById(id);

  if (!patient) {
    throw new PatientNotFoundError(id);
  }

  res.status(200).json({ patient });
});

/**
 * @openapi
 * /api/patients:
 *   post:
 *     summary: Register a patient after identity candidate detection
 *     responses:
 *       201: { description: Patient created with a pending outbox operation }
 *       400: { description: Invalid patient input }
 *       409: { description: Existing patient candidates require review }
 */
router.post('/', (req, res) => {
  const input = validate(patientCreateSchema, req.body);
  const result = registerPatient(input);

  if (!result.created || !result.patient) {
    throw new ApiError(
      409,
      'IDENTITY_CONFLICT',
      'Potential existing patient matches require review.',
      { candidates: result.candidates }
    );
  }

  res.status(201).json({ patient: result.patient });
});

/**
 * @openapi
 * /api/patients/{id}:
 *   patch:
 *     summary: Update a patient using optimistic versioning
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Patient updated with a pending outbox operation }
 *       400: { description: Invalid update input }
 *       404: { description: Patient not found }
 *       409: { description: Patient version conflict }
 */
router.patch('/:id', (req, res) => {
  const id = validate(patientIdSchema, req.params.id);
  const input = validate(patientUpdateSchema, req.body);
  const patient = updatePatientWithOutbox({
    id,
    ...input,
  });

  res.status(200).json({ patient });
});

export default router;
