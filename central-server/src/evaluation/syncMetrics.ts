export type ScalarValue = string | number | boolean | null;

export interface EntitySnapshot {
  entityType: string;
  entityId: string;
  fields: Record<string, ScalarValue>;
}

export interface OperationObservation {
  operationId: string;
  edgeStatus?: string;
  centralStatus?: string;
  attemptCount?: number;
  createdAt?: string;
  acknowledgedAt?: string;
}

export interface DurationDistribution {
  count: number;
  minMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface SyncMetricInput {
  expectedOperations: string[];
  operations: OperationObservation[];
  expectedEntities: EntitySnapshot[];
  actualEntities: EntitySnapshot[];
  startedAt: string;
  completedAt: string;
  cpuTimeMs?: number;
  peakMemoryBytes?: number;
  edgeStorageGrowthBytes?: number;
}

export interface SyncMetrics {
  synchronization: {
    expectedOperations: number;
    acknowledgedOperations: number;
    retainedUnacknowledgedOperations: number;
    lostOperations: number;
    transportAttempts: number;
    retryRecoveredOperations: number;
    ssrPercent: number;
  };
  consistency: {
    expectedDataElements: number;
    matchingDataElements: number;
    mismatchedDataElements: number;
    missingEntities: number;
    unexpectedEntities: number;
    duplicateEntities: number;
    dciPercent: number;
  };
  performance: {
    elapsedMs: number;
    queueDrainMs: number | null;
    throughputOperationsPerSecond: number;
    acknowledgementLatency: DurationDistribution | null;
    cpuTimeMs?: number;
    peakMemoryBytes?: number;
    edgeStorageGrowthBytes?: number;
  };
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 100;
  }

  return Number(((numerator / denominator) * 100).toFixed(4));
}

function percentile(sorted: number[], percentileValue: number): number {
  const index = Math.max(
    0,
    Math.ceil(percentileValue * sorted.length) - 1
  );
  return sorted[index];
}

function distribution(values: number[]): DurationDistribution | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    count: sorted.length,
    minMs: sorted[0],
    meanMs: Number((total / sorted.length).toFixed(3)),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
  };
}

function entityKey(snapshot: EntitySnapshot): string {
  return `${snapshot.entityType}:${snapshot.entityId}`;
}

export function calculateSyncMetrics(input: SyncMetricInput): SyncMetrics {
  const observations = new Map(
    input.operations.map(operation => [operation.operationId, operation])
  );
  const expectedOperationIds = new Set(input.expectedOperations);
  let acknowledgedOperations = 0;
  let retainedUnacknowledgedOperations = 0;
  let lostOperations = 0;
  let transportAttempts = 0;
  let retryRecoveredOperations = 0;
  const acknowledgementLatencies: number[] = [];

  for (const operationId of expectedOperationIds) {
    const observation = observations.get(operationId);
    const acknowledged =
      observation?.edgeStatus === 'acknowledged' &&
      observation.centralStatus === 'applied';

    transportAttempts += observation?.attemptCount ?? 0;

    if (acknowledged) {
      acknowledgedOperations += 1;

      if ((observation.attemptCount ?? 0) > 1) {
        retryRecoveredOperations += 1;
      }

      if (observation.createdAt && observation.acknowledgedAt) {
        acknowledgementLatencies.push(
          Date.parse(observation.acknowledgedAt) -
          Date.parse(observation.createdAt)
        );
      }
    } else if (observation?.edgeStatus !== undefined) {
      retainedUnacknowledgedOperations += 1;
    } else if (observation?.centralStatus === undefined) {
      lostOperations += 1;
    }
  }

  const expectedEntities = new Map(
    input.expectedEntities.map(entity => [entityKey(entity), entity])
  );
  const actualEntityGroups = new Map<string, EntitySnapshot[]>();

  for (const entity of input.actualEntities) {
    const key = entityKey(entity);
    const group = actualEntityGroups.get(key) ?? [];
    group.push(entity);
    actualEntityGroups.set(key, group);
  }

  let expectedDataElements = 0;
  let matchingDataElements = 0;
  let missingEntities = 0;

  for (const [key, expected] of expectedEntities) {
    const actual = actualEntityGroups.get(key)?.[0];
    const fieldEntries = Object.entries(expected.fields);
    expectedDataElements += fieldEntries.length;

    if (!actual) {
      missingEntities += 1;
      continue;
    }

    for (const [field, expectedValue] of fieldEntries) {
      if (Object.is(actual.fields[field], expectedValue)) {
        matchingDataElements += 1;
      }
    }
  }

  let unexpectedEntities = 0;
  let duplicateEntities = 0;

  for (const [key, group] of actualEntityGroups) {
    if (!expectedEntities.has(key)) {
      unexpectedEntities += group.length;
    }

    duplicateEntities += Math.max(0, group.length - 1);
  }

  const startedAtMs = Date.parse(input.startedAt);
  const completedAtMs = Date.parse(input.completedAt);
  const elapsedMs = Math.max(0, completedAtMs - startedAtMs);
  const acknowledgementTimes = input.operations
    .map(operation => operation.acknowledgedAt)
    .filter((value): value is string => value !== undefined)
    .map(Date.parse);
  const queueDrainMs = expectedOperationIds.size === 0
    ? 0
    : acknowledgementTimes.length === expectedOperationIds.size
      ? Math.max(...acknowledgementTimes) - startedAtMs
      : null;
  const mismatchedDataElements =
    expectedDataElements - matchingDataElements;

  return {
    synchronization: {
      expectedOperations: expectedOperationIds.size,
      acknowledgedOperations,
      retainedUnacknowledgedOperations,
      lostOperations,
      transportAttempts,
      retryRecoveredOperations,
      ssrPercent: percentage(
        acknowledgedOperations,
        expectedOperationIds.size
      ),
    },
    consistency: {
      expectedDataElements,
      matchingDataElements,
      mismatchedDataElements,
      missingEntities,
      unexpectedEntities,
      duplicateEntities,
      dciPercent: percentage(
        matchingDataElements,
        expectedDataElements
      ),
    },
    performance: {
      elapsedMs,
      queueDrainMs,
      throughputOperationsPerSecond: elapsedMs === 0
        ? acknowledgedOperations
        : Number((acknowledgedOperations / (elapsedMs / 1000)).toFixed(3)),
      acknowledgementLatency: distribution(acknowledgementLatencies),
      ...(input.cpuTimeMs === undefined ? {} : { cpuTimeMs: input.cpuTimeMs }),
      ...(input.peakMemoryBytes === undefined
        ? {}
        : { peakMemoryBytes: input.peakMemoryBytes }),
      ...(input.edgeStorageGrowthBytes === undefined
        ? {}
        : { edgeStorageGrowthBytes: input.edgeStorageGrowthBytes }),
    },
  };
}
