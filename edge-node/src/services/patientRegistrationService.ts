import type { Patient, PatientInput } from '../domain';
import { createPatientWithOutbox } from './patientWriteService';
import {
  findPatientCandidates,
  type PatientCandidate,
} from './patientIdentityService';

export interface PatientRegistrationResult {
  created: boolean;
  patient?: Patient;
  candidates: PatientCandidate[];
}

export function registerPatient(
  input: PatientInput
): PatientRegistrationResult {
  const candidates = findPatientCandidates(input);

  if (candidates.length > 0) {
    return {
      created: false,
      candidates,
    };
  }

  return {
    created: true,
    patient: createPatientWithOutbox(input),
    candidates: [],
  };
}
