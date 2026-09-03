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
