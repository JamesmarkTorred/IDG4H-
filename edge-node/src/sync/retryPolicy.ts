export interface RetryPolicy {
  calculateNextAttempt(
    attemptCount: number,
    now?: Date
  ): Date;
}

export class ExponentialBackoffRetryPolicy
  implements RetryPolicy
{
  constructor(
    private readonly baseDelayMs = 5_000,
    private readonly maxDelayMs = 5 * 60_000
  ) {}

  calculateNextAttempt(
    attemptCount: number,
    now = new Date()
  ): Date {
    const exponent = Math.max(
      attemptCount - 1,
      0
    );

    const delay = Math.min(
      this.baseDelayMs * 2 ** exponent,
      this.maxDelayMs
    );

    return new Date(
      now.getTime() + delay
    );
  }
}
