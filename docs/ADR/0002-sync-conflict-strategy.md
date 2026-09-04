# ADR 0002: Synchronization Conflict Strategy

Status: Implemented for the current prototype; manuscript alignment requires
adviser review

Date: 2026-09-05

## Context

The approved manuscript describes vector-clock and CRDT behavior. The current
prototype instead has a transactional Edge outbox, immutable operation IDs,
Central idempotency, retry and acknowledgement handling, and optimistic patient
versions. Claiming automatic CRDT merging would misrepresent the running system.

Clinical patient fields also do not all have a safe, general-purpose automatic
merge rule. Silently combining concurrent changes could create a record that no
health worker actually entered or reviewed.

## Decision

Use idempotent operation processing and optimistic consecutive-version conflict
detection for current patient updates. Central applies an incoming update only
when its version is exactly the current version plus one. Stale updates and
version gaps are rejected as structured conflicts without mutating the canonical
patient or marking the operation as applied.

## Consequences

- Duplicate delivery is safe because the operation ledger recognizes an existing
  operation ID.
- Ordered v1-to-v2 updates apply deterministically.
- Stale and skipped-version updates require explicit resolution instead of an
  automatic field merge.
- A future conflict-resolution workflow may add field-specific rules after those
  rules are validated with domain stakeholders.

## Manuscript impact

Sections that describe CRDT or vector-clock implementation must be revised before
the final manuscript so the documented method matches the tested software. Adviser
approval is needed if this is treated as a methodological change rather than an
implementation clarification.
