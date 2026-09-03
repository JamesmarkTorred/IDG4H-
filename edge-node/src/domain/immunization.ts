import type { Persisted, SourceInput, SyncMetadata } from './record';

export interface ImmunizationInput extends SourceInput {
  patientId: string;
  encounterId?: string;
  vaccineCode: string;
  vaccineName?: string;
  doseLabel?: string;
  administeredDate?: string;
  // The schema defaults status to 'completed' but has no closed value set.
  status?: string;
  remarks?: string;
}

export interface Immunization
  extends Persisted<ImmunizationInput>, SyncMetadata {
  status: string;
}
