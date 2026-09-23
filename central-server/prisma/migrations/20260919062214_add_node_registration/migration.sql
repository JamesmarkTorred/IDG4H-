-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL,
    "node_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facility_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "registration_code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "registered_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nodes_node_id_key" ON "nodes"("node_id");

-- CreateIndex
CREATE INDEX "idx_nodes_status" ON "nodes"("status");
