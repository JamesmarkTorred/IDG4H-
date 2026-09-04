# Synthetic Synchronization Evaluation Protocol

## Purpose and scope

This protocol produces repeatable development evidence for the implemented
Edge-to-Central synchronization path. It uses synthetic patient-create operations,
an isolated temporary SQLite database, an isolated PostgreSQL schema, and a
loopback fault-injection proxy.

The output is not a final manuscript result, a measurement of the Baan 3 network,
or evidence that any unverified legacy export is supported. Final experimental
parameters, sample sizes, repetitions, acceptance thresholds, and field network
profiles still require approval in the study protocol.

## Run the harness

PostgreSQL must be reachable through `central-server/.env` or `DATABASE_URL`.

```powershell
npm run evaluate:sync -- --profile stable --operations 100 --require-complete
```

Choose one profile:

| Profile | Deterministic impairment |
| --- | --- |
| `stable` | No injected impairment |
| `high-latency` | Adds 250 ms before each request |
| `limited-bandwidth` | Delays request transfer according to 16 KiB/s |
| `ack-loss` | Drops every fifth first acknowledgement after Central commits |
| `intermittent` | Rejects every third operation's first delivery |
| `central-unavailable` | Rejects the first five transport requests |
| `mid-sync-interruption` | Interrupts first delivery after half the queue |

The profiles are application-level simulations. They are deterministic so runs
can be reproduced, but they do not replace later operating-system or network-
emulator validation with measured field parameters.

Generated JSON is written under `artifacts/evaluation/` by default and is ignored
by Git. Use `--output <path>` to choose a different result file. The
`--require-complete` flag makes the command fail unless SSR and canonical patient
synchronization DCI are 100%, no operation remains unacknowledged or lost, and no
duplicate entity is observed.

## Metric definitions

The artifact records the definitions used for that run.

### Synchronization Success Rate

```text
SSR = unique operations eventually acknowledged
      ----------------------------------------- × 100
       unique operations scheduled for sync
```

This is an operation-level completion measure. Each operation ID appears once in
the numerator and denominator even when its delivery is retried. Transport attempt
success is reported separately:

```text
Transport attempt success rate = successful acknowledged transport responses
                                 --------------------------------------------- × 100
                                             all transport attempts
```

`retryCount` measures attempts beyond the first delivery, while
`recoveredOperations` counts logical operations acknowledged after at least one
retry.

### Canonical Patient Synchronization DCI

```text
DCI = matching expected scalar canonical elements
      ------------------------------------------- × 100
            total expected scalar elements
```

The current development metric compares every persisted patient field, including
provenance, identifiers, demographics, contact/address, membership, employment,
family fields, version, and timestamps. Missing entities count every expected
field as mismatched. Unexpected and duplicate entities are reported separately.

This metric measures canonical Edge-to-Central synchronization consistency. It
does not measure source-system transformation accuracy. Final interoperability
DCI must start with a verified source fixture and cover source mapping, Edge
canonical persistence, synchronization, and Central canonical persistence.

### Supporting measures

- acknowledgement latency: minimum, mean, p50, p95, and maximum;
- queue-drain time;
- acknowledged operations per second;
- total and successful transport attempts, attempt success rate, retry count,
  and operations recovered after retry;
- retained unacknowledged and lost operations;
- unexpected and duplicate Central entities;
- process CPU time and peak resident memory;
- Edge SQLite/WAL storage growth.

## Interpretation rules

- Keep synthetic development runs separate from final study results.
- Record the exact profile, operation count, source revision and dirty-worktree
  state, environment, and repetition count with any reported result.
- Do not use one successful run as evidence of a population-level success rate.
- Do not label loopback profile values as measured barangay network conditions.
- Investigate any DCI below 100%, lost operation, duplicate, or retained queue
  entry before treating the run as complete.
- Define the final DCI criterion consistently in the manuscript before formal
  evaluation; the engineering target remains 100% after a completed sync cycle.

## Existing complementary evidence

The automatic-sync integration check creates an Edge operation, closes the first
SQLite connection, starts the Edge process, and verifies later Central application
and Edge acknowledgement. Unit and integration suites also cover stale-processing
recovery, exponential backoff, lost acknowledgements, concurrent duplicate
delivery, and optimistic patient-version conflicts.
