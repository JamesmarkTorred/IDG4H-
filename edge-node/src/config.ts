import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT ?? '', 10) || 4000,
  dbPath: process.env.DB_PATH || './data/edge-node.sqlite',
};

export default config;
