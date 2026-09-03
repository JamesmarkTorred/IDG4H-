import { db } from '../db/connection';
import { createPatient } from '../db/patientRepository';
import { enqueueOutboxOperation } from '../db/outboxRepository';

import type {
  Patient,
  PatientInput,
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
