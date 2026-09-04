import {
  decideFault,
  getNetworkProfile,
  networkProfileNames,
} from '../evaluation/networkProfiles';

describe('deterministic network evaluation profiles', () => {
  test('exposes every required adverse-connectivity scenario', () => {
    expect(networkProfileNames).toEqual([
      'stable',
      'high-latency',
      'limited-bandwidth',
      'ack-loss',
      'intermittent',
      'central-unavailable',
      'mid-sync-interruption',
    ]);
  });

  test('stable and latency-only profiles do not inject failures', () => {
    for (const name of ['stable', 'high-latency', 'limited-bandwidth']) {
      expect(decideFault(getNetworkProfile(name), {
        operationOrdinal: 5,
        operationAttempt: 1,
        globalAttempt: 1,
        totalOperations: 10,
      })).toEqual({
        rejectBeforeForward: false,
        loseAcknowledgement: false,
      });
    }
  });

  test('ack-loss drops only selected first acknowledgements', () => {
    const profile = getNetworkProfile('ack-loss');

    expect(decideFault(profile, {
      operationOrdinal: 5,
      operationAttempt: 1,
      globalAttempt: 5,
      totalOperations: 10,
    }).loseAcknowledgement).toBe(true);
    expect(decideFault(profile, {
      operationOrdinal: 5,
      operationAttempt: 2,
      globalAttempt: 6,
      totalOperations: 10,
    }).loseAcknowledgement).toBe(false);
  });

  test('intermittent, outage, and interruption profiles recover on retry', () => {
    const cases = [
      {
        profile: 'intermittent',
        context: { operationOrdinal: 3, globalAttempt: 3 },
      },
      {
        profile: 'central-unavailable',
        context: { operationOrdinal: 1, globalAttempt: 1 },
      },
      {
        profile: 'mid-sync-interruption',
        context: { operationOrdinal: 6, globalAttempt: 6 },
      },
    ];

    for (const testCase of cases) {
      const profile = getNetworkProfile(testCase.profile);
      expect(decideFault(profile, {
        ...testCase.context,
        operationAttempt: 1,
        totalOperations: 10,
      }).rejectBeforeForward).toBe(true);
      expect(decideFault(profile, {
        ...testCase.context,
        operationAttempt: 2,
        globalAttempt: 20,
        totalOperations: 10,
      }).rejectBeforeForward).toBe(false);
    }
  });

  test('unknown profiles are rejected', () => {
    expect(() => getNetworkProfile('fabricated-network')).toThrow(
      /Unknown network profile/
    );
  });
});
