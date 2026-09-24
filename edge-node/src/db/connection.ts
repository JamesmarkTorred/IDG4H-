import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

import config from '../config';

const dbDir = path.dirname(config.dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');