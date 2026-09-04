import { Router } from 'express';

import {
  findEncounterById,
  findEncountersByPatientId,
} from '../db/encounterRepository';
import { findPatientById } from '../db/patientRepository';
import { EncounterNotFoundError } from '../domain/encounterErrors';
import { PatientNotFoundError } from '../domain/patientErrors';
import { validateRequest } from '../middleware/errorHandler';
import {
  saveClinicalEncounter,
  type ClinicalEncounterInput,
} from '../services/clinicalEncounterService';
import {
  clinicalEncounterRequestSchema,
  encounterIdSchema,
  encounterPatientIdSchema,
} from '../validation/encounterSchemas';

const router = Router();

/**
 * @openapi
 * /api/patients/{patientId}/encounters:
 *   post:
 *     summary: Atomically create an encounter and its clinical child records
 *     parameters:
 *       - { in: path, name: patientId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Encounter, child records and outbox operations committed }
 *       400: { description: Invalid clinical encounter input }
 *       404: { description: Patient not found }
 *       500: { description: Sanitized unexpected failure }
 *   get:
 *     summary: List a patient's encounters
 *     parameters:
 *       - { in: path, name: patientId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Patient encounter history }
 *       400: { description: Invalid patient ID }
 *       404: { description: Patient not found }
 */
router.post('/patients/:patientId/encounters', (req, res) => {
  const patientId = validateRequest(
    encounterPatientIdSchema,
    req.params.patientId
  );
  const input = validateRequest(clinicalEncounterRequestSchema, req.body);
  const {
    observations,
    immunizations,
    ...encounter
  } = input;
  const clinicalInput: ClinicalEncounterInput = {
    patientId,
    encounter,
    observations,
    immunizations,
  };

  const result = saveClinicalEncounter(clinicalInput);
  res.status(201).json(result);
});

router.get('/patients/:patientId/encounters', (req, res) => {
  const patientId = validateRequest(
    encounterPatientIdSchema,
    req.params.patientId
  );

  if (!findPatientById(patientId)) {
    throw new PatientNotFoundError(patientId);
  }

  const encounters = findEncountersByPatientId(patientId);
  res.status(200).json({ encounters });
});

/**
 * @openapi
 * /api/encounters/{id}:
 *   get:
 *     summary: Get an encounter by ID
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Encounter found }
 *       400: { description: Invalid encounter ID }
 *       404: { description: Encounter not found }
 */
router.get('/encounters/:id', (req, res) => {
  const id = validateRequest(encounterIdSchema, req.params.id);
  const encounter = findEncounterById(id);

  if (!encounter) {
    throw new EncounterNotFoundError(id);
  }

  res.status(200).json({ encounter });
});

export default router;
