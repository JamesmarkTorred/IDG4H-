import { Pool } from 'pg';
import config from '../config';

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function initSchema(retries = 3, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _health_check (
          id SERIAL PRIMARY KEY,
          checked_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_operations (
          operation_id TEXT PRIMARY KEY,
          node_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK (
            entity_type IN ('patient', 'encounter', 'observation', 'immunization')
          ),
          entity_id TEXT NOT NULL,
          operation_type TEXT NOT NULL CHECK (
            operation_type IN ('create', 'update', 'delete')
          ),
          payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
          received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_sync_operations_node_received
          ON sync_operations(node_id, received_at);
        CREATE INDEX IF NOT EXISTS idx_sync_operations_entity
          ON sync_operations(entity_type, entity_id);
      `);
      return;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

