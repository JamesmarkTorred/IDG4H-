import type { Patient, PatientInput } from '../domain';

import {
  findPatientByPhicNo,
  findPatientBySourceRecord,
  searchPatientsByDemographics,
} from '../db/patientRepository';

export type PatientMatchReason =
  | 'source-record'
  | 'phic-number'
  | 'demographic-match';

export interface PatientCandidate {
  patient: Patient;
  reason: PatientMatchReason;
  confidence: 'strong' | 'candidate';
}

export function findPatientCandidates(
  input: PatientInput
): PatientCandidate[] {
  const candidates = new Map<string, PatientCandidate>();

  if (input.sourceSystem && input.sourceRecordId) {
    const patient = findPatientBySourceRecord(
      input.sourceSystem,
      input.sourceRecordId
    );

    if (patient) {
      candidates.set(patient.id, {
        patient,
        reason: 'source-record',
        confidence: 'strong',
      });
    }
  }

  if (input.phicNo) {
    const patient = findPatientByPhicNo(input.phicNo);

    if (patient && !candidates.has(patient.id)) {
      candidates.set(patient.id, {
        patient,
        reason: 'phic-number',
        confidence: 'strong',
      });
    }
  }

  const demographicMatches = searchPatientsByDemographics(
    input.lastName,
    input.firstName,
    input.birthDate
  );

  for (const patient of demographicMatches) {
    if (!candidates.has(patient.id)) {
      candidates.set(patient.id, {
        patient,
        reason: 'demographic-match',
        confidence: 'candidate',
      });
    }
  }

  return [...candidates.values()];
}
