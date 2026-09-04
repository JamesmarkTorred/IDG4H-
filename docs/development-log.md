# Development log

## 2026-09-03 — Edge HTTP Synchronization Transport

Added `HttpSyncTransport` using the runtime's built-in `fetch`. It posts the
operation ID, node ID, entity type and ID, operation type, and payload to
`/api/sync/operations`, with `Idempotency-Key` and `X-IDG4H-Node-ID` headers.
Retries reuse the operation ID. Non-success HTTP responses, invalid JSON, and
missing acknowledgement IDs produce errors for the Sync Engine to handle.
The engine remains responsible for matching the acknowledged operation ID.

Added `CENTRAL_SERVER_URL`, defaulting to `http://localhost:5000`, to Edge Node
configuration and the local environment file. No new dependencies were needed.

Validation: Edge Node build passed; all 97 tests across 12 Jest suites passed.
Seven HTTP transport tests use mocked `fetch` to cover the request contract,
HTTP errors, missing acknowledgement IDs, malformed JSON, network failure, and
idempotency-key reuse. No requests were sent to a real Central Server.

Inspected Central Server before ingestion work: it currently uses JavaScript,
Express, and PostgreSQL, with health and Swagger endpoints and a `_health_check`
table. The Central ingestion endpoint, durable duplicate-operation handling,
authentication, and real Edge-to-Central integration test remain future steps.

## 2026-09-03 — Central Server TypeScript and Sync Ingestion

Converted Central Server source, health route, Swagger generation, and health
test to strict TypeScript. Added compiler and Jest configuration, development
and compiled startup scripts, and required `DATABASE_URL` validation. Both source
and compiled code load the workspace environment file. Express and `pg` remain
the application and database libraries. Health now reports HTTP liveness.

Added `POST /api/sync/operations` with typed envelopes and runtime validation,
matching idempotency and node headers, and a PostgreSQL `sync_operations` inbox.
Acknowledgements follow committed receipt insertion. Identical deliveries,
including concurrent retries, return the same operation ID without changing the
receipt. Reusing an ID for different content returns 409. Invalid requests return
400; failed database writes return 503 without acknowledging the operation.

This milestone stores complete operation receipts. It does not yet apply them
to clinical/FHIR tables or add authentication.

Validation: both workspaces build; Central passes 23 tests across two suites,
and Edge passes all 97 tests across 12 suites. Central tests run against temporary
PostgreSQL schemas and cover concurrent retries, conflicting content, malformed
requests, and a forced database write failure. The real HTTP integration check
simulates a lost acknowledgement after Central commits, verifies Edge retries
the same operation, and confirms one unchanged receipt and an acknowledged Edge
outbox record. It uses in-memory SQLite and cleans up its temporary PostgreSQL
schema. CI now builds Central and runs this integration check as well.
Development and compiled startup were both verified against local PostgreSQL;
each served the expected `/health` response and Swagger UI successfully.

## 2026-09-03 — Central Sync Operation Ledger

Extended the sync domain with ledger status and receipt/application/failure
metadata, plus a domain barrel export. PostgreSQL now uses UUID identifiers and
includes status, optional timestamps, error details, and lookup indexes. Startup
migrates the previous table without replacing receipts; tests verify preserved
data and atomic rollback when a legacy identifier cannot be converted to UUID.

Added typed lookup/insert repository functions and `receiveSyncOperation`.
Duplicates return the original ledger record, including its current status and
metadata. Concurrent inserts rely on the primary key, with a second lookup after
a primary-key conflict. Unrelated database failures remain errors. The receipt
endpoint returns 201 for a new operation and 200 for a duplicate, with operation
ID, status, and duplicate flag. Headers are optional and checked when present;
runtime validation checks UUIDs, required identifiers, enums, and payload presence.
Payloads remain opaque JSON until canonical application is implemented.

This milestone supersedes the earlier receipt-as-ACK behavior. Receipt alone is
not successful synchronization. Removed the Edge-to-Central acknowledgement
harness and its CI invocation, and made `HttpSyncTransport` require an applied
status before returning an ACK. It is not wired into a running sync engine.
Canonical application and its PostgreSQL transaction remain the next milestone.

Validation: Central build and all 35 tests across three suites passed; Edge build
and all 100 tests across 12 suites passed. Tests use temporary PostgreSQL schemas
and in-memory SQLite. No canonical clinical mutations were added.
The verified schema upgrade was also applied successfully to the configured local
Central database.

## 2026-09-03 — Central Canonical Creates and Transactional Application

Added canonical PostgreSQL patients, encounters, observations and immunizations,
with foreign keys, source metadata, versions and timestamps. Canonical provenance
uses `originating_node_id` from the operation envelope. The apply service supports
create operations only and validates payload shape, required field types, positive
integer versions, matching entity IDs and patient/encounter relationships.

`receiveSyncOperation` now uses one checked-out PostgreSQL client for the ledger
insert, canonical create, applied status update and commit. The ACK follows commit.
The ledger's unique insert serializes concurrent first deliveries; an applied
duplicate returns without repeating the mutation. Existing received/failed entries
remain unchanged and return a conflict. Failed new application rolls back the
ledger and canonical writes, allowing the same operation ID to be retried later.

HTTP returns 201 for newly applied operations and 200 for applied duplicates.
Invalid payloads and unsupported updates/deletes return 400; missing dependencies,
duplicate canonical IDs and existing unapplied ledger entries return 409. Storage
failures return 503 without disclosing database details or claiming an ACK.

Validation: both builds pass, Central passes 47 tests in three suites, and Edge
passes 100 tests in 12 suites. PostgreSQL tests verify field mappings, concurrent
delivery, parent dependency retry, and rollback even when commit itself fails.
Restored the real HTTP integration check and its CI invocation after canonical
application passed: it creates all four records from Edge outbox operations,
simulates a lost ACK after commit, and verifies idempotent retry and Edge ACKs.
All synthetic integration data lives in temporary PostgreSQL schemas and
in-memory SQLite. No continuous worker, update/delete logic, or conflict resolution
was added.
Canonical schema initialization also succeeded against the configured local
Central database, preserving existing ledger records.

## 2026-09-03 — Manual Edge to Central O2O Synchronization

Added `src/sync/runSync.ts` and the Edge `sync` npm script. The runner recovers
stale operations, executes one HTTP sync batch, prints attempted/acknowledged/failed
counts, and closes SQLite. Fatal errors set exit code 1. No timer was added.
The Central URL was already configured in Edge config and its local environment.

Hardened transport response parsing: read the response text once, report malformed
JSON, reject non-object acknowledgements and invalid operation IDs, and require
status `applied` before returning an ACK. Non-success HTTP responses retain their
status and error body for retry handling.

Extended the integration check to create a synthetic patient and outbox entry in
a temporary SQLite file, then launch the actual `npm run sync` command as a separate
process. It verified attempted=1, acknowledged=1, failed=0, the PostgreSQL patient,
an applied ledger entry, and the persisted Edge acknowledgement. The subsequent
complete-visit and lost-ACK retry checks also passed. Temporary database files,
PostgreSQL schema and the loopback server are cleaned up afterward.

Validation: both workspaces build, all 110 Edge tests across 12 suites pass, and
the real HTTP integration check passes. Existing application data was not used
for the synthetic test.

## 2026-09-03 — Persisted Local Patient and Exact Operation Replay

This earlier run did not observe the full pending-to-acknowledged transition in
one controlled sequence. It is not the definitive persisted O2O PASS; the fresh
provenance rerun below supplies that evidence.

Added `create-sync-test-patient.ts` and created a synthetic patient in the configured
Edge database. Fixed relative `DB_PATH` resolution to use the Edge workspace:
root-level `npx` and workspace `npm run sync` previously resolved it to different
SQLite files. The active development database is now consistently
`edge-node/data/edge-node.sqlite`; the earlier root-level database was preserved.

Patient ID: `eca282e5-1ebb-404b-955d-e2a3b64570bf`.
Operation ID: `0a42c736-1104-49b2-b6a0-ed639c4d49dc`.
Source record: `E2E-1788444860548`; originating node: `edge-dev-001`.

At inspection, the new outbox entry was already acknowledged with attempt count 1
and no last error. The subsequently invoked manual sync command found no due
operations and reported attempted=0, acknowledged=0, failed=0. Direct queries
confirmed the same patient ID in Central and the ledger status `applied`.

Replayed the exact stored operation ID, envelope and payload over HTTP. Central
returned 200, status `applied`, duplicate `true`, and the same operation ID.
Queries before and after verified one unchanged canonical patient and one
unchanged ledger record; the Edge outbox entry was also unchanged. The synthetic
records remain in the configured development databases for inspection.

Validation: Edge build and all 110 tests passed after the database-path fix.

## 2026-09-03 — SQLite Path Consistency and Fresh O2O Provenance PASS

Confirmed an explicit Edge application root for relative database paths while
preserving absolute paths and SQLite's `:memory:` mode. Both repository-root and
workspace config checks printed exactly:
`C:\Users\zabde\idg4h\edge-node\data\edge-node.sqlite`.

The originally suggested root inline `ts-node` command failed because it selected
the root TypeScript 7 package; the successful root check explicitly selected
Edge's installed TypeScript 5.9 compiler and tsconfig. The workspace check required
Windows command quoting to preserve the eval argument. These invocation failures
were not counted as path verification. No dependency versions were changed.

Created a fresh patient and observed its outbox entry through the application
connection before sync: status `pending`, attempt count 0. The immediately
following `npm run sync --workspace=@idg4h/edge-node` returned recovered=0,
attempted=1, acknowledged=1, failed=0. The same connection then reported
`acknowledged`, attempt count 1 and last error NULL.

Patient UUID: `8bb836c8-3305-45f8-9bc1-64a22d953cb5`.
Operation UUID: `350ad60d-046b-46c7-be0d-d7f3841c27e8`.
Source record: `E2E-1788445460255`; node: `edge-dev-001`.

Verified that patient UUID in Edge patients.id, Edge outbox.entity_id, Central
sync_operations.entity_id, and Central patients.id. Central's ledger was applied
with an application timestamp; the source record and originating node also
matched. Replaying the exact stored operation and payload returned HTTP 200,
status applied and duplicate true. There remained one unchanged Central patient
and one unchanged ledger entry for this test. This fresh persisted O2O test is PASS.

Preserved both database files after a read-only inventory:

| SQLite file | Patients | Encounters | Observations | Immunizations | Outbox |
| --- | ---: | ---: | ---: | ---: | --- |
| `data/edge-node.sqlite` | 9 | 8 | 10 | 4 | Empty |
| `edge-node/data/edge-node.sqlite` | 4 | 0 | 0 | 0 | 4 acknowledged |

The root file's patients had no source-system value; the workspace file's four
patients had source system synthetic-test. Only the workspace file contained the
fresh UUID. Neither database was deleted or merged.

Validation: Edge build and all 110 tests across 12 suites passed.

## 2026-09-03 — Inspection Scripts and Requested Patient Verification

Added and ran `check-db-path.ts` and `check-outbox-status.ts` using file-based
ts-node commands. The resolved path is the absolute Edge workspace database.
Both existing SQLite files remain intact.

Verified the specifically requested patient UUID
`370ab1f3-b56a-4464-877d-358944cae629` in the configured Edge outbox: acknowledged,
attempt count 1, last error NULL. PostgreSQL contains the matching SyncTest/Patient
record with birth date 1990-01-01 and originating node edge-dev-001. Its operation
`cf34ac42-f38c-4398-839b-ebd55805f6bc` exists in sync_operations with status applied.
The requested patient's Edge-to-Central O2O verification is PASS.

Replayed that exact stored operation ID, envelope and payload over HTTP. Central
returned 200 with the same ID, status applied and duplicate true. Before/after
queries found one patient and one ledger row; full records, ledger timestamps
and the Edge acknowledgement remained unchanged. Idempotency replay is PASS.

## 2026-09-04 — Edge Patient Updates and Optimistic Versioning

Added `PatientUpdateInput` with a required expected version. The patient repository
loads the current record, rejects missing or stale inputs, applies partial field
changes with an ID-and-version predicate, preserves omitted values, increments
the version, and returns the updated record.

Added `updatePatientWithOutbox`, which commits the patient update and a complete
patient update operation in one SQLite transaction. Tests verify v1-to-v2 updates,
field preservation, exact update payloads, stale and missing-patient rejection,
no extra outbox entries on conflicts, and full rollback when outbox insertion
fails.

The root dependency tree currently exposes TypeScript 7, which is incompatible
with ts-jest. Jest now selects each workspace's installed TypeScript 5.9 compiler
explicitly; dependency versions were not changed.

Validation: Edge build passed; all 114 tests across 13 suites passed. Central
optimistic patient update application remains the next milestone.

## 2026-09-04 — Central Patient Update Conflicts

Central now applies patient updates only when the incoming version is exactly
the current canonical version plus one. Each update locks the patient row, writes
the complete patient snapshot while preserving its originating node and creation
timestamp, marks the sync ledger operation applied, and commits those changes in
the existing transaction before Edge receives an acknowledgement.

Stale versions, version gaps, and updates whose patient create has not arrived
return HTTP 409 with a structured `PATIENT_VERSION_CONFLICT` body. The body
includes the reason, current version, incoming version and expected version.
Conflict rollback leaves the canonical patient unchanged and does not retain a
ledger record claiming that the operation was applied. Concurrent updates for
the same next version serialize on the patient row, so one applies and the other
receives a stale-version conflict. Replaying the successful operation ID remains
idempotent.

The isolated Edge-to-Central harness now proves the complete v1 create, local v2
update, central v2 application and Edge acknowledgement flow. It also injects a
stale v2 operation against Central v2 and verifies that Edge records a failed
attempt while Central preserves v2 and has no applied ledger entry for the
conflict.

Validation: both workspaces build; all 56 Central tests across three suites pass;
the real HTTP integration check passes for the valid update and conflict paths.

## 2026-09-04 — Automatic Edge Synchronization Worker

Added a synchronization worker that starts with the Edge HTTP server. It recovers
stale processing records, runs one immediate synchronization cycle, and schedules
the next cycle with `setTimeout` only after the current cycle finishes. This
prevents overlapping sends when Central or the network is slow. Unexpected cycle
errors are logged without terminating the worker or blocking local Express and
SQLite activity.

The worker interval is configured by `SYNC_INTERVAL_MS`, with a 30-second default
documented in the new Edge `.env.example`. SIGINT and SIGTERM stop new cycles,
wait for an active cycle to finish, close the HTTP server and SQLite connection,
and then exit.

Six focused tests cover the immediate cycle, startup recovery, non-overlap,
continuation after failure, timer cancellation and waiting for an active cycle.
The process-level integration check starts compiled Edge and Central servers with
temporary databases, creates a pending patient without running the manual sync
command, and observes local acknowledgement plus Central canonical and ledger
application. The check is included in CI.

Validation: Edge build passed; all 120 tests across 14 suites passed. The real
automatic Edge-to-Central synchronization check passed with one attempted and
acknowledged operation and no failures.

## 2026-09-04 — Import Audit and Staging Foundation

Added generic SQLite audit storage for import jobs and row outcomes. Import jobs
record the declared source system, file identity and type, lifecycle status,
row totals, timestamps and fatal errors. Row results retain their original data
and distinguish imported, identity-candidate and rejected outcomes. Deleting a
job cascades to its row results, and indexes support status and source queries.

Added typed import job and row-result domain contracts and exported them from the
Edge domain barrel. No iClinicSys, CHITS or eBHS columns were assumed, and no raw
row can enter canonical patient storage through this milestone because parser,
mapper, validation and import-service behavior have not yet been implemented.

Validation: Edge build passed; all 120 tests across 14 suites passed. An isolated
in-memory schema inspection confirmed both tables, the cascading foreign key and
all four import audit indexes without modifying the development database.

## 2026-09-04 — Import Accounting and Repository

Split import accounting into imported, candidate and failed counters, with the
invariant that their sum equals the total processed rows. Renamed the issue-bearing
completion state to `completed_with_issues`. A compatibility migration rebuilds
the two audit tables when it finds the earlier successful-row layout, preserves
jobs and raw row results, derives the split counters from those results, translates
the old completion status, and restores the cascading foreign key and indexes.

Added the typed import repository for starting jobs, transactionally recording
row results with the appropriate counter, completing clean or issue-bearing jobs,
recording fatal failures, and retrieving ordered audit data. Row writes are
restricted to processing jobs; if the counter update cannot occur, the inserted
audit row rolls back with it. Raw data is retained through JSON serialization.

Validation: Edge build passed; all 133 tests across 15 suites passed. Repository
tests cover each counter, accounting totals, raw-data round trips, completion and
failure states, cascade deletion, closed-job rollback and legacy-schema migration.
The requested schema check upgraded and verified the configured development
database with imported, candidate and failed counter columns.

## 2026-09-04 — Generic Audited Patient CSV Import

Added a generic `csv-parse` adapter with BOM, CRLF, quoted-field, empty-header,
case-insensitive duplicate-header and strict column-count handling. Parser results
retain physical CSV line numbers even when blank lines are skipped. Added a
source-mapper interface and a deliberately synthetic patient mapper; no production
iClinicSys, CHITS or eBHS column layout is claimed.

Added patient import validation for required names, ISO-formatted birth dates and
real calendar dates. The import service creates its audit job before parsing,
processes mapped rows independently, retains raw input, sends possible identity
matches to candidate review, and continues after rejected rows. Rows without a
candidate create the patient and outbox operation and record the imported audit
inside one SQLite transaction.

Tests force the imported audit insert to fail and confirm that both the patient
and outbox operation roll back before the row is recorded as rejected. Fatal CSV
syntax failures mark the job failed. Clean files complete normally; candidate or
rejected rows produce `completed_with_issues`; all mixed outcomes preserve the
counter invariant.

Validation: Edge build passed; all 149 tests across 17 suites passed. The parser
and service suites cover quoted commas, BOM, CRLF, physical line numbers, malformed
files and patients, candidate suppression, continued processing, raw audit data,
transaction rollback and fatal job handling.

## 2026-09-04 — End-to-End Audited CSV Import and Automatic O2O Synchronization

Added a two-row synthetic patient CSV fixture and the `import:synthetic` command.
The command reads the fixture, applies the synthetic mapper, creates a durable
import job and prints its ordered row results. The input is explicitly synthetic
and is not claimed to reproduce an official iClinicSys export or column layout.

Added a process-level integration check using a temporary Edge SQLite database,
a temporary Central PostgreSQL schema, and live Edge and Central HTTP servers.
It runs the actual import command while the Edge worker is active, verifies two
canonical Edge patients, two imported audit rows and two create outbox operations,
then waits for automatic synchronization without invoking the manual sync command.
Central receives both patients with the expected source provenance and node ID,
both ledger operations become applied, and both Edge operations become acknowledged.

The check then imports the identical CSV again. Source identity detection records
both rows as candidates, the second job completes with issues, and patient, outbox,
Central canonical and Central ledger counts remain unchanged. The integration
check is included in CI.

Validation: Edge and Central builds passed; all 149 Edge tests across 17 suites
passed; the live synthetic import-to-automatic-sync integration check passed with
two acknowledged operations and zero duplicate patients.

## 2026-09-04 — Generic XLSX Ingestion Through the Shared Import Pipeline

Added an ExcelJS parser for `.xlsx` buffers. CSV and XLSX now return the same
`ParsedImportRow` contract, so file handling stops before mapping and all patient
rows continue through the existing source mapper, validation, identity candidate
detection, transactional patient/outbox/audit write, and import accounting path.
The synthetic mapper was renamed to remove its former CSV-only label.

The parser deterministically reads the first worksheet, rejects empty worksheets
and case-insensitive duplicate headers, ignores blank rows, preserves physical
Excel row numbers, and normalizes text, numbers, booleans and dates to mapper-ready
strings. The repository includes a synthetic two-sheet workbook with a blank row;
it is not presented as an iClinicSys, CHITS or eBHS export.

The import-to-sync integration harness now supports both formats. Its XLSX mode
runs the real workbook import while the Edge sync worker is active, confirms two
audited patients and outbox operations become acknowledged locally and applied in
Central, then imports the workbook again and verifies two candidates with no new
canonical or ledger records. CI runs both CSV and XLSX modes.

Validation: Edge and Central builds passed; all 157 Edge tests across 19 suites
passed. Both live synthetic CSV and XLSX import-to-automatic-sync checks passed
with two acknowledged operations and zero duplicate patients. Additional import
formats are deferred; the next application milestone is the Edge local REST API.

## 2026-09-04 — Edge Patient REST API and Runtime Validation

Added the first local application boundary with patient create, exact demographic
search, get-by-ID and optimistic update endpoints. Routes contain no SQL: reads
delegate to the patient repository, registration delegates to identity candidate
detection and transactional creation, and updates delegate to the existing
patient/outbox write service.

Added strict Zod schemas for path, query, create and update inputs. Required names,
real `YYYY-MM-DD` dates, the sex enum, positive integer expected versions and at
least one update field are enforced at runtime. Unknown fields are rejected, so
callers cannot supply node identity or persistence metadata.

Added structured API errors for validation, malformed JSON, missing patients,
identity candidates and version conflicts. The shared terminal middleware returns
a sanitized internal-error response for unexpected failures; health-check storage
errors now use the same policy. Patient repository update failures use typed domain
errors while retaining their established messages for non-HTTP callers.

Tests cover successful writes and reads, outbox payloads, invalid fields, dates and
sex values, strong identity suppression, searches, missing patients, v1-to-v2
updates, stale-update rollback, malformed JSON and sanitized unexpected failures.

Validation: Edge build passed; all 173 tests across 20 suites passed. Authentication
and RBAC remain required before treating the local REST API as deployment-ready.
