import { db } from './connection';

const rows = db
  .prepare(`
    SELECT
      operation_id,
      entity_type,
      entity_id,
      status,
      attempt_count,
      last_error
    FROM outbox
    ORDER BY created_at DESC
    LIMIT 10
  `)
  .all();

console.log(rows);

db.close();
