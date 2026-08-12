# IDG4H Component Responsibilities

## Status

**Provisional**

This document defines the intended responsibility boundaries of the IDG4H software components.

These boundaries may be refined as implementation progresses and Technical Audit findings become available.

---

## Edge Data Node

### Owns

- Local HTTP/API interface
- Local SQLite database
- Local persistence
- Local validation
- Offline operation
- Local data access
- Synchronization outbox

### Does not own

- Central PostgreSQL persistence
- Central registry state
- Global synchronization coordination
- Final conflict policy for all distributed data

---

## Central Server

### Owns

- Central HTTP/API interface
- PostgreSQL persistence
- Central registry
- Central-side validation
- Synchronization endpoint
- Central persistence acknowledgement

### Does not own

- Edge-local SQLite databases
- Edge offline operation
- Edge-local queues

---

## Synchronization Engine

### Owns

- Synchronization operations
- Queue processing
- Change exchange
- CRDT operations
- Merge processing
- Retry/recovery behavior
- Synchronization state

### Does not own

- Clinical source-system extraction
- Direct ownership of Edge SQLite persistence
- Direct ownership of Central PostgreSQL persistence

---

## Shared

### Owns

- Shared schemas
- Shared validation contracts
- Common constants
- Shared utilities where justified

### Constraint

Shared code must not become a dumping ground for unrelated business logic or infrastructure dependencies.

---

## Boundary Principle

Each component should have a clearly defined responsibility.

When a feature appears to require one component to directly control another component's internal persistence or implementation details, the architecture should be reviewed before implementation.