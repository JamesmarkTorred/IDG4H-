const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  databaseUrl: process.env.DATABASE_URL,
};

module.exports = config;