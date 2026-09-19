-- CreateTable
CREATE TABLE "sync_operations" (
    "operation_id" UUID NOT NULL,
    "node_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "originating_node_id" TEXT NOT NULL,
    "family_serial_no" TEXT,
    "phic_no" TEXT,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "suffix" TEXT,
    "birth_date" DATE NOT NULL,
    "sex" TEXT NOT NULL,
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
    "spouse_birth_date" DATE,
    "spouse_occupation" TEXT,
    "member_maiden_name" TEXT,
    "father_name" TEXT,
    "family_position" TEXT,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "originating_node_id" TEXT NOT NULL,
    "encounter_date" TIMESTAMPTZ(6) NOT NULL,
    "encounter_type" TEXT,
    "chief_complaint" TEXT,
    "history_present_illness" TEXT,
    "assessment_plan" TEXT,
    "outcome" TEXT,
    "facility_id" TEXT,
    "practitioner_id" TEXT,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "originating_node_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "value_text" TEXT,
    "value_numeric" DOUBLE PRECISION,
    "unit" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "immunizations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "source_system" TEXT,
    "source_record_id" TEXT,
    "originating_node_id" TEXT NOT NULL,
    "vaccine_code" TEXT NOT NULL,
    "vaccine_name" TEXT,
    "dose_label" TEXT,
    "administered_date" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "immunizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sync_operations_node" ON "sync_operations"("node_id");

-- CreateIndex
CREATE INDEX "idx_sync_operations_entity" ON "sync_operations"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_sync_operations_status" ON "sync_operations"("status");

-- CreateIndex
CREATE INDEX "idx_sync_operations_received" ON "sync_operations"("received_at");

-- CreateIndex
CREATE INDEX "idx_encounters_patient" ON "encounters"("patient_id");

-- CreateIndex
CREATE INDEX "idx_observations_patient" ON "observations"("patient_id");

-- CreateIndex
CREATE INDEX "idx_observations_encounter" ON "observations"("encounter_id");

-- CreateIndex
CREATE INDEX "idx_immunizations_patient" ON "immunizations"("patient_id");

-- CreateIndex
CREATE INDEX "idx_immunizations_encounter" ON "immunizations"("encounter_id");

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
