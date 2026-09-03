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
          operation_id UUID PRIMARY KEY,
          node_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK (
            entity_type IN ('patient', 'encounter', 'observation', 'immunization')
          ),
          entity_id UUID NOT NULL,
          operation_type TEXT NOT NULL CHECK (
            operation_type IN ('create', 'update', 'delete')
          ),
          payload JSONB NOT NULL,
          status TEXT NOT NULL DEFAULT 'received'
            CHECK (status IN ('received', 'applied', 'failed')),
          received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          applied_at TIMESTAMPTZ,
          failed_at TIMESTAMPTZ,
          error_message TEXT
        );

        -- Upgrade the earlier receipt-only table without replacing any rows.
        -- Invalid legacy UUIDs abort this entire schema query; never discard them.
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = 'sync_operations'::regclass
              AND attname = 'operation_id' AND atttypid = 'text'::regtype
          ) THEN
            ALTER TABLE sync_operations
              ALTER COLUMN operation_id TYPE UUID USING operation_id::uuid;
          END IF;
          IF EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = 'sync_operations'::regclass
              AND attname = 'entity_id' AND atttypid = 'text'::regtype
          ) THEN
            ALTER TABLE sync_operations
              ALTER COLUMN entity_id TYPE UUID USING entity_id::uuid;
          END IF;
        END $$;

        ALTER TABLE sync_operations
          ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received'
            CHECK (status IN ('received', 'applied', 'failed')),
          ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS error_message TEXT;
        ALTER TABLE sync_operations DROP CONSTRAINT IF EXISTS sync_operations_payload_check;

        CREATE INDEX IF NOT EXISTS idx_sync_operations_node ON sync_operations(node_id);
        CREATE INDEX IF NOT EXISTS idx_sync_operations_entity
          ON sync_operations(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_sync_operations_status ON sync_operations(status);
        CREATE INDEX IF NOT EXISTS idx_sync_operations_received ON sync_operations(received_at);

        CREATE TABLE IF NOT EXISTS patients (
          id UUID PRIMARY KEY,

          source_system TEXT,
          source_record_id TEXT,

          originating_node_id TEXT NOT NULL,

          family_serial_no TEXT,
          phic_no TEXT,

          last_name TEXT NOT NULL,
          first_name TEXT NOT NULL,
          middle_name TEXT,
          suffix TEXT,

          birth_date DATE NOT NULL,

          sex TEXT NOT NULL
            CHECK (
              sex IN (
                'male',
                'female',
                'other',
                'unknown'
              )
            ),

          civil_status TEXT,
          place_of_birth TEXT,
          religion TEXT,
          educational_attainment TEXT,

          contact_number TEXT,

          address_line TEXT,
          purok TEXT,
          barangay TEXT,
          municipality_city TEXT,
          province TEXT,
          district TEXT,

          phic_membership_category TEXT,
          phic_membership_type TEXT,

          employment_status TEXT,
          occupation TEXT,

          spouse_name TEXT,
          spouse_birth_date DATE,
          spouse_occupation TEXT,

          member_maiden_name TEXT,
          father_name TEXT,
          family_position TEXT,

          version INTEGER NOT NULL,

          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS encounters (
          id UUID PRIMARY KEY,

          patient_id UUID NOT NULL
            REFERENCES patients(id)
            ON DELETE RESTRICT,

          source_system TEXT,
          source_record_id TEXT,

          originating_node_id TEXT NOT NULL,

          encounter_date TIMESTAMPTZ NOT NULL,
          encounter_type TEXT,

          chief_complaint TEXT,
          history_present_illness TEXT,
          assessment_plan TEXT,
          outcome TEXT,

          facility_id TEXT,
          practitioner_id TEXT,

          version INTEGER NOT NULL,

          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS observations (
          id UUID PRIMARY KEY,

          patient_id UUID NOT NULL
            REFERENCES patients(id)
            ON DELETE RESTRICT,

          encounter_id UUID
            REFERENCES encounters(id)
            ON DELETE SET NULL,

          source_system TEXT,
          source_record_id TEXT,

          originating_node_id TEXT NOT NULL,

          code TEXT NOT NULL,

          value_text TEXT,
          value_numeric DOUBLE PRECISION,
          unit TEXT,

          observed_at TIMESTAMPTZ NOT NULL,

          version INTEGER NOT NULL,

          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS immunizations (
          id UUID PRIMARY KEY,

          patient_id UUID NOT NULL
            REFERENCES patients(id)
            ON DELETE RESTRICT,

          encounter_id UUID
            REFERENCES encounters(id)
            ON DELETE SET NULL,

          source_system TEXT,
          source_record_id TEXT,

          originating_node_id TEXT NOT NULL,

          vaccine_code TEXT NOT NULL,
          vaccine_name TEXT,
          dose_label TEXT,
          administered_date TIMESTAMPTZ,

          status TEXT NOT NULL,
          remarks TEXT,

          version INTEGER NOT NULL,

          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_encounters_patient
          ON encounters(patient_id);

        CREATE INDEX IF NOT EXISTS idx_observations_patient
          ON observations(patient_id);

        CREATE INDEX IF NOT EXISTS idx_observations_encounter
          ON observations(encounter_id);

        CREATE INDEX IF NOT EXISTS idx_immunizations_patient
          ON immunizations(patient_id);

        CREATE INDEX IF NOT EXISTS idx_immunizations_encounter
          ON immunizations(encounter_id);
      `);
      return;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
