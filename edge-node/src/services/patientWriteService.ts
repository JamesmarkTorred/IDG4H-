import { db } from '../db/connection';
import { createPatient, updatePatient } from '../db/patientRepository';
import { enqueueOutboxOperation } from '../db/outboxRepository';

import type {
  Patient,
  PatientInput,
  PatientUpdateInput,
} from '../domain';

const createPatientTransaction = db.transaction(
  (input: PatientInput): Patient => {
    const patient = createPatient(input);

    enqueueOutboxOperation({
      entityType: 'patient',
      entityId: patient.id,
      operationType: 'create',
      payload: patient,
    });

    return patient;
  }
);

export function createPatientWithOutbox(
  input: PatientInput
): Patient {
  return createPatientTransaction(input);
}

const updatePatientTransaction = db.transaction(
  (input: PatientUpdateInput): Patient => {
    const patient = updatePatient(input);
    enqueueOutboxOperation({
      entityType: 'patient',
      entityId: patient.id,
      operationType: 'update',
      payload: patient,
    });
    return patient;
  }
);

export function updatePatientWithOutbox(input: PatientUpdateInput): Patient {
  return updatePatientTransaction(input);
}
