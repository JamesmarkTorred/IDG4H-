export const networkProfileNames = [
  'stable',
  'high-latency',
  'limited-bandwidth',
  'ack-loss',
  'intermittent',
  'central-unavailable',
  'mid-sync-interruption',
] as const;

export type NetworkProfileName = typeof networkProfileNames[number];

export interface NetworkProfile {
  name: NetworkProfileName;
  description: string;
  fixedLatencyMs: number;
  bandwidthBytesPerSecond?: number;
  rejectInitialRequests?: number;
  rejectFirstAttemptEvery?: number;
  loseAcknowledgementEvery?: number;
  rejectFirstAttemptAfterFraction?: number;
}

const profiles: Record<NetworkProfileName, NetworkProfile> = {
  stable: {
    name: 'stable',
    description: 'Loopback transport without injected impairment.',
    fixedLatencyMs: 0,
  },
  'high-latency': {
    name: 'high-latency',
    description: 'Adds 250 ms before each request reaches Central.',
    fixedLatencyMs: 250,
  },
  'limited-bandwidth': {
    name: 'limited-bandwidth',
    description: 'Throttles request transfer to 16 KiB/s.',
    fixedLatencyMs: 25,
    bandwidthBytesPerSecond: 16 * 1024,
  },
  'ack-loss': {
    name: 'ack-loss',
    description: 'Drops every fifth first acknowledgement after Central commits.',
    fixedLatencyMs: 25,
    loseAcknowledgementEvery: 5,
  },
  intermittent: {
    name: 'intermittent',
    description: 'Rejects the first delivery of every third operation.',
    fixedLatencyMs: 50,
    rejectFirstAttemptEvery: 3,
  },
  'central-unavailable': {
    name: 'central-unavailable',
    description: 'Rejects the first five transport requests before recovering.',
    fixedLatencyMs: 25,
    rejectInitialRequests: 5,
  },
  'mid-sync-interruption': {
    name: 'mid-sync-interruption',
    description: 'Interrupts first delivery after half of the queue has drained.',
    fixedLatencyMs: 25,
    rejectFirstAttemptAfterFraction: 0.5,
  },
};

export function getNetworkProfile(name: string): NetworkProfile {
  if (!networkProfileNames.includes(name as NetworkProfileName)) {
    throw new Error(
      `Unknown network profile ${name}. Expected one of: ${networkProfileNames.join(', ')}.`
    );
  }

  return profiles[name as NetworkProfileName];
}

export interface FaultContext {
  operationOrdinal: number;
  operationAttempt: number;
  globalAttempt: number;
  totalOperations: number;
}

export interface FaultDecision {
  rejectBeforeForward: boolean;
  loseAcknowledgement: boolean;
}

export function decideFault(
  profile: NetworkProfile,
  context: FaultContext
): FaultDecision {
  const rejectForInitialOutage =
    profile.rejectInitialRequests !== undefined &&
    context.globalAttempt <= profile.rejectInitialRequests;
  const rejectForIntermittence =
    profile.rejectFirstAttemptEvery !== undefined &&
    context.operationAttempt === 1 &&
    context.operationOrdinal % profile.rejectFirstAttemptEvery === 0;
  const interruptionThreshold = profile.rejectFirstAttemptAfterFraction ===
    undefined
    ? undefined
    : Math.floor(
        context.totalOperations * profile.rejectFirstAttemptAfterFraction
      );
  const rejectForInterruption =
    interruptionThreshold !== undefined &&
    context.operationAttempt === 1 &&
    context.operationOrdinal > interruptionThreshold;
  const loseAcknowledgement =
    profile.loseAcknowledgementEvery !== undefined &&
    context.operationAttempt === 1 &&
    context.operationOrdinal % profile.loseAcknowledgementEvery === 0;

  return {
    rejectBeforeForward:
      rejectForInitialOutage ||
      rejectForIntermittence ||
      rejectForInterruption,
    loseAcknowledgement,
  };
}
