import type { PatientInput } from '../domain';

export interface PatientSourceMapper {
  map(row: Record<string, string>): PatientInput;
}
