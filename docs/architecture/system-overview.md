# IDG4H System Architecture Overview

## Status

**Architecture status:** Provisional / under development

This document describes the current architectural structure of the IDG4H prototype.

The architecture is based on the approved IDG4H capstone proposal. Source-system-specific details involving iClinicSys, CHITS, and eBHS remain subject to the ongoing Technical Audit and must not be treated as confirmed until validated.

---

## 1. System Purpose

The Integrated Data Gateway for Health (IDG4H) is an offline-first health data gateway intended to support interoperability between legacy health information systems and a centralized FHIR-aligned health data registry.

The system is designed for environments where network connectivity may be intermittent or unavailable.

---

## 2. High-Level Architecture

IDG4H consists of four primary software components:

1. Edge Data Node
2. Central Server
3. Synchronization Engine
4. Shared Components

### Conceptual Flow

```text
Legacy Health Information Systems
        |
        | CSV / Excel / other validated exchange mechanisms
        v
+-----------------------+
|     Edge Data Node    |
|-----------------------|
| Local API             |
| Validation            |
| Local Persistence     |
| SQLite                |
| Offline Operation     |
| Outbox                |
+-----------+-----------+
            |
            | Synchronization
            v
+-----------------------+
|    Sync Engine        |
|-----------------------|
| Queue Management      |
| Change Tracking       |
| CRDT Operations       |
| Merge Processing      |
| Retry / Recovery      |
+-----------+-----------+
            |
            | Online synchronization
            v
+-----------------------+
|    Central Server     |
|-----------------------|
| REST API              |
| Validation            |
| PostgreSQL            |
| Central Registry      |
+-----------------------+

3. Edge Data Node

The Edge Data Node is the local/offline component of IDG4H.

Technology
Node.js
Express
SQLite
better-sqlite3
Intended Responsibilities
Provide a local REST API
Maintain local SQLite persistence
Support operation when network connectivity is unavailable
Perform local validation and processing
Provide the local persistence boundary for synchronization
Maintain synchronization-related local state
Current Implementation

The Edge Node currently provides:

Express application bootstrap
SQLite connection
SQLite database initialization
Health-check endpoint
OpenAPI/Swagger documentation
Automated tests

The final clinical data model and source-system mappings remain provisional pending the Technical Audit.

4. Central Server

The Central Server provides the centralized registry and server-side synchronization boundary.

Technology
Node.js
Express
PostgreSQL
pg
Intended Responsibilities
Provide the central REST API
Maintain centralized PostgreSQL persistence
Receive synchronized data from Edge Nodes
Perform central-side validation
Persist synchronized records
Provide the central registry boundary
Current Implementation

The Central Server currently provides:

Express application bootstrap
PostgreSQL connection
Database initialization
Startup connection retry logic
Health-check endpoint
OpenAPI/Swagger documentation
Automated tests

The final FHIR-aligned data model remains provisional pending Technical Audit findings.

5. Synchronization Engine

The Synchronization Engine is responsible for coordinating offline-to-online synchronization between Edge Nodes and the Central Server.

Technology
Node.js
Automerge
Intended Responsibilities
Synchronization queue processing
Change tracking
Change exchange
CRDT-based merging
Retry and recovery handling
Synchronization state management
Current Implementation

The repository currently contains an Automerge proof-of-concept demonstrating concurrent document changes and merging.

This proof-of-concept demonstrates CRDT mechanics but does not constitute the complete IDG4H synchronization protocol.

The following remain to be designed and implemented:

Persistent synchronization queue
Synchronization operation format
Transport mechanism
Acknowledgement behavior
Retry strategy
Idempotency behavior
Merge/conflict handling policies
Synchronization failure recovery
6. Shared Components

The shared workspace contains common contracts, schemas, validation utilities, and other functionality that is intentionally shared between IDG4H components.

Shared functionality should remain limited to genuinely cross-component concerns.

Infrastructure-specific and component-specific business logic should remain within the component that owns it.

Any clinical domain models currently present in this workspace must be treated as provisional until validated through the Technical Audit and subsequent architecture decisions.

7. Technical Audit Dependency

The Technical Audit is intended to establish the actual operational and technical characteristics of the relevant health information systems and workflows.

The following must remain provisional until supported by audit findings:

Source-system schemas
Source-system field names
Source-system field mappings
Source identifiers
Actual export formats
Available integration interfaces
Existing data-exchange mechanisms
Source-specific transformation rules

Development may use synthetic and provisional data structures while avoiding unsupported claims about iClinicSys, CHITS, and eBHS.

8. Architectural Principles

The project should follow these principles:

Offline-first operation
Local data persistence at the Edge
Explicit synchronization boundaries
Data integrity over convenience
Testability
Security and privacy by design
FHIR alignment where supported by validated requirements and data
Explicit conflict-resolution policies
Maintainable component boundaries
Traceability to the approved research objectives
9. Current Architecture Status
Component	Status
Edge Node foundation	Implemented
Central Server foundation	Implemented
SQLite persistence foundation	Implemented
PostgreSQL persistence foundation	Implemented
REST API foundation	Implemented
OpenAPI documentation foundation	Implemented
CI/test infrastructure	Implemented
Automerge proof-of-concept	Implemented
Production synchronization protocol	Pending
Persistent synchronization queue	Pending
Final domain model	Pending Technical Audit
Source-system mappings	Pending Technical Audit
FHIR transformation/mapping	Pending
Authentication/RBAC	Pending
QR-based patient lookup	Pending
Evaluation instrumentation	Pending
10. Architectural Constraint

No implementation or documentation should represent unverified characteristics of iClinicSys, CHITS, or eBHS as established facts.

When information has not yet been validated, it should explicitly be classified as one of:

Provisional
Assumption
Pending Technical Audit
Needs validation
Needs adviser approval