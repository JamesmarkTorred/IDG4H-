import type { PatientInput } from '../domain';

export function validatePatientImport(
  patient: PatientInput
): void {
  if (!patient.lastName.trim()) {
    throw new Error('last_name is required.');
  }

  if (!patient.firstName.trim()) {
    throw new Error('first_name is required.');
  }

  if (!patient.birthDate.trim()) {
    throw new Error('birth_date is required.');
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(patient.birthDate)) {
    throw new Error('birth_date must use YYYY-MM-DD.');
  }

  const date = new Date(`${patient.birthDate}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error('birth_date is not a valid date.');
  }

  const normalized = date.toISOString().slice(0, 10);

  if (normalized !== patient.birthDate) {
    throw new Error('birth_date is not a valid calendar date.');
  }
}
