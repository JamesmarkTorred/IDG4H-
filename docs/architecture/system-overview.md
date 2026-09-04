# IDG4H System Architecture Overview

## Status

**Architecture status:** Implemented prototype with provisional source mappings
and FHIR alignment.

The current software implements an offline-first Edge-to-Central synchronization
path using synthetic source data. Details attributed to iClinicSys, CHITS, and
eBHS remain unverified until the Technical Audit supplies real export samples and
workflow evidence.

## System purpose

IDG4H is an offline-first interoperability gateway for environments with
intermittent connectivity. It preserves validated local health operations in
SQLite, synchronizes them through a durable outbox, and atomically applies them to
a Central PostgreSQL registry when connectivity is available.

## Implemented architecture

```text
CSV/XLSX or local application
             |
             v
  +------------------------+
  | Edge Node              |
  |------------------------|
  | Local authentication   |
  | Runtime validation     |
  | Identity candidates    |
  | SQLite canonical data  |
  | Transactional outbox   |
  | Retry/recovery worker  |
  +-----------+------------+
              |
              | HTTP operations with stable IDs
              v
  +------------------------+
  | Central Server         |
  |------------------------|
  | Sync validation        |
  | Idempotent ledger      |
  | Canonical PostgreSQL   |
  | Version conflicts      |
  +------------------------+
```

### Edge Node

The TypeScript Edge Node owns the local Express API, offline authentication and
RBAC, request validation, CSV/XLSX parsing, source mapping, patient candidate
detection, SQLite persistence, transactional domain writes, the durable outbox,
HTTP transport, retry scheduling, stale-processing recovery, and the automatic
non-overlapping sync worker.

Patient creation and update, complete clinical encounter writes, and imported
patient creation commit their canonical records and outbox operations in the same
SQLite transaction. The repository stamps the configured Edge identity; callers
cannot choose it.

### Central Server

The TypeScript Central Server owns the synchronization ingestion endpoint,
operation validation, idempotent operation ledger, canonical PostgreSQL tables,
and transactional application. It acknowledges only after the canonical mutation
and applied ledger state commit together.

Patient updates require the next consecutive version. Missing-base, stale, and
version-gap updates return structured conflicts without modifying canonical data.
Encounter, observation, and immunization create operations retain their patient
and encounter references.

### Synchronization mechanism

The production prototype currently uses operation-to-operation synchronization:
stable operation UUIDs, an Edge outbox state machine, HTTP acknowledgement,
Central idempotency, exponential retry, and optimistic patient version conflicts.

The separate `sync-engine` workspace contains an Automerge proof of concept. It
does not currently drive the production synchronization path, so the implemented
protocol must not be described as CRDT merging. Any future CRDT adoption requires
an explicit conflict-policy decision and integration tests.

### Shared workspace

The shared workspace remains a small provisional contract package. Edge and
Central currently own their infrastructure-specific domain contracts. Shared
clinical/FHIR contracts should be consolidated only after the Technical Audit and
FHIR mapping decisions establish a stable cross-component boundary.

## Security boundary

Health-record Edge routes require a local opaque session and a technical
permission. Passwords use salted `scrypt`; SQLite stores only SHA-256 hashes of
random session tokens. Health and login remain public. Final health-worker role
names need field validation. Edge-to-Central transport authentication and
deployment TLS remain open requirements.

## Evaluation boundary

The evaluation harness runs synthetic workloads through isolated Edge SQLite and
Central PostgreSQL stores behind deterministic fault profiles. It records SSR,
DCI, retry recovery, duplicate and loss counts, latency, queue-drain time,
throughput, CPU time, memory, and storage growth. Development smoke artifacts are
not final manuscript or barangay-network results.

## Technical Audit dependency

The following remain provisional until supported by evidence:

- deployed source systems and versions;
- source field names, schemas, identifiers, and export formats;
- source-specific transformation rules;
- patient-level versus aggregate reporting boundaries;
- actual user roles and permission assignments;
- measured connectivity characteristics;
- final FHIR profiles and code systems.

Synthetic adapters may exercise the complete architecture without being named or
presented as verified legacy-system compatibility.

## Current status

| Component | Status |
| --- | --- |
| Edge local persistence and transactional outbox | Implemented |
| Patient and atomic clinical encounter APIs | Implemented |
| Generic audited CSV/XLSX import | Implemented with synthetic mapping |
| Offline local authentication and RBAC engine | Implemented |
| Automatic HTTP retry/recovery worker | Implemented |
| Central idempotent ingestion and canonical application | Implemented |
| Consecutive patient-version conflict policy | Implemented |
| Synthetic adverse-network evaluation instrumentation | Implemented |
| Production CRDT integration | Not implemented; proof of concept only |
| Verified legacy source mappings | Pending Technical Audit |
| Final FHIR transformation and profiles | Pending Technical Audit |
| Final health-worker role matrix | Needs field validation |
| Edge-to-Central authentication and TLS | Open |
| PWA/dashboard | Deferred by ADR 0001 pending approval |
| QR-based patient lookup | Pending design and approval |
| Final research evaluation results | Not yet measured |

## Architectural constraint

No implementation, document, demonstration, or result may represent unverified
characteristics of iClinicSys, CHITS, eBHS, pilot workflows, roles, network
conditions, or experimental outcomes as established facts.
