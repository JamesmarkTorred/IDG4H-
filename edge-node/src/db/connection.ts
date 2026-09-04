import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import config from '../config';

// Ensure the data directory exists before SQLite tries to write there
const dbDir = path.dirname(config.dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);

// SQLite configuration
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface SchemaColumn {
  name: string;
}

function migrateLegacyImportAccounting(): void {
  const columns = db
    .prepare('PRAGMA table_info(import_jobs)')
    .all() as SchemaColumn[];

  if (!columns.some(column => column.name === 'successful_rows')) {
    return;
  }

  db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE import_row_results
          RENAME TO import_row_results_legacy;

        ALTER TABLE import_jobs
          RENAME TO import_jobs_legacy;

        CREATE TABLE import_jobs (
          id TEXT PRIMARY KEY,
          source_system TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_type TEXT NOT NULL
            CHECK (file_type IN ('csv', 'xlsx')),
          status TEXT NOT NULL
            CHECK (
              status IN (
                'processing',
                'completed',
                'completed_with_issues',
                'failed'
              )
            ),
          total_rows INTEGER NOT NULL DEFAULT 0,
          imported_rows INTEGER NOT NULL DEFAULT 0,
          candidate_rows INTEGER NOT NULL DEFAULT 0,
          failed_rows INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          error_message TEXT
        );

        CREATE TABLE import_row_results (
          id TEXT PRIMARY KEY,
          import_job_id TEXT NOT NULL,
          row_number INTEGER NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('imported', 'candidate', 'rejected')),
          source_record_id TEXT,
          entity_type TEXT,
          local_entity_id TEXT,
          raw_data TEXT NOT NULL,
          error_message TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (import_job_id)
            REFERENCES import_jobs(id)
            ON DELETE CASCADE
        );

        INSERT INTO import_jobs (
          id,
          source_system,
          file_name,
          file_type,
          status,
          total_rows,
          imported_rows,
          candidate_rows,
          failed_rows,
          started_at,
          completed_at,
          error_message
        )
        SELECT
          job.id,
          job.source_system,
          job.file_name,
          job.file_type,
          CASE
            WHEN job.status = 'completed_with_errors'
              THEN 'completed_with_issues'
            ELSE job.status
          END,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM import_row_results_legacy result
              WHERE result.import_job_id = job.id
            )
              THEN (
                SELECT COUNT(*)
                FROM import_row_results_legacy result
                WHERE result.import_job_id = job.id
              )
            ELSE job.total_rows
          END,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM import_row_results_legacy result
              WHERE result.import_job_id = job.id
            )
              THEN (
                SELECT COUNT(*)
                FROM import_row_results_legacy result
                WHERE result.import_job_id = job.id
                  AND result.status = 'imported'
              )
            ELSE job.successful_rows
          END,
          (
            SELECT COUNT(*)
            FROM import_row_results_legacy result
            WHERE result.import_job_id = job.id
              AND result.status = 'candidate'
          ),
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM import_row_results_legacy result
              WHERE result.import_job_id = job.id
            )
              THEN (
                SELECT COUNT(*)
                FROM import_row_results_legacy result
                WHERE result.import_job_id = job.id
                  AND result.status = 'rejected'
              )
            ELSE job.failed_rows
          END,
          job.started_at,
          job.completed_at,
          job.error_message
        FROM import_jobs_legacy job;

        INSERT INTO import_row_results (
          id,
          import_job_id,
          row_number,
          status,
          source_record_id,
          entity_type,
          local_entity_id,
          raw_data,
          error_message,
          created_at
        )
        SELECT
          id,
          import_job_id,
          row_number,
          status,
          source_record_id,
          entity_type,
          local_entity_id,
          raw_data,
          error_message,
          created_at
        FROM import_row_results_legacy;

        DROP TABLE import_row_results_legacy;
        DROP TABLE import_jobs_legacy;

        CREATE INDEX idx_import_jobs_status
          ON import_jobs(status);

        CREATE INDEX idx_import_jobs_source
          ON import_jobs(source_system);

        CREATE INDEX idx_import_rows_job
          ON import_row_results(import_job_id);

        CREATE INDEX idx_import_rows_status
          ON import_row_results(status);
      `);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[];

  if (foreignKeyErrors.length > 0) {
    throw new Error('Import accounting migration produced invalid foreign keys.');
  }
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,

      -- Source / provenance
      source_system TEXT,
      source_record_id TEXT,
      node_id TEXT NOT NULL,

      -- City Health ITR identifiers
      family_serial_no TEXT,
      phic_no TEXT,

      -- Patient name
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      suffix TEXT,

      -- Demographic information
      birth_date TEXT NOT NULL,
      sex TEXT NOT NULL CHECK (
        sex IN ('male', 'female', 'other', 'unknown')
      ),
      civil_status TEXT,
      place_of_birth TEXT,
      religion TEXT,
      educational_attainment TEXT,

      -- Contact and address
      contact_number TEXT,
      address_line TEXT,
      purok TEXT,
      barangay TEXT,
      municipality_city TEXT,
      province TEXT,
      district TEXT,

      -- PHIC / membership information
      phic_membership_category TEXT,
      phic_membership_type TEXT,

      -- Employment
      employment_status TEXT,
      occupation TEXT,

      -- Family information from ITR
      spouse_name TEXT,
      spouse_birth_date TEXT,
      spouse_occupation TEXT,
      member_maiden_name TEXT,
      father_name TEXT,
      family_position TEXT,

      -- Synchronization metadata
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,

      -- Relationship
      patient_id TEXT NOT NULL,

      -- Source / provenance
      source_system TEXT,
      source_record_id TEXT,
      node_id TEXT NOT NULL,

      -- Encounter information
      encounter_date TEXT NOT NULL,
      encounter_type TEXT,

      chief_complaint TEXT,
      history_present_illness TEXT,
      assessment_plan TEXT,
      outcome TEXT,

      -- Facility / personnel references
      facility_id TEXT,
      practitioner_id TEXT,

      -- Synchronization metadata
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (patient_id)
        REFERENCES patients(id)
        ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,

      -- Relationships
      patient_id TEXT NOT NULL,
      encounter_id TEXT,

      -- Source / provenance
      source_system TEXT,
      source_record_id TEXT,
      node_id TEXT NOT NULL,

      -- Observation content
      code TEXT NOT NULL,
      value_text TEXT,
      value_numeric REAL,
      unit TEXT,

      observed_at TEXT NOT NULL,

      -- Synchronization metadata
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (patient_id)
        REFERENCES patients(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (encounter_id)
        REFERENCES encounters(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS immunizations (
      id TEXT PRIMARY KEY,

      -- Relationships
      patient_id TEXT NOT NULL,
      encounter_id TEXT,

      -- Source / provenance
      source_system TEXT,
      source_record_id TEXT,
      node_id TEXT NOT NULL,

      -- Immunization information
      vaccine_code TEXT NOT NULL,
      vaccine_name TEXT,
      dose_label TEXT,
      administered_date TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      remarks TEXT,

      -- Synchronization metadata
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (patient_id)
        REFERENCES patients(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (encounter_id)
        REFERENCES encounters(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL UNIQUE,

      node_id TEXT NOT NULL,

      entity_type TEXT NOT NULL
        CHECK (
          entity_type IN (
            'patient',
            'encounter',
            'observation',
            'immunization'
          )
        ),

      entity_id TEXT NOT NULL,

      operation_type TEXT NOT NULL
        CHECK (
          operation_type IN (
            'create',
            'update',
            'delete'
          )
        ),

      payload TEXT NOT NULL,

      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
          status IN (
            'pending',
            'processing',
            'failed',
            'acknowledged'
          )
        ),

      attempt_count INTEGER NOT NULL DEFAULT 0,

      next_attempt_at TEXT,
      last_attempt_at TEXT,
      last_error TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      acknowledged_at TEXT
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,

      source_system TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL
        CHECK (file_type IN ('csv', 'xlsx')),

      status TEXT NOT NULL
        CHECK (
          status IN (
            'processing',
            'completed',
            'completed_with_issues',
            'failed'
          )
        ),

      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      candidate_rows INTEGER NOT NULL DEFAULT 0,
      failed_rows INTEGER NOT NULL DEFAULT 0,

      started_at TEXT NOT NULL,
      completed_at TEXT,

      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS import_row_results (
      id TEXT PRIMARY KEY,

      import_job_id TEXT NOT NULL,
      row_number INTEGER NOT NULL,

      status TEXT NOT NULL
        CHECK (
          status IN (
            'imported',
            'candidate',
            'rejected'
          )
        ),

      source_record_id TEXT,
      entity_type TEXT,

      local_entity_id TEXT,

      raw_data TEXT NOT NULL,
      error_message TEXT,

      created_at TEXT NOT NULL,

      FOREIGN KEY (import_job_id)
        REFERENCES import_jobs(id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_status
      ON outbox(status);

    CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt
      ON outbox(next_attempt_at);

    CREATE INDEX IF NOT EXISTS idx_outbox_entity
      ON outbox(entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_outbox_created_at
      ON outbox(created_at);

    CREATE INDEX IF NOT EXISTS idx_import_jobs_status
      ON import_jobs(status);

    CREATE INDEX IF NOT EXISTS idx_import_jobs_source
      ON import_jobs(source_system);

    CREATE INDEX IF NOT EXISTS idx_import_rows_job
      ON import_row_results(import_job_id);

    CREATE INDEX IF NOT EXISTS idx_import_rows_status
      ON import_row_results(status);

    -- Patient indexes
    CREATE INDEX IF NOT EXISTS idx_patients_phic_no
      ON patients(phic_no);

    CREATE INDEX IF NOT EXISTS idx_patients_family_serial_no
      ON patients(family_serial_no);

    CREATE INDEX IF NOT EXISTS idx_patients_name_birthdate
      ON patients(last_name, first_name, birth_date);

    CREATE INDEX IF NOT EXISTS idx_patients_birth_date
      ON patients(birth_date);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_source_record
      ON patients(source_system, source_record_id)
      WHERE source_system IS NOT NULL
        AND source_record_id IS NOT NULL;

    -- Encounter indexes
    CREATE INDEX IF NOT EXISTS idx_encounters_patient
      ON encounters(patient_id);

    CREATE INDEX IF NOT EXISTS idx_encounters_date
      ON encounters(encounter_date);

    CREATE INDEX IF NOT EXISTS idx_encounters_patient_date
      ON encounters(patient_id, encounter_date);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_encounters_source_record
      ON encounters(source_system, source_record_id)
      WHERE source_system IS NOT NULL
        AND source_record_id IS NOT NULL;

    -- Observation indexes
    CREATE INDEX IF NOT EXISTS idx_observations_patient
      ON observations(patient_id);

    CREATE INDEX IF NOT EXISTS idx_observations_encounter
      ON observations(encounter_id);

    CREATE INDEX IF NOT EXISTS idx_observations_code
      ON observations(code);

    CREATE INDEX IF NOT EXISTS idx_observations_patient_code
      ON observations(patient_id, code);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_source_record
      ON observations(source_system, source_record_id)
      WHERE source_system IS NOT NULL
        AND source_record_id IS NOT NULL;

    -- Immunization indexes
    CREATE INDEX IF NOT EXISTS idx_immunizations_patient
      ON immunizations(patient_id);

    CREATE INDEX IF NOT EXISTS idx_immunizations_encounter
      ON immunizations(encounter_id);

    CREATE INDEX IF NOT EXISTS idx_immunizations_vaccine
      ON immunizations(vaccine_code);

    CREATE INDEX IF NOT EXISTS idx_immunizations_patient_vaccine
      ON immunizations(patient_id, vaccine_code);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_immunizations_source_record
      ON immunizations(source_system, source_record_id)
      WHERE source_system IS NOT NULL
        AND source_record_id IS NOT NULL;
  `);

  migrateLegacyImportAccounting();
}

initSchema();

