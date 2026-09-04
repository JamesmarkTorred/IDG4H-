import type { SyncEngine } from './syncEngine';

export interface SyncWorkerLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

type WorkerEngine = Pick<
  SyncEngine,
  'recoverStaleOperations' | 'runOnce'
>;

export class SyncWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = true;
  private activeCycle?: Promise<void>;

  constructor(
    private readonly engine: WorkerEngine,
    private readonly intervalMs: number,
    private readonly logger: SyncWorkerLogger = console
  ) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error('Sync worker interval must be greater than zero.');
    }
  }

  async start(): Promise<void> {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;

    const recovered = this.engine.recoverStaleOperations();
    this.logger.info(
      `[sync-worker] recovered ${recovered} stale operation(s)`
    );

    await this.runCycle();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    await this.activeCycle;
    this.logger.info('[sync-worker] stopped');
  }

  private scheduleNext(): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;

      void this.runCycle().then(() => {
        this.scheduleNext();
      });
    }, this.intervalMs);
  }

  private runCycle(): Promise<void> {
    if (this.stopped || this.running) {
      return Promise.resolve();
    }

    this.running = true;

    const cycle = (async () => {
      try {
        const result = await this.engine.runOnce();

        if (result.attempted > 0) {
          this.logger.info(
            `[sync-worker] attempted=${result.attempted} acknowledged=${result.acknowledged} failed=${result.failed}`
          );
        }
      } catch (error) {
        this.logger.error(
          '[sync-worker] synchronization cycle failed',
          error
        );
      } finally {
        this.running = false;
      }
    })();

    this.activeCycle = cycle;

    return cycle.finally(() => {
      if (this.activeCycle === cycle) {
        this.activeCycle = undefined;
      }
    });
  }
}
