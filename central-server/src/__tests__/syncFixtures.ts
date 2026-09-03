import { randomUUID } from 'node:crypto';
import type { SyncEntityType, SyncOperationInput } from '../domain';

export const timestamp = '2026-09-03T08:00:00.000Z';
export function operation(entityType: SyncEntityType = 'patient', fields: Record<string, unknown> = {}): SyncOperationInput {
  const entityId = randomUUID();
  const defaults = {
    patient: { firstName: 'Synthetic', lastName: 'Patient', birthDate: '1990-01-01', sex: 'unknown' },
    encounter: { patientId: randomUUID(), encounterDate: timestamp },
    observation: { patientId: randomUUID(), code: 'temperature', observedAt: timestamp },
    immunization: { patientId: randomUUID(), vaccineCode: 'BCG', status: 'completed' },
  };
  return {
    operationId: randomUUID(), nodeId: 'edge-integration-test', entityType, entityId, operationType: 'create',
    payload: { id: entityId, nodeId: 'edge-integration-test', version: 1, createdAt: timestamp,
      updatedAt: timestamp, ...defaults[entityType], ...fields },
  };
}
