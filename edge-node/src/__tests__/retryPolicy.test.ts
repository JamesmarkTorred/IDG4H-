import { ExponentialBackoffRetryPolicy } from '../sync/retryPolicy';

describe('ExponentialBackoffRetryPolicy', () => {
  test.each([
    [0, 5_000],
    [1, 5_000],
    [2, 10_000],
    [3, 20_000],
    [4, 40_000],
    [6, 160_000],
    [7, 300_000],
    [8, 300_000],
    [10_000, 300_000],
  ])('attempt %i schedules a delay of %i ms', (attemptCount, delayMs) => {
    const policy = new ExponentialBackoffRetryPolicy();
    const now = new Date('2026-09-03T08:00:00.000Z');
    const next = policy.calculateNextAttempt(attemptCount, now);

    expect(next.getTime() - now.getTime()).toBe(delayMs);
    expect(now.toISOString()).toBe('2026-09-03T08:00:00.000Z');
  });

  test('supports custom base delay and maximum delay', () => {
    const policy = new ExponentialBackoffRetryPolicy(1_000, 3_000);
    const now = new Date('2026-09-03T08:00:00.000Z');

    expect(policy.calculateNextAttempt(1, now).getTime() - now.getTime()).toBe(1_000);
    expect(policy.calculateNextAttempt(2, now).getTime() - now.getTime()).toBe(2_000);
    expect(policy.calculateNextAttempt(3, now).getTime() - now.getTime()).toBe(3_000);
  });
});
