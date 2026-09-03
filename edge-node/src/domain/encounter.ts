import type { Persisted, SourceInput, SyncMetadata } from './record';

export interface EncounterInput extends SourceInput {
  patientId: string;
  encounterDate: string;
  encounterType?: string;
  chiefComplaint?: string;
  historyPresentIllness?: string;
  assessmentPlan?: string;
  outcome?: string;
  facilityId?: string;
  practitionerId?: string;
}

export interface Encounter extends Persisted<EncounterInput>, SyncMetadata {}
