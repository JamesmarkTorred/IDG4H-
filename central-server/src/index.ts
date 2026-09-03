import app from './app';
import config from './config';
import { initSchema } from './db/connection';

async function start(): Promise<void> {
  try {
    await initSchema();
    app.listen(config.port, () => {
      console.log(`[central-server] listening on port ${config.port}`);
      console.log(`[central-server] docs at http://localhost:${config.port}/api-docs`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[central-server] failed to initialize schema:', message);
    process.exit(1);
  }
}

void start();
