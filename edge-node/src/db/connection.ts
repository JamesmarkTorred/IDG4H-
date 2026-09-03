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
}

initSchema();

