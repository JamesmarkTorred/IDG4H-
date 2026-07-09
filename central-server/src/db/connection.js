const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl });

async function initSchema() {
  // PROVISIONAL — schema unconfirmed (ADR 0000: audit skipped).
  // Placeholder only, proves connection works end-to-end.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _health_check (
      id SERIAL PRIMARY KEY,
      checked_at TIMESTAMPTZ NOT NULL
    );
  `);
}

module.exports = { pool, initSchema };