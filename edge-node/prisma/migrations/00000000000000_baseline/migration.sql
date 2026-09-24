-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "node_id" TEXT NOT NULL,
    "family_serial_no" TEXT,
    "phic_no" TEXT,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "suffix" TEXT,
    "birth_date" TEXT NOT NULL,
    "sex" TEXT NOT NULL CHECK ("sex" IN ('male', 'female', 'other', 'unknown')),
    "civil_status" TEXT,
    "place_of_birth" TEXT,
    "religion" TEXT,
    "educational_attainment" TEXT,
    "contact_number" TEXT,
    "address_line" TEXT,
    "purok" TEXT,
    "barangay" TEXT,
    "municipality_city" TEXT,
    "province" TEXT,
    "district" TEXT,
    "phic_membership_category" TEXT,
    "phic_membership_type" TEXT,
    "employment_status" TEXT,
    "occupation" TEXT,
    "spouse_name" TEXT,
    "spouse_birth_date" TEXT,
    "spouse_occupation" TEXT,
    "member_maiden_name" TEXT,
    "father_name" TEXT,
    "family_position" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patient_id" TEXT NOT NULL,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "node_id" TEXT NOT NULL,
    "encounter_date" TEXT NOT NULL,
    "encounter_type" TEXT,
    "chief_complaint" TEXT,
    "history_present_illness" TEXT,
    "assessment_plan" TEXT,
    "outcome" TEXT,
    "facility_id" TEXT,
    "practitioner_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "encounters_patient_id_fkey"
        FOREIGN KEY ("patient_id") REFERENCES "patients" ("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patient_id" TEXT NOT NULL,
    "encounter_id" TEXT,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "node_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "value_text" TEXT,
    "value_numeric" REAL,
    "unit" TEXT,
    "observed_at" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "observations_encounter_id_fkey"
        FOREIGN KEY ("encounter_id") REFERENCES "encounters" ("id")
        ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "observations_patient_id_fkey"
        FOREIGN KEY ("patient_id") REFERENCES "patients" ("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "immunizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patient_id" TEXT NOT NULL,
    "encounter_id" TEXT,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "node_id" TEXT NOT NULL,
    "vaccine_code" TEXT NOT NULL,
    "vaccine_name" TEXT,
    "dose_label" TEXT,
    "administered_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "remarks" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "immunizations_encounter_id_fkey"
        FOREIGN KEY ("encounter_id") REFERENCES "encounters" ("id")
        ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "immunizations_patient_id_fkey"
        FOREIGN KEY ("patient_id") REFERENCES "patients" ("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_system" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL
        CHECK ("file_type" IN ('csv', 'xlsx')),
    "status" TEXT NOT NULL
        CHECK ("status" IN (
            'processing',
            'completed',
            'completed_with_issues',
            'failed'
        )),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "candidate_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "started_at" TEXT NOT NULL,
    "completed_at" TEXT,
    "error_message" TEXT
);

-- CreateTable
CREATE TABLE "import_row_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "import_job_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL
        CHECK ("status" IN ('imported', 'candidate', 'rejected')),
    "source_record_id" TEXT,
    "entity_type" TEXT,
    "local_entity_id" TEXT,
    "raw_data" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "import_row_results_import_job_id_fkey"
        FOREIGN KEY ("import_job_id") REFERENCES "import_jobs" ("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL
        CHECK ("entity_type" IN (
            'patient',
            'encounter',
            'observation',
            'immunization'
        )),
    "entity_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL
        CHECK ("operation_type" IN ('create', 'update', 'delete')),
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending'
        CHECK ("status" IN (
            'pending',
            'processing',
            'failed',
            'acknowledged'
        )),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TEXT,
    "last_attempt_at" TEXT,
    "last_error" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "acknowledged_at" TEXT
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL COLLATE NOCASE UNIQUE,
    "password_hash" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1
        CHECK ("is_active" IN (0, 1)),
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "permission_key" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "role_id"),

    CONSTRAINT "user_roles_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,

    CONSTRAINT "user_roles_role_id_fkey"
        FOREIGN KEY ("role_id") REFERENCES "roles" ("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    PRIMARY KEY ("role_id", "permission_id"),

    CONSTRAINT "role_permissions_role_id_fkey"
        FOREIGN KEY ("role_id") REFERENCES "roles" ("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,

    CONSTRAINT "role_permissions_permission_id_fkey"
        FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "last_seen_at" TEXT NOT NULL,
    "revoked_at" TEXT,
    CONSTRAINT "auth_sessions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "idx_patients_birth_date"
    ON "patients"("birth_date");

CREATE INDEX "idx_patients_name_birthdate"
    ON "patients"("last_name", "first_name", "birth_date");

CREATE INDEX "idx_patients_family_serial_no"
    ON "patients"("family_serial_no");

CREATE INDEX "idx_patients_phic_no"
    ON "patients"("phic_no");

-- Partial unique source-record index
CREATE UNIQUE INDEX "idx_patients_source_record"
    ON "patients"("source_system", "source_record_id")
    WHERE "source_system" IS NOT NULL
      AND "source_record_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_encounters_patient_date"
    ON "encounters"("patient_id", "encounter_date");

CREATE INDEX "idx_encounters_date"
    ON "encounters"("encounter_date");

CREATE INDEX "idx_encounters_patient"
    ON "encounters"("patient_id");

CREATE UNIQUE INDEX "idx_encounters_source_record"
    ON "encounters"("source_system", "source_record_id")
    WHERE "source_system" IS NOT NULL
      AND "source_record_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_observations_patient_code"
    ON "observations"("patient_id", "code");

CREATE INDEX "idx_observations_code"
    ON "observations"("code");

CREATE INDEX "idx_observations_encounter"
    ON "observations"("encounter_id");

CREATE INDEX "idx_observations_patient"
    ON "observations"("patient_id");

CREATE UNIQUE INDEX "idx_observations_source_record"
    ON "observations"("source_system", "source_record_id")
    WHERE "source_system" IS NOT NULL
      AND "source_record_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_immunizations_patient_vaccine"
    ON "immunizations"("patient_id", "vaccine_code");

CREATE INDEX "idx_immunizations_vaccine"
    ON "immunizations"("vaccine_code");

CREATE INDEX "idx_immunizations_encounter"
    ON "immunizations"("encounter_id");

CREATE INDEX "idx_immunizations_patient"
    ON "immunizations"("patient_id");

CREATE UNIQUE INDEX "idx_immunizations_source_record"
    ON "immunizations"("source_system", "source_record_id")
    WHERE "source_system" IS NOT NULL
      AND "source_record_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_import_jobs_source"
    ON "import_jobs"("source_system");

CREATE INDEX "idx_import_jobs_status"
    ON "import_jobs"("status");

CREATE INDEX "idx_import_rows_status"
    ON "import_row_results"("status");

CREATE INDEX "idx_import_rows_job"
    ON "import_row_results"("import_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_operation_id_key"
    ON "outbox"("operation_id");

CREATE INDEX "idx_outbox_created_at"
    ON "outbox"("created_at");

CREATE INDEX "idx_outbox_entity"
    ON "outbox"("entity_type", "entity_id");

CREATE INDEX "idx_outbox_next_attempt"
    ON "outbox"("next_attempt_at");

CREATE INDEX "idx_outbox_status"
    ON "outbox"("status");

-- users.username already has inline NOCASE UNIQUE

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key"
    ON "roles"("name");

CREATE UNIQUE INDEX "permissions_permission_key_key"
    ON "permissions"("permission_key");

CREATE UNIQUE INDEX "auth_sessions_token_hash_key"
    ON "auth_sessions"("token_hash");

CREATE INDEX "idx_auth_sessions_expires"
    ON "auth_sessions"("expires_at");

CREATE INDEX "idx_auth_sessions_user"
    ON "auth_sessions"("user_id");