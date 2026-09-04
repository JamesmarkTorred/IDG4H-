import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const edgeRoot = path.resolve(__dirname, '..');
const configuredDbPath = process.env.DB_PATH ?? 'data/edge-node.sqlite';
const env = process.env.NODE_ENV ?? 'development';
const configuredSessionTtlMs = Number.parseInt(
  process.env.AUTH_SESSION_TTL_MS ?? '',
  10
);
const secureCookieDefault = env === 'production' ? 'true' : 'false';

const config = {
  env,
  port: Number.parseInt(process.env.PORT ?? '', 10) || 4000,
  nodeId: process.env.NODE_ID ?? 'edge-local-development',
  dbPath:
    configuredDbPath === ':memory:' || path.isAbsolute(configuredDbPath)
      ? configuredDbPath
      : path.resolve(edgeRoot, configuredDbPath),
  centralServerUrl: process.env.CENTRAL_SERVER_URL ?? 'http://localhost:5000',
  syncIntervalMs:
    Number.parseInt(process.env.SYNC_INTERVAL_MS ?? '', 10) || 30_000,
  authSessionTtlMs:
    Number.isSafeInteger(configuredSessionTtlMs) && configuredSessionTtlMs > 0
      ? configuredSessionTtlMs
      : 8 * 60 * 60 * 1000,
  authCookieSecure:
    (process.env.AUTH_COOKIE_SECURE ?? secureCookieDefault).toLowerCase() ===
    'true',
};

export default config;
