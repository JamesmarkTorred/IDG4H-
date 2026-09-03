import type { Persisted, SourceInput, SyncMetadata } from './record';

export interface ObservationInput extends SourceInput {
  patientId: string;
  encounterId?: string;
  code: string;
  valueText?: string;
  valueNumeric?: number;
  unit?: string;
  observedAt: string;
}

export interface Observation extends Persisted<ObservationInput>, SyncMetadata {}
