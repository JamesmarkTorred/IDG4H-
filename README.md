# IDG4H — Integrated Data Gateway for Health

Offline-first data gateway that synchronizes Edge health operations from SQLite to a FHIR-aligned Central PostgreSQL registry under intermittent connectivity.

[![Test Suite](https://github.com/zabdeilmercado/idg4h/actions/workflows/test.yml/badge.svg)](https://github.com/zabdeilmercado/idg4h/actions/workflows/test.yml)

## About

IDG4H is a capstone prototype investigating how fragmented Philippine barangay/clinic-level health information systems can interoperate with a unified, FHIR-aligned central registry. iClinicSys, CHITS, and eBHS are study contexts whose deployed schemas and exchange mechanisms still require Technical Audit verification. The system uses an **offline-first Edge + Central architecture** for low- or no-connectivity environments.

The implemented generic pipeline ingests synthetic **CSV/Excel exports**, validates and maps them into a provisional canonical model, and synchronizes durable operations once connectivity is available. Verified source-specific adapters remain pending real export evidence. The production prototype uses an idempotent operation ledger and optimistic patient version conflicts; Automerge remains a separate proof of concept.

## Core Features

* **Offline-first Edge Node** — a local Node.js + SQLite service that Barangay Health Workers (BHWs) can use to record and access health data without requiring live internet connectivity.

* **Central Server Registry** — a Node.js + PostgreSQL service acting as the authoritative, FHIR-aligned data store, aggregating records synced in from edge nodes.

* **Durable synchronization** — transactional Edge outbox, automatic retry/recovery worker, HTTP acknowledgements, Central idempotency, and explicit optimistic-version conflicts.

* **CRDT proof of concept** — [Automerge](https://automerge.org/) mechanics are isolated in the `sync-engine` workspace and do not yet drive the production path.

* **RESTful APIs with OpenAPI/Swagger docs** — both Edge Node and Central Server expose documented, interactive API references (`/api-docs`) generated via `swagger-jsdoc` and `swagger-ui-express`.

* **FHIR-aligned data modeling** *(in progress)* — designed to map legacy system exports into standard HL7 FHIR resource shapes, pending Technical Audit findings on actual source data structures.

* **QR-based Patient Lookup** *(planned)* — an opaque, non-PII QR identifier system intended to speed up patient lookup in the field, with manual demographic search as a mandatory fallback for lost/damaged codes.

* **Automated Testing & CI** — each workspace has Jest-based test coverage, automatically run on every push/PR via GitHub Actions.

## Repository Structure

This project is organized as an **npm workspaces monorepo**.

```text
idg4h/
├── artifacts/
│   └── evaluation/
│
├── central-server/
│   ├── scripts/
│   │   ├── check-edge-auto-sync.cjs
│   │   ├── check-edge-import-auto-sync.cjs
│   │   ├── check-edge-sync.cjs
│   │   └── evaluate-sync.cjs
│   │
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── health.test.ts
│   │   │   ├── networkProfiles.test.ts
│   │   │   ├── setup.ts
│   │   │   ├── sync.test.ts
│   │   │   ├── syncFixtures.ts
│   │   │   ├── syncMetrics.test.ts
│   │   │   └── syncSchemaMigration.test.ts
│   │   │
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   └── syncOperationRepository.ts
│   │   ├── docs/
│   │   │   └── swagger.ts
│   │   ├── domain/
│   │   │   ├── index.ts
│   │   │   └── syncOperation.ts
│   │   ├── evaluation/
│   │   │   ├── faultProxy.ts
│   │   │   ├── networkProfiles.ts
│   │   │   └── syncMetrics.ts
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   └── sync.ts
│   │   ├── services/
│   │   │   ├── applySyncOperation.ts
│   │   │   ├── syncOperationService.ts
│   │   │   └── syncValidation.ts
│   │   ├── app.ts
│   │   ├── config.ts
│   │   └── index.ts
│   │
│   ├── jest.config.cjs
│   ├── package.json
│   └── tsconfig.json
│
├── docs/
│   ├── ADR/
│   │   ├── 0000-audit-skipped.md
│   │   ├── 0001-future-dashboard-ui.md
│   │   └── 0002-sync-conflict-strategy.md
│   ├── architecture/
│   │   ├── component-responsibilities.md
│   │   ├── data-flow.md
│   │   └── system-overview.md
│   ├── evaluation/
│   │   └── sync-evaluation.md
│   ├── development-log.md
│   └── TRACEABILITY.md
│
├── edge-node/
│   ├── prisma/
│   │   ├── migrations/
│   │   │   └── 00000000000000_baseline/
│   │   │       └── migration.sql
│   │   └── schema.prisma
│   │
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── authApi.test.ts
│   │   │   ├── authorizationApi.test.ts
│   │   │   ├── authTestHelpers.ts
│   │   │   ├── clinicalEncounterService.test.ts
│   │   │   ├── csvParser.test.ts
│   │   │   ├── encounterRepository.test.ts
│   │   │   ├── encountersApi.test.ts
│   │   │   ├── health.test.ts
│   │   │   ├── httpSyncTransport.test.ts
│   │   │   ├── immunizationRepository.test.ts
│   │   │   ├── importRepository.test.ts
│   │   │   ├── importsApi.test.ts
│   │   │   ├── observationRepository.test.ts
│   │   │   ├── offlineWriteTransaction.test.ts
│   │   │   ├── outboxRepository.test.ts
│   │   │   ├── passwordService.test.ts
│   │   │   ├── patientIdentity.test.ts
│   │   │   ├── patientImportService.test.ts
│   │   │   ├── patientRepository.test.ts
│   │   │   ├── patientsApi.test.ts
│   │   │   ├── patientUpdate.test.ts
│   │   │   ├── patientXlsxImportService.test.ts
│   │   │   ├── retryPolicy.test.ts
│   │   │   ├── sessionPersistence.test.ts
│   │   │   ├── setup.ts
│   │   │   ├── syncEngine.test.ts
│   │   │   ├── syncWorker.test.ts
│   │   │   └── xlsxParser.test.ts
│   │   │
│   │   ├── auth/
│   │   │   ├── authRepository.ts
│   │   │   ├── authService.ts
│   │   │   ├── bootstrapUser.ts
│   │   │   ├── passwordService.ts
│   │   │   ├── permissions.ts
│   │   │   ├── schema.ts
│   │   │   └── sessionService.ts
│   │   │
│   │   ├── db/
│   │   │   ├── audit-data.ts
│   │   │   ├── check-db-path.ts
│   │   │   ├── check-encounter-repository.ts
│   │   │   ├── check-immunization-repository.ts
│   │   │   ├── check-observation-repository.ts
│   │   │   ├── check-outbox-status.ts
│   │   │   ├── check-patient-repository.ts
│   │   │   ├── check-schema.ts
│   │   │   ├── connection.ts
│   │   │   ├── encounterRepository.ts
│   │   │   ├── immunizationRepository.ts
│   │   │   ├── importRepository.ts
│   │   │   ├── observationRepository.ts
│   │   │   ├── outboxRepository.ts
│   │   │   └── patientRepository.ts
│   │   │
│   │   ├── docs/
│   │   │   └── swagger.ts
│   │   ├── domain/
│   │   │   ├── encounter.ts
│   │   │   ├── encounterErrors.ts
│   │   │   ├── immunization.ts
│   │   │   ├── import.ts
│   │   │   ├── index.ts
│   │   │   ├── observation.ts
│   │   │   ├── outbox.ts
│   │   │   ├── patient.ts
│   │   │   └── patientErrors.ts
│   │   ├── import/
│   │   │   ├── csvParser.ts
│   │   │   ├── parsedImportRow.ts
│   │   │   ├── patientImportService.ts
│   │   │   ├── patientImportValidation.ts
│   │   │   ├── patientSourceMapper.ts
│   │   │   ├── runSyntheticPatientImport.ts
│   │   │   ├── runSyntheticPatientXlsxImport.ts
│   │   │   ├── syntheticPatientMapper.ts
│   │   │   └── xlsxParser.ts
│   │   ├── middleware/
│   │   │   ├── authenticate.ts
│   │   │   ├── authorize.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── upload.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── encounters.ts
│   │   │   ├── health.ts
│   │   │   ├── imports.ts
│   │   │   └── patients.ts
│   │   ├── services/
│   │   │   ├── check-clinical-encounter.ts
│   │   │   ├── check-patient-identity.ts
│   │   │   ├── clinicalEncounterService.ts
│   │   │   ├── patientIdentityService.ts
│   │   │   ├── patientRegistrationService.ts
│   │   │   └── patientWriteService.ts
│   │   ├── sync/
│   │   │   ├── create-sync-test-patient.ts
│   │   │   ├── httpSyncTransport.ts
│   │   │   ├── retryPolicy.ts
│   │   │   ├── runSync.ts
│   │   │   ├── syncEngine.ts
│   │   │   ├── syncTransport.ts
│   │   │   └── syncWorker.ts
│   │   ├── validation/
│   │   │   ├── authSchemas.ts
│   │   │   ├── encounterSchemas.ts
│   │   │   ├── importSchemas.ts
│   │   │   └── patientSchemas.ts
│   │   ├── app.ts
│   │   ├── config.ts
│   │   └── index.ts
│   │
│   ├── test-fixtures/
│   │   ├── synthetic-patient-import.csv
│   │   └── synthetic-patient-import.xlsx
│   │
│   ├── .env.example
│   ├── jest.config.cjs
│   ├── package.json
│   ├── prisma.config.ts
│   └── tsconfig.json
│
├── shared/
│   ├── src/
│   │   └── schemas/
│   │       └── patient.ts
│   ├── package.json
│   └── tsconfig.json
│
├── sync-engine/
│   ├── resolution/
│   │   └── index.js
│   ├── src/
│   │   ├── __tests__/
│   │   │   └── mergeDemo.test.js
│   │   ├── documents/
│   │   │   └── exampleDoc.js
│   │   ├── sync/
│   │   │   └── mergeDemo.js
│   │   └── index.js
│   └── package.json
│
├── .github/
│   ├── workflows/
│   │   └── test.yml
│   └── PULL_REQUEST_TEMPLATE.md
│
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

### Edge Node Database Architecture

The Edge Node uses **Prisma as the schema and migration authority**, while `better-sqlite3` remains the runtime database driver.

Prisma Client is **not used** by the Edge Node application.

```text
prisma/schema.prisma
        │
        │ schema definition
        ▼
prisma/migrations/
        │
        │ Prisma Migrate
        ▼
SQLite database
        ▲
        │
   better-sqlite3
        │
        ▼
Edge Node application
```

The responsibilities are intentionally separated:

| Component               | Responsibility                                               |
| ----------------------- | ------------------------------------------------------------ |
| `prisma/schema.prisma`  | Canonical database schema definition                         |
| `prisma/migrations/`    | Versioned database schema changes                            |
| `prisma.config.ts`      | Prisma CLI/migration configuration                           |
| SQLite                  | Local offline-first database                                 |
| `better-sqlite3`        | Runtime database access                                      |
| `src/db/connection.ts`  | Opens/configures the SQLite connection                       |
| `src/db/*Repository.ts` | Runtime persistence operations                               |
| `src/auth/schema.ts`    | Seeds authentication permission data; does not create tables |

### Database Migration Policy

The Edge Node database schema must be changed through Prisma Migrate.

For a new schema change:

```bash
# 1. Update the canonical schema
# edge-node/prisma/schema.prisma

# 2. Create a migration
npx prisma migrate dev --name describe_your_change \
  --schema ./edge-node/prisma/schema.prisma

# 3. Verify migration status
npx prisma migrate status \
  --schema ./edge-node/prisma/schema.prisma
```

For deployment/production-style application of existing migrations:

```bash
npx prisma migrate deploy \
  --schema ./edge-node/prisma/schema.prisma
```

The application itself does **not** create database tables during startup.

This means `src/db/connection.ts` is responsible only for opening/configuring SQLite and initializing application-level data that is safe to seed at runtime.

### Existing Database Baseline

The current Edge Node database was transitioned to Prisma Migrate using the baseline migration:

```text
edge-node/prisma/
├── schema.prisma
└── migrations/
    └── 00000000000000_baseline/
        └── migration.sql
```

The baseline represents the existing SQLite schema without recreating or resetting the existing database.

The baseline migration also preserves SQLite-specific constraints and indexes that cannot be completely represented by the Prisma schema language, including:

* `CHECK` constraints
* partial unique indexes
* SQLite `COLLATE NOCASE` behavior
* explicit foreign-key actions
* synchronization/outbox constraints

The baseline migration was tested against a disposable SQLite database before being marked as applied to the existing Edge Node database.

### Local Database Files

The actual SQLite database is local development/runtime data and is intentionally excluded from Git.

Typical local files include:

```text
edge-node/data/
├── edge-node.sqlite
├── edge-node.sqlite.backup
├── edge-node.sqlite.before-prisma-migration.sqlite
└── prisma-baseline-test/
```

These files are ignored through `edge-node/.gitignore`.

The repository therefore stores the **schema and migration history**, not the local database contents.

## Tech Stack

| Layer                          | Technology                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Edge Node runtime              | Node.js + Express (TypeScript)                                               |
| Edge Node storage              | SQLite (`better-sqlite3`)                                                    |
| Edge Node schema/migrations    | Prisma Schema + Prisma Migrate                                               |
| Edge Node ORM/runtime client   | None — runtime uses `better-sqlite3`                                         |
| Central Server runtime         | Node.js + Express (TypeScript)                                               |
| Central Server storage         | PostgreSQL (`pg`)                                                            |
| Sync mechanism                 | Transactional outbox + idempotent O2O operations; Automerge proof of concept |
| API documentation              | OpenAPI / Swagger (`swagger-jsdoc`, `swagger-ui-express`)                    |
| Testing                        | Jest, Supertest                                                              |
| CI/CD                          | GitHub Actions                                                               |
| Data interoperability standard | HL7 FHIR                                                                     |
| Containerization               | Docker (available for local Postgres and future deployment)                  |

## Setup Prerequisites

Before setting up the project locally, ensure you have:

* **Node.js** v20 or later
* **npm** (bundled with Node.js) — this project uses **npm workspaces**
* **PostgreSQL** v15 or later running locally, or via Docker
* **Git**
* **Docker Desktop** *(optional but recommended)* — for disposable/reproducible Postgres instances and future containerized deployment
* **psql** or **pgAdmin4** *(optional)* — for direct database inspection/management

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/zabdeilmercado/idg4h.git
cd idg4h
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Each workspace that needs one has its own `.env` file. These files are not committed to source control.

#### `edge-node/.env`

```env
NODE_ENV=development
PORT=4000
NODE_ID=edge-dev-001
CENTRAL_SERVER_URL=http://localhost:5000
DB_PATH=./data/edge-node.sqlite
AUTH_SESSION_TTL_MS=28800000
AUTH_COOKIE_SECURE=false
```

The Edge Node loads its own `.env` even when a check script runs from the monorepo root.

Relative `DB_PATH` values resolve from `edge-node/`, so root-level commands and npm workspace scripts use the same SQLite file. Absolute paths and `:memory:` are preserved.

`NODE_ID` identifies the recording node independently of patient address fields. If it is unset, the node identity defaults to `edge-local-development`.

#### `central-server/.env`

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgres://<user>:<password>@localhost:5432/idg4h_central
```

### 4. Initialize the Edge Node database

The Edge Node database schema is managed through Prisma Migrate.

For a fresh local database, apply the existing migrations:

```bash
npx prisma migrate deploy \
  --schema ./edge-node/prisma/schema.prisma
```

The application does not run schema creation SQL during startup.

After the migration has been applied, the Edge Node can use SQLite through `better-sqlite3`.

To verify the migration state:

```bash
npx prisma migrate status \
  --schema ./edge-node/prisma/schema.prisma
```

Expected result:

```text
Database schema is up to date!
```

### 5. Set up the Central database

Ensure PostgreSQL is running, then create the database:

```bash
psql -U postgres -h localhost -c "CREATE DATABASE idg4h_central;"
```

### 6. Run each service

#### Edge Node

```bash
npm run dev --workspace=@idg4h/edge-node
```

The Edge Node listens on:

```text
http://localhost:4000
```

API documentation:

```text
http://localhost:4000/api-docs
```

For a compiled Edge Node build:

```bash
npm run build --workspace=@idg4h/edge-node
npm start --workspace=@idg4h/edge-node
```

### Edge Node Application Behavior

Application writes use:

* `registerPatient` for candidate detection
* `createPatientWithOutbox` for direct patient creation
* `saveClinicalEncounter` for a complete visit

These services save domain records and their pending outbox operation in the same SQLite transaction.

Patient changes use:

```text
updatePatientWithOutbox({
  id,
  expectedVersion,
  ...changes
})
```

The repository updates only when the stored version matches `expectedVersion`, increments the record version, preserves omitted fields, and queues the complete updated record in the same SQLite transaction.

### Edge Node REST API

Patient operations:

```text
GET    /api/patients/:id
GET    /api/patients/search?lastName=...&firstName=...&birthDate=YYYY-MM-DD
POST   /api/patients
PATCH  /api/patients/:id
```

Clinical visits:

```text
POST /api/patients/:patientId/encounters
GET  /api/patients/:patientId/encounters
GET  /api/encounters/:id
```

Audited patient imports:

```text
POST /api/imports/patients
GET  /api/imports/:id
GET  /api/imports/:id/rows
```

Authentication:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Zod validates runtime request schemas. Access requires a local session and the appropriate permission.

### Local Authentication

Authentication works without Central or internet access.

Passwords are stored as salted `scrypt` hashes. Login creates an opaque random session token in an `HttpOnly`, `SameSite=Strict` cookie; SQLite stores only its SHA-256 hash.

Sessions are immediately revocable, expire according to `AUTH_SESSION_TTL_MS`, and survive Edge restarts.

The current technical permission keys are:

```text
patients:read
patients:write
encounters:read
encounters:write
imports:read
imports:write
users:manage
```

Create the first installation account locally:

```powershell
$env:IDG4H_BOOTSTRAP_USERNAME = 'local-admin'
$env:IDG4H_BOOTSTRAP_PASSWORD = Read-Host 'Bootstrap password' -MaskInput

npm run auth:bootstrap --workspace=@idg4h/edge-node

Remove-Item Env:IDG4H_BOOTSTRAP_PASSWORD
```

### Central Server

```bash
npm run dev --workspace=@idg4h/central-server
```

The Central Server listens on:

```text
http://localhost:5000
```

API documentation:

```text
http://localhost:5000/api-docs
```

For a compiled Central Server build:

```bash
npm run build --workspace=@idg4h/central-server
npm start --workspace=@idg4h/central-server
```

Central requires `DATABASE_URL` before startup and initializes PostgreSQL with retries before listening.

## Synchronization

With Central running, starting the Edge server also starts the automatic synchronization worker:

```bash
npm run dev --workspace=@idg4h/edge-node
```

The one-shot synchronization command remains available:

```bash
npm run sync --workspace=@idg4h/edge-node
```

To create a synthetic patient and pending outbox entry:

```bash
npx ts-node ./edge-node/src/sync/create-sync-test-patient.ts
```

Inspect the resolved database path and latest outbox entries:

```bash
npx ts-node ./edge-node/src/db/check-db-path.ts
npx ts-node ./edge-node/src/db/check-outbox-status.ts
```

The synchronization worker recovers stale operations, processes due outbox entries, retries failures according to the retry policy, and records acknowledgements locally after Central confirms successful application.

## Testing

Each workspace can be tested individually:

```bash
npm test -w edge-node
npm test -w central-server
npm test -w sync-engine
```

### Edge Node Tests

Edge tests use an isolated temporary SQLite database provisioned from the Prisma baseline migration.

The tests do not depend on the development database.

The Edge Node test database follows the same schema authority as the application database:

```text
Prisma migration
      ↓
temporary SQLite database
      ↓
better-sqlite3
      ↓
Jest tests
```

The Edge Node test suite currently contains **229 passing tests across 26 test suites**.

To run the Edge Node tests:

```bash
npm test --workspace=@idg4h/edge-node -- --runInBand
```

### Build Verification

```bash
npm run build --workspace=@idg4h/edge-node
```

### Integration Checks

To verify real HTTP synchronization of patient create/update and clinical visits:

```bash
npm run build --workspace=@idg4h/central-server
npm run build --workspace=@idg4h/edge-node

node central-server/scripts/check-edge-sync.cjs
```

Automatic synchronization:

```bash
node central-server/scripts/check-edge-auto-sync.cjs
```

CSV import and automatic synchronization:

```bash
node central-server/scripts/check-edge-import-auto-sync.cjs
```

Excel import:

```bash
node central-server/scripts/check-edge-import-auto-sync.cjs --xlsx
```

Synthetic synchronization evaluation:

```bash
npm run evaluate:sync -- --profile ack-loss --operations 100 --require-complete
```

Available evaluation profiles include stable transport, high latency, limited bandwidth, dropped acknowledgements, intermittent failure, temporary Central unavailability, and interruption after part of the queue drains.

See `docs/evaluation/sync-evaluation.md` for evaluation definitions and interpretation rules.

## Project Status

This project follows a structured development lifecycle:

**Technical Audit → Architecture Design → Environment Setup → Development → Testing & Evaluation**

**Current phase:** Prototype development and evaluation instrumentation.

The **Technical Audit** remains required before source-specific mappings, final FHIR profiles, operational roles, or field network parameters can be claimed.

| Component                                             | Status                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| Monorepo & CI infrastructure                          | ✅ Complete                                          |
| Edge Node bootstrap, storage, health-check, docs      | ✅ Complete                                          |
| Edge Node Prisma schema & migration baseline          | ✅ Complete                                          |
| Central Server bootstrap, storage, health-check, docs | ✅ Complete                                          |
| Durable Edge-to-Central synchronization               | ✅ Implemented                                       |
| Automerge/CRDT production integration                 | ⏸ Proof of concept only                             |
| Automated testing                                     | ✅ Complete                                          |
| Real FHIR data model                                  | ⏸ Pending Technical Audit                           |
| Generic CSV/XLSX ingestion pipeline                   | ✅ Complete with shared synthetic mapper             |
| Verified legacy source mappings                       | ⏸ Pending source samples/audit                      |
| Authentication & authorization                        | ✅ Offline local sessions + RBAC implemented         |
| Synthetic network evaluation instrumentation          | ✅ Implemented; final study results not yet measured |
| QR-based patient lookup                               | ⏸ Design documented, pending implementation         |

See `docs/ADR/` for architecture decisions and their rationale, including known limitations and deferred work.

## Data Privacy Note

This project handles health-related data. All development and testing to date uses placeholder/non-clinical data only.

Any work involving real patient data during the Technical Audit phase will follow applicable data privacy protocols, including the Philippine Data Privacy Act (RA 10173), de-identification where possible, and no offsite retention of identifiable records without proper clearance.

## License

*To be determined*

## Acknowledgments

Developed as part of a capstone project integrating legacy Philippine barangay/clinic health information systems into a modern, interoperable, offline-first health data gateway.

```

**Key README correction:** the old documentation said `connection.ts` handled “SQLite connection + schema init”; that is no longer true. The new documentation explicitly makes Prisma Migrate the schema authority and `better-sqlite3` the runtime layer. The original README also identifies the repository as an npm workspaces monorepo, which remains unchanged.

If you're putting this directly into the repo, the next step is simply to replace the root `README.md` with this version, then run your normal Git diff review.
```
