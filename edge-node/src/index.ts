import app from "./app";
import config from "./config";
import { db } from "./db/connection";
import { HttpSyncTransport } from "./sync/httpSyncTransport";
import { ExponentialBackoffRetryPolicy } from "./sync/retryPolicy";
import { SyncEngine } from "./sync/syncEngine";
import { SyncWorker } from "./sync/syncWorker";

const syncEngine = new SyncEngine(
  new HttpSyncTransport(),
  new ExponentialBackoffRetryPolicy(),
);

const syncWorker = new SyncWorker(syncEngine, config.syncIntervalMs);

const server = app.listen(config.port, () => {
  console.log(`[edge-node] listening on port ${config.port}`);
  console.log(
    `[edge-node] docs available at http://localhost:${config.port}/api-docs`,
  );

  void syncWorker.start().catch((error) => {
    console.error("[sync-worker] failed to start", error);
  });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[edge-node] received ${signal}, shutting down`);

  const serverClosed = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  await syncWorker.stop();
  await serverClosed;
  db.close();

  process.exit(0);
}

function requestShutdown(signal: string): void {
  void shutdown(signal).catch((error) => {
    console.error("[edge-node] shutdown failed", error);
    process.exit(1);
  });
}

process.once("SIGINT", () => requestShutdown("SIGINT"));
process.once("SIGTERM", () => requestShutdown("SIGTERM"));
