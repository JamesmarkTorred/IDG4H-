# IDG4H — Integrated Data Gateway for Health

## Status
Phase: Environment Setup

## Components
- `edge-node/` — Node.js + SQLite, offline-first client
- `central-server/` — Node.js + PostgreSQL
- `sync-engine/` — CRDT + queue-based sync
- `shared/` — common FHIR schemas/types

## Notes
Technical Audit was deferred — see docs/ADR/0000-audit-skipped.md