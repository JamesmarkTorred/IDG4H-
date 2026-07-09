const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl });

async function initSchema(retries = 3, delayMs = 1000) {
  // PROVISIONAL — schema unconfirmed (ADR 0000: audit skipped).
  // Placeholder only, proves connection works end-to-end.
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _health_check (
          id SERIAL PRIMARY KEY,
          checked_at TIMESTAMPTZ NOT NULL
        );
      `);
      return;
    } catch (err) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) throw err;
      // Likely a transient race during Postgres container startup (common in CI) — retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { pool, initSchema };