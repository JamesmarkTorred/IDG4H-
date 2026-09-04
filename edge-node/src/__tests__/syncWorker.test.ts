import type { SyncRunResult } from '../sync/syncEngine';
import { SyncWorker } from '../sync/syncWorker';

const emptyResult: SyncRunResult = {
  attempted: 0,
  acknowledged: 0,
  failed: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe('SyncWorker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createLogger() {
    return {
      info: jest.fn<void, [string]>(),
      error: jest.fn<void, [string, unknown?]>(),
    };
  }

  test('executes a synchronization cycle immediately on startup', async () => {
    const engine = {
      recoverStaleOperations: jest.fn(() => 0),
      runOnce: jest.fn(async (): Promise<SyncRunResult> => ({
        attempted: 2,
        acknowledged: 2,
        failed: 0,
      })),
    };
    const logger = createLogger();
    const worker = new SyncWorker(engine, 1_000, logger);

    await worker.start();

    expect(engine.runOnce).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      '[sync-worker] attempted=2 acknowledged=2 failed=0'
    );
    await worker.stop();
  });

  test('recovers stale operations once when it starts', async () => {
    const engine = {
      recoverStaleOperations: jest.fn(() => 3),
      runOnce: jest.fn(async () => emptyResult),
    };
    const logger = createLogger();
    const worker = new SyncWorker(engine, 1_000, logger);

    await worker.start();
    await worker.start();

    expect(engine.recoverStaleOperations).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      '[sync-worker] recovered 3 stale operation(s)'
    );
    await worker.stop();
  });

  test('schedules the next cycle only after the active cycle finishes', async () => {
    const slowCycle = deferred<SyncRunResult>();
    const engine = {
      recoverStaleOperations: jest.fn(() => 0),
      runOnce: jest
        .fn<Promise<SyncRunResult>, []>()
        .mockResolvedValueOnce(emptyResult)
        .mockReturnValueOnce(slowCycle.promise)
        .mockResolvedValue(emptyResult),
    };
    const worker = new SyncWorker(engine, 100, createLogger());
    await worker.start();

    jest.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(engine.runOnce).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1_000);
    await flushMicrotasks();
    expect(engine.runOnce).toHaveBeenCalledTimes(2);

    slowCycle.resolve(emptyResult);
    await flushMicrotasks();
    jest.advanceTimersByTime(99);
    await flushMicrotasks();
    expect(engine.runOnce).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(engine.runOnce).toHaveBeenCalledTimes(3);
    await worker.stop();
  });

  test('continues scheduling after an unexpected failed cycle', async () => {
    const failure = new Error('Synthetic cycle failure');
    const engine = {
      recoverStaleOperations: jest.fn(() => 0),
      runOnce: jest
        .fn<Promise<SyncRunResult>, []>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue(emptyResult),
    };
    const logger = createLogger();
    const worker = new SyncWorker(engine, 100, logger);

    await worker.start();
    expect(logger.error).toHaveBeenCalledWith(
      '[sync-worker] synchronization cycle failed',
      failure
    );

    jest.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(engine.runOnce).toHaveBeenCalledTimes(2);
    await worker.stop();
  });

  test('stop clears the timer and prevents future cycles', async () => {
    const engine = {
      recoverStaleOperations: jest.fn(() => 0),
      runOnce: jest.fn(async () => emptyResult),
    };
    const worker = new SyncWorker(engine, 100, createLogger());

    await worker.start();
    await worker.stop();
    jest.advanceTimersByTime(1_000);
    await flushMicrotasks();

    expect(engine.runOnce).toHaveBeenCalledTimes(1);
  });

  test('stop waits for an active synchronization cycle', async () => {
    const activeCycle = deferred<SyncRunResult>();
    const engine = {
      recoverStaleOperations: jest.fn(() => 0),
      runOnce: jest.fn(() => activeCycle.promise),
    };
    const logger = createLogger();
    const worker = new SyncWorker(engine, 100, logger);

    const starting = worker.start();
    await flushMicrotasks();

    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await flushMicrotasks();
    expect(stopped).toBe(false);

    activeCycle.resolve(emptyResult);
    await starting;
    await stopping;

    expect(stopped).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('[sync-worker] stopped');
    jest.advanceTimersByTime(1_000);
    expect(engine.runOnce).toHaveBeenCalledTimes(1);
  });
});
