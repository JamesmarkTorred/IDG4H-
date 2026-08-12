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