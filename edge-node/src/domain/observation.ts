export interface ObservationInput {
  patientId: string;
  encounterId?: string;

  sourceSystem?: string;
  sourceRecordId?: string;

  code: string;

  valueText?: string;
  valueNumeric?: number;
  unit?: string;

  observedAt: string;
}

export interface Observation extends ObservationInput {
  id: string;
  nodeId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
