import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT ?? '', 10) || 4000,
  nodeId: process.env.NODE_ID ?? 'edge-local-development',
  dbPath: process.env.DB_PATH || './data/edge-node.sqlite',
};

export default config;
