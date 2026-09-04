import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const edgeRoot = path.resolve(__dirname, '..');
const configuredDbPath = process.env.DB_PATH ?? 'data/edge-node.sqlite';

const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '', 10) || 4000,
  nodeId: process.env.NODE_ID ?? 'edge-local-development',
  dbPath:
    configuredDbPath === ':memory:' || path.isAbsolute(configuredDbPath)
      ? configuredDbPath
      : path.resolve(edgeRoot, configuredDbPath),
  centralServerUrl: process.env.CENTRAL_SERVER_URL ?? 'http://localhost:5000',
  syncIntervalMs:
    Number.parseInt(process.env.SYNC_INTERVAL_MS ?? '', 10) || 30_000,
};

export default config;
