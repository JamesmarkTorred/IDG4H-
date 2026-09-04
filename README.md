# IDG4H — Integrated Data Gateway for Health

> Offline-first data gateway that syncs edge-collected health records (SQLite) with a central FHIR-compliant registry (PostgreSQL) via CRDT-based sync — built for low-connectivity clinic environments.

[![Test Suite](https://github.com/zabdeilmercado/idg4h/actions/workflows/test.yml/badge.svg)](https://github.com/zabdeilmercado/idg4h/actions/workflows/test.yml)

## About

IDG4H is a capstone project aimed at integrating legacy Philippine barangay/clinic-level health information systems (iClinicSys, CHITS, eBHS) into a unified, FHIR-compliant central registry. The system is designed around an **offline-first, edge + central architecture**, recognizing that health workers frequently operate in low- or no-connectivity environments.

Rather than relying on direct APIs into these legacy systems (which mostly don't exist), IDG4H ingests **CSV/Excel exports** from source systems and reconciles data through a CRDT-based synchronization layer, allowing edge devices to record and update health data offline and merge changes with the central registry once connectivity is available.

## Core Features

- **Offline-first Edge Node** — a local Node.js + SQLite service that Barangay Health Workers (BHWs) can use to record and access health data without requiring live internet connectivity.
- **Central Server Registry** — a Node.js + PostgreSQL service acting as the authoritative, FHIR-aligned data store, aggregating records synced in from edge nodes.
- **CRDT-based Sync Engine** — built on [Automerge](https://automerge.org/), enabling edge nodes and the central server to independently edit records offline and merge changes automatically without conflicts, using queue-based synchronization.
- **RESTful APIs with OpenAPI/Swagger docs** — both Edge Node and Central Server expose documented, interactive API references (`/api-docs`) generated via `swagger-jsdoc` and `swagger-ui-express`.
- **FHIR-aligned data modeling** *(in progress)* — designed to map legacy system exports into standard HL7 FHIR resource shapes, pending Technical Audit findings on actual source data structures.
- **QR-based Patient Lookup** *(planned)* — an opaque, non-PII QR identifier system intended to speed up patient lookup in the field, with manual demographic search as a mandatory fallback for lost/damaged codes.
- **Automated Testing & CI** — each workspace has Jest-based test coverage, automatically run on every push/PR via GitHub Actions, including a disposable PostgreSQL service container for central-server tests.

## Repository Structure

This project is organized as an **npm workspaces monorepo**:

```
idg4h/
├── edge-node/                  # TypeScript + Express + SQLite — offline-first client
│   ├── src/
│   │   ├── db/
│   │   │   ├── connection.ts   # SQLite connection + schema init
│   │   │   ├── check-schema.ts # SQLite schema verification
│   │   │   └── patientRepository.ts # Reserved for the next repository milestone
│   │   ├── domain/             # City Health patient, encounter, observation, immunization types
│   │   ├── docs/
│   │   │   └── swagger.ts      # OpenAPI spec generation
│   │   ├── routes/
│   │   │   ├── health.ts       # Health-check endpoint
│   │   │   ├── patients.ts     # Validated patient REST boundary
│   │   │   ├── encounters.ts   # Atomic clinical encounter REST boundary
│   │   │   └── imports.ts      # Bounded, audited multipart import boundary
│   │   ├── validation/          # Strict runtime request schemas
│   │   ├── middleware/          # Structured, sanitized API errors
│   │   ├── import/              # Generic CSV/XLSX parsing and audited patient import
│   │   ├── sync/
│   │   │   └── syncWorker.ts   # Automatic non-overlapping synchronization loop
│   │   ├── __tests__/          # Jest test suite
│   │   ├── app.ts              # Express app configuration
│   │   ├── config.ts           # Environment/config loader
│   │   └── index.ts            # Entry point / server listener
│   ├── .env                    # Local environment variables (gitignored)
│   ├── .env.example            # Safe deployment configuration example
│   ├── test-fixtures/           # Explicitly synthetic import fixtures
│   ├── tsconfig.json           # Strict TypeScript compiler configuration
│   ├── jest.config.cjs         # TypeScript test configuration
│   └── package.json
│
├── central-server/             # TypeScript + Express + PostgreSQL
│   ├── src/
│   │   ├── db/
│   │   │   ├── connection.ts   # PostgreSQL pool + schema init (with startup retry logic)
│   │   │   └── syncOperationRepository.ts # Durable, idempotent operation receipts
│   │   ├── docs/
│   │   │   └── swagger.ts
│   │   ├── domain/             # Typed synchronization envelope
│   │   ├── services/           # Validation + transactional canonical application
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   └── sync.ts
│   │   ├── __tests__/
│   │   ├── app.ts
│   │   ├── config.ts
│   │   └── index.ts
│   ├── .env
│   ├── tsconfig.json
│   ├── jest.config.cjs
│   ├── scripts/check-edge-sync.cjs # Canonical create/update sync integration check
│   ├── scripts/check-edge-auto-sync.cjs # Automatic worker integration check
│   ├── scripts/check-edge-import-auto-sync.cjs # Audited CSV/XLSX-to-Central integration check
│   └── package.json
│
├── sync-engine/                # CRDT-based, queue-based synchronization layer
│   ├── src/
│   │   ├── documents/          # Automerge document wrappers per resource type
│   │   ├── queue/               # Offline write-queue logic (pending)
│   │   ├── sync/
│   │   │   └── mergeDemo.js    # Working Automerge merge proof-of-concept
│   │   ├── __tests__/
│   │   └── index.js
│   └── package.json
│
├── shared/                     # Common types, schemas, and validation utilities
│   ├── src/
│   └── package.json
│
├── docs/
│   └── ADR/                    # Architecture Decision Records
│       └── 0000-audit-skipped.md
│
├── .github/
│   ├── workflows/
│   │   └── test.yml            # CI pipeline — runs all workspace test suites
│   └── PULL_REQUEST_TEMPLATE.md
│
├── .gitignore
├── package.json                # Root workspaces manifest
└── README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Edge Node runtime | Node.js + Express (TypeScript) |
| Edge Node storage | SQLite (`better-sqlite3`) |
| Central Server runtime | Node.js + Express (TypeScript) |
| Central Server storage | PostgreSQL (`pg`) |
| Sync mechanism | Automerge (CRDT), queue-based |
| API documentation | OpenAPI / Swagger (`swagger-jsdoc`, `swagger-ui-express`) |
| Testing | Jest, Supertest |
| CI/CD | GitHub Actions |
| Data interoperability standard | HL7 FHIR |
| Containerization | Docker (available for local Postgres and future deployment) |

## Setup Prerequisites

Before setting up the project locally, ensure you have:

- **Node.js** v20 or later ([nodejs.org](https://nodejs.org/))
- **npm** (bundled with Node.js) — this project uses **npm workspaces**
- **PostgreSQL** (v15 or later) running locally, or via Docker
- **Git**
- *(Optional but recommended)* **Docker Desktop** — for disposable/reproducible Postgres instances and future containerized deployment
- *(Optional)* **psql** or **pgAdmin4** — for direct database inspection/management

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/zabdeilmercado/idg4h.git
cd idg4h
```

### 2. Install dependencies (all workspaces)

```bash
npm install
```

### 3. Configure environment variables

Each workspace that needs one has its own `.env` file (not committed to source control). Create them as follows:

**`edge-node/.env`**
```env
NODE_ENV=development
PORT=4000
NODE_ID=edge-dev-001
CENTRAL_SERVER_URL=http://localhost:5000
DB_PATH=./data/edge-node.sqlite
```

Edge Node loads its own `.env` even when a check script runs from the monorepo
root. Relative `DB_PATH` values resolve from `edge-node/`, so root-level `npx`
commands and npm workspace scripts use the same SQLite file. Absolute paths and
`:memory:` are preserved. `NODE_ID` identifies the recording node independently of patient address
fields. If it is unset, the node identity defaults to `edge-local-development`.
The four repositories stamp new records with this configured identity. Creation
inputs omit `nodeId`; saved records include it, and caller-supplied overrides are
ignored.

Application writes use `registerPatient` (candidate detection),
`createPatientWithOutbox` (direct patient creation), or `saveClinicalEncounter`
(a complete visit). These services save each domain record and its pending outbox
operation in the same SQLite transaction; a failure rolls back both. Repository
creation functions are low-level persistence primitives used by these services
and repository tests, and do not enqueue synchronization operations themselves.

Patient changes use `updatePatientWithOutbox({ id, expectedVersion, ...changes })`.
The repository updates only when the stored version matches `expectedVersion`,
increments the record version, preserves omitted fields, and queues the complete
updated record in the same SQLite transaction. A stale caller receives a version
conflict and creates no outbox entry. Central applies only the next consecutive
patient version and rejects stale or skipped versions without overwriting the
canonical record.

The first local REST API milestone exposes these patient operations:

```text
GET   /api/patients/:id
GET   /api/patients/search?lastName=...&firstName=...&birthDate=YYYY-MM-DD
POST  /api/patients
PATCH /api/patients/:id
```

Zod validates every path, query and request body at runtime. Unknown body fields
are rejected. Registration delegates to identity candidate detection and the
transactional patient/outbox write service; updates require a positive integer
`expectedVersion`. Errors use a stable `{ "error": { "code", "message" } }`
shape, with validation details where useful, and unexpected storage failures do
not expose internal messages. These endpoints do not yet have authentication or
RBAC and are intended for local development until that milestone is complete.

Clinical visits use the existing atomic encounter service through:

```text
POST /api/patients/:patientId/encounters
GET  /api/patients/:patientId/encounters
GET  /api/encounters/:id
```

One validated POST can create an encounter with zero or more observations and
immunizations. The route supplies `patientId` from the URL and the repositories
stamp `nodeId`; neither field is accepted from the body. Every domain record and
its outbox operation commit together. Observation input requires exactly one of
`valueText` or finite `valueNumeric`. Separate observation and immunization write
endpoints are deferred so callers cannot bypass the visit transaction.

Audited patient imports are available through:

```text
POST /api/imports/patients
GET  /api/imports/:id
GET  /api/imports/:id/rows
```

The POST endpoint accepts one in-memory multipart `.csv` or `.xlsx` file up to
5 MiB, plus `mapper=synthetic-patient` and an explicitly synthetic
`sourceSystem`. It validates the extension and file content without trusting the
MIME type, then calls the existing CSV/XLSX import service. Invalid parser input
retains a failed audit job and returns its ID in a controlled response. Uploaded
files are not written to disk. Official iClinicSys mapping remains unavailable
until a real export schema is verified.

**`central-server/.env`**
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgres://<user>:<password>@localhost:5432/idg4h_central
```

### 4. Set up the central database

Ensure PostgreSQL is running, then create the database:

```bash
psql -U postgres -h localhost -c "CREATE DATABASE idg4h_central;"
```

### 5. Run each service

**Edge Node:**
```bash
npm run dev --workspace=@idg4h/edge-node
# → listening on http://localhost:4000
# → API docs at http://localhost:4000/api-docs
```

For a compiled Edge Node build:

```bash
npm run build --workspace=@idg4h/edge-node
npm start --workspace=@idg4h/edge-node
```

Edge Node and Central Server use TypeScript 5.9 for compatibility with `ts-node`
and the CommonJS compiler configuration. The other workspaces retain their existing tooling.
Its tests use an isolated in-memory SQLite database. The `/health` response is
`{ "status": "ok", "db": "connected" }`; the obsolete `lastCheckId` field has
been removed because the current schema has no health-check log table.

**Central Server:**
```bash
npm run dev --workspace=@idg4h/central-server
# → listening on http://localhost:5000
# → API docs at http://localhost:5000/api-docs
```

For a compiled Central Server build:

```bash
npm run build --workspace=@idg4h/central-server
npm start --workspace=@idg4h/central-server
```

Central loads `central-server/.env` from both source and compiled entry points.
It requires `DATABASE_URL` before startup and initializes PostgreSQL with retries
before listening. Its `/health` endpoint is a liveness check returning
`{ "status": "ok", "service": "central-server" }`.

`POST /api/sync/operations` accepts `operationId`, `nodeId`, `entityType`,
`entityId`, `operationType`, and a canonical entity object as `payload`. Operation and
entity IDs must be UUIDs. The optional `Idempotency-Key` and `X-IDG4H-Node-ID`
headers must match the envelope when supplied. Central currently applies only
`create` operations for patients, encounters, observations, and immunizations.
The payload contains the Edge record, including its ID, version and timestamps.
Its ID must match `entityId`. A new operation returns HTTP 201 after commit:

```json
{ "operationId": "...", "status": "applied", "duplicate": false }
```

Repeating an applied operation ID returns HTTP 200 with `duplicate: true` and
`status: "applied"`. The original payload and metadata remain unchanged, even if the
retry supplies different content. Each logical operation must use its own ID.
Invalid payloads and unsupported update/delete operations return 400. A missing
parent, duplicate canonical entity, or existing unapplied ledger entry returns
409. Storage failures return 503 without an ACK.
See `/api-docs` for the full contract.

The PostgreSQL ledger records `received`, `applied`, or `failed` status plus receipt,
application and failure timestamps and an optional error message. A single
PostgreSQL transaction inserts the ledger entry, creates the canonical row,
marks the operation applied and commits. Any failure rolls back both writes.
Concurrent first deliveries are serialized by the ledger primary key.
Startup upgrades the earlier receipt table in place,
retaining payloads and receipt timestamps. Invalid legacy UUIDs abort migration
without dropping rows and must be resolved before startup can succeed.

Canonical tables use `originating_node_id`, stamped from the operation envelope,
to identify the creating Edge Node independently of the patient's address.
Children require their parent records; observations and immunizations may only
link an encounter for the same patient. Deliver parents before children, or retry
after their parents arrive. An existing `received` or `failed` entry is preserved
and rejected for now; recovery/application of legacy ledger entries is deferred.

**A receipt is not a synchronization ACK.** `HttpSyncTransport` requires
`status: "applied"`, which Central now returns only after the canonical transaction
commits. The Edge server starts a synchronization worker after its HTTP listener
is ready. The worker recovers stale operations once, runs an immediate cycle,
then waits `SYNC_INTERVAL_MS` after each completed cycle before trying again.
Patient updates use optimistic version conflicts. Delete operations, updates for
other entity types, conflict resolution workflows, and authentication remain
separate milestones.

With Central running, starting the Edge server also starts automatic sync:

```bash
npm run dev --workspace=@idg4h/edge-node
```

The one-shot command remains available for inspection and maintenance:

```bash
npm run sync --workspace=@idg4h/edge-node
```

To create the synthetic patient and pending outbox entry in that database first:

```bash
npx ts-node ./edge-node/src/sync/create-sync-test-patient.ts
```

Inspect the resolved database path and the latest outbox entries using the
application's configuration and connection:

```bash
npx ts-node ./edge-node/src/db/check-db-path.ts
npx ts-node ./edge-node/src/db/check-outbox-status.ts
```

The command uses `CENTRAL_SERVER_URL` from `edge-node/.env`, recovers stale
processing operations, sends one batch of due outbox entries, prints the counts,
and closes SQLite. Failed operations keep their retry schedule; fatal runner
errors set a nonzero exit code. It runs once and exits.

### 6. Run tests

Each workspace can be tested individually:

```bash
npm test -w edge-node
npm test -w central-server
npm test -w sync-engine
```

Central integration tests require `DATABASE_URL` (from its `.env` or environment)
and permission to create schemas. They create and remove randomly named schemas,
keeping existing application tables untouched. Edge tests use in-memory SQLite.

Central's suite covers canonical field mapping, concurrent duplicates, dependency
ordering, validation, rollback on application and commit failures, and migration
of the earlier ledger table. Edge transport unit tests mock HTTP responses.

To verify real HTTP synchronization of a patient create, patient update, and
visit, including version-conflict handling and a lost acknowledgement retry:

```bash
npm run build --workspace=@idg4h/central-server
npm run build --workspace=@idg4h/edge-node
node central-server/scripts/check-edge-sync.cjs
```

The check uses a temporary SQLite file, a temporary PostgreSQL schema and a
loopback server, then cleans them up. It creates one synthetic Edge patient,
invokes the actual `npm run sync` command in a separate process, updates the
patient from v1 to v2, and invokes the same command again. It verifies the
PostgreSQL patient, applied ledger records and Edge acknowledgements:

```text
[sync] recovered 0 stale operation(s)
[sync] attempted=1
[sync] acknowledged=1
[sync] failed=0
```

It then verifies a complete visit and a lost-ACK retry. Finally, it sends a stale
v2 patient update against Central v2 and verifies an HTTP 409, an unmodified
canonical patient, no applied ledger entry, and a failed Edge outbox record.

To verify that the running Edge server synchronizes automatically, without
invoking the one-shot sync command:

```bash
node central-server/scripts/check-edge-auto-sync.cjs
```

This starts loopback Edge and Central servers with disposable SQLite and
PostgreSQL storage, creates a pending patient before Edge starts, and waits for
the worker to persist `acknowledged` locally and `applied` centrally.

To verify the complete audited CSV import and automatic synchronization chain:

```bash
node central-server/scripts/check-edge-import-auto-sync.cjs
```

The check runs the real `import:synthetic` command against a running Edge server,
verifies two imported audit rows and automatic Central application, then imports
the same fixture again. The replay must produce two candidates and no additional
patients, outbox operations or Central ledger entries. Its fixture and mapper are
synthetic and do not claim to match an official iClinicSys export.

Run the same integration check with `--xlsx` to verify the Excel parser feeds the
identical mapping, validation, candidate, transactional write, audit, outbox and
automatic synchronization path:

```bash
node central-server/scripts/check-edge-import-auto-sync.cjs --xlsx
```

The synthetic workbook has two worksheets and a blank physical row. The check
proves deterministic first-worksheet selection, retained Excel row numbers,
successful Central application and duplicate-import candidate handling. It does
not claim compatibility with an unverified legacy export layout.

Tests also run automatically on every push and pull request via GitHub Actions (see `.github/workflows/test.yml`).

## Project Status

This project follows a structured development lifecycle: **Technical Audit → Architecture Design → Environment Setup → Development → Testing & Evaluation**.

**Current phase:** Development (foundational scaffolding), with the **Technical Audit** now formally underway to inform the real FHIR-aligned data model.

| Component | Status |
|---|---|
| Monorepo & CI infrastructure | ✅ Complete |
| Edge Node (bootstrap, storage, health-check, docs) | ✅ Complete |
| Central Server (bootstrap, storage, health-check, docs) | ✅ Complete |
| Sync Engine (CRDT mechanism proven) | ✅ Scaffold complete |
| Automated testing (all workspaces) | ✅ Complete |
| Real FHIR data model | ⏸ Pending Technical Audit |
| Generic CSV/XLSX ingestion pipeline | ✅ Complete with shared synthetic mapper |
| Verified legacy source mappings | ⏸ Pending source samples/audit |
| Authentication & authorization | ⏸ Design pending |
| QR-based patient lookup | ⏸ Design documented, pending implementation |

See `docs/ADR/` for architecture decisions and their rationale, including known limitations and deferred work.

## Data Privacy Note

This project handles health-related data. All development and testing to date uses placeholder/non-clinical data only. Any work involving real patient data during the Technical Audit phase will follow applicable data privacy protocols (Philippine Data Privacy Act, RA 10173), including de-identification where possible and no offsite retention of identifiable records without proper clearance.

## License

*(To be determined)*

## Acknowledgments

Developed as part of a capstone project integrating legacy Philippine barangay/clinic health information systems into a modern, interoperable, offline-first health data gateway.
