import { ExponentialBackoffRetryPolicy } from './retryPolicy';
import { HttpSyncTransport } from './httpSyncTransport';
import { SyncEngine } from './syncEngine';
import { db } from '../db/connection';

async function main(): Promise<void> {
  const engine = new SyncEngine(
    new HttpSyncTransport(),
    new ExponentialBackoffRetryPolicy()
  );

  const recovered = engine.recoverStaleOperations();
  console.log(`[sync] recovered ${recovered} stale operation(s)`);

  const result = await engine.runOnce();
  console.log(`[sync] attempted=${result.attempted}`);
  console.log(`[sync] acknowledged=${result.acknowledged}`);
  console.log(`[sync] failed=${result.failed}`);
}

main()
  .catch((error) => {
    console.error('[sync] fatal error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
