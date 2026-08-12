# IDG4H Data Flow

## Status

**Provisional**

---

## 1. Current Conceptual Data Flow

```text
Source Health Information System
            |
            | Export / Exchange
            v
       Edge Data Node
            |
            v
      Local Validation
            |
            v
        SQLite
            |
            v
         Outbox
            |
            | When connectivity is available
            v
     Synchronization Engine
            |
            v
      Central Server
            |
            v
        PostgreSQL


## 2. Offline operation
User / Local System
        |
        v
   Edge Data Node
        |
        v
      SQLite
        |
        v
      Outbox
        |
        X
   No network