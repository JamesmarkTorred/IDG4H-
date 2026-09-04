# IDG4H Data Flow

## Status

The generic synthetic flow is implemented. Source-specific mappings remain
provisional until the Technical Audit verifies real exports.

## Import and synchronization flow

```text
Synthetic or verified source export
               |
               v
        CSV/XLSX parser
               |
               v
       Source mapper + validation
               |
               v
       Patient identity candidates
          |                 |
       candidate         no match
          |                 |
     audit only              v
                    SQLite patient + outbox
                         one transaction
                               |
                     automatic sync worker
                               |
                  HTTP operation + idempotency key
                               |
                    Central transaction
                    /                 \
          canonical PostgreSQL     operation ledger
                    \                 /
                     committed acknowledgement
                               |
                     Edge marks acknowledged
```

Raw import rows never bypass mapping, validation, candidate detection, and the
transactional patient/outbox service. The current mapper and fixtures are
explicitly synthetic and do not establish an iClinicSys, CHITS, or eBHS schema.

## Offline operation and recovery

```text
Authenticated local user
          |
          v
 Edge API + local services
          |
          v
 SQLite canonical write + outbox
          |
          X  Central/network unavailable
          |
   operation remains durable
          |
 application/device restarts
          |
 sync worker recovers stale state
          |
 network returns -> retry
          |
 Central idempotently applies or recognizes operation
          |
 Edge records acknowledgement
```

Patient updates use optimistic consecutive versions. Central applies an incoming
patient version only when it is exactly the current version plus one; stale or
skipped versions become explicit conflicts and do not overwrite canonical data.

## Evaluation observation points

The synthetic evaluation harness observes the Edge outbox, Central operation
ledger, and Central canonical rows after each scenario. It calculates SSR, DCI,
retry recovery, duplicates, loss, acknowledgement latency, queue-drain time,
throughput, CPU time, peak process memory, and Edge storage growth. Generated
measurements are development artifacts and are not final field-study results.
