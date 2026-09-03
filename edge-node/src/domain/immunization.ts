export interface ImmunizationInput {
  patientId: string;
  encounterId?: string;
  nodeId: string;

  sourceSystem?: string;
  sourceRecordId?: string;

  vaccineCode: string;
  vaccineName?: string;
  doseLabel?: string;
  administeredDate?: string;

  status?: 'completed' | 'not-done' | 'unknown';
  remarks?: string;
}

export interface Immunization extends ImmunizationInput {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
