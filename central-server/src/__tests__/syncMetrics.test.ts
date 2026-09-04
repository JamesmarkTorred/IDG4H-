import {
  calculateSyncMetrics,
  type SyncMetricInput,
} from '../evaluation/syncMetrics';

function completeInput(): SyncMetricInput {
  return {
    expectedOperations: ['op-1', 'op-2'],
    operations: [
      {
        operationId: 'op-1',
        edgeStatus: 'acknowledged',
        centralStatus: 'applied',
        attemptCount: 1,
        createdAt: '2026-09-04T00:00:00.000Z',
        acknowledgedAt: '2026-09-04T00:00:00.100Z',
      },
      {
        operationId: 'op-2',
        edgeStatus: 'acknowledged',
        centralStatus: 'applied',
        attemptCount: 2,
        createdAt: '2026-09-04T00:00:00.000Z',
        acknowledgedAt: '2026-09-04T00:00:00.300Z',
      },
    ],
    expectedEntities: [
      {
        entityType: 'patient',
        entityId: 'patient-1',
        fields: { firstName: 'Alpha', version: 1 },
      },
      {
        entityType: 'patient',
        entityId: 'patient-2',
        fields: { firstName: 'Beta', version: 1 },
      },
    ],
    actualEntities: [
      {
        entityType: 'patient',
        entityId: 'patient-1',
        fields: { firstName: 'Alpha', version: 1 },
      },
      {
        entityType: 'patient',
        entityId: 'patient-2',
        fields: { firstName: 'Beta', version: 1 },
      },
    ],
    startedAt: '2026-09-04T00:00:00.000Z',
    completedAt: '2026-09-04T00:00:00.400Z',
    cpuTimeMs: 12,
    peakMemoryBytes: 1_024,
    edgeStorageGrowthBytes: 512,
  };
}

describe('synchronization evaluation metrics', () => {
  test('calculates complete SSR, DCI, latency, retry, and throughput evidence', () => {
    const metrics = calculateSyncMetrics(completeInput());

    expect(metrics.synchronization).toEqual({
      expectedOperations: 2,
      acknowledgedOperations: 2,
      retainedUnacknowledgedOperations: 0,
      lostOperations: 0,
      transportAttempts: 3,
      retryRecoveredOperations: 1,
      ssrPercent: 100,
    });
    expect(metrics.consistency).toEqual({
      expectedDataElements: 4,
      matchingDataElements: 4,
      mismatchedDataElements: 0,
      missingEntities: 0,
      unexpectedEntities: 0,
      duplicateEntities: 0,
      dciPercent: 100,
    });
    expect(metrics.performance).toEqual({
      elapsedMs: 400,
      queueDrainMs: 300,
      throughputOperationsPerSecond: 5,
      acknowledgementLatency: {
        count: 2,
        minMs: 100,
        meanMs: 200,
        p50Ms: 100,
        p95Ms: 300,
        maxMs: 300,
      },
      cpuTimeMs: 12,
      peakMemoryBytes: 1_024,
      edgeStorageGrowthBytes: 512,
    });
  });

  test('reports retained, lost, missing, mismatched, unexpected, and duplicate data', () => {
    const input = completeInput();
    input.expectedOperations.push('op-3');
    input.operations[1] = {
      operationId: 'op-2',
      edgeStatus: 'failed',
      attemptCount: 1,
      createdAt: '2026-09-04T00:00:00.000Z',
    };
    input.actualEntities = [
      {
        entityType: 'patient',
        entityId: 'patient-1',
        fields: { firstName: 'Changed', version: 1 },
      },
      {
        entityType: 'patient',
        entityId: 'patient-1',
        fields: { firstName: 'Duplicate', version: 1 },
      },
      {
        entityType: 'patient',
        entityId: 'unexpected',
        fields: { firstName: 'Unexpected' },
      },
    ];

    const metrics = calculateSyncMetrics(input);

    expect(metrics.synchronization).toMatchObject({
      expectedOperations: 3,
      acknowledgedOperations: 1,
      retainedUnacknowledgedOperations: 1,
      lostOperations: 1,
      ssrPercent: 33.3333,
    });
    expect(metrics.consistency).toEqual({
      expectedDataElements: 4,
      matchingDataElements: 1,
      mismatchedDataElements: 3,
      missingEntities: 1,
      unexpectedEntities: 1,
      duplicateEntities: 1,
      dciPercent: 25,
    });
    expect(metrics.performance.queueDrainMs).toBeNull();
  });

  test('defines empty evaluation sets as fully synchronized and consistent', () => {
    const metrics = calculateSyncMetrics({
      expectedOperations: [],
      operations: [],
      expectedEntities: [],
      actualEntities: [],
      startedAt: '2026-09-04T00:00:00.000Z',
      completedAt: '2026-09-04T00:00:00.000Z',
    });

    expect(metrics.synchronization.ssrPercent).toBe(100);
    expect(metrics.consistency.dciPercent).toBe(100);
    expect(metrics.performance.queueDrainMs).toBe(0);
    expect(metrics.performance.acknowledgementLatency).toBeNull();
  });
});
