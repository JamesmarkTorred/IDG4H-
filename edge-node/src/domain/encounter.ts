export interface EncounterInput {
  patientId: string;

  sourceSystem?: string;
  sourceRecordId?: string;

  encounterDate: string;
  encounterType?: string;

  chiefComplaint?: string;
  historyPresentIllness?: string;
  assessmentPlan?: string;
  outcome?: string;

  facilityId?: string;
  practitionerId?: string;
}

export interface Encounter extends EncounterInput {
  id: string;
  nodeId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
