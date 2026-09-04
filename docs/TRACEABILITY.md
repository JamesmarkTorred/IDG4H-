# Requirements Traceability

This file records implemented requirements and the concrete evidence used to
verify them. Operational assumptions that still require field validation remain
explicitly open.

| Requirement | Classification | Implementation evidence | Verification evidence | Status |
| --- | --- | --- | --- | --- |
| Authentication works without internet or Central | Required | `edge-node/src/auth/`, `edge-node/src/routes/auth.ts` | `authApi.test.ts`: local login and clinical writes with failed Central transport | Implemented |
| Passwords are never stored in plaintext | Required | `passwordService.ts` uses salted Node `scrypt`; `users.password_hash` stores the encoded result | `passwordService.test.ts`, `authApi.test.ts` | Implemented |
| Raw session tokens are never stored | Required | `sessionService.ts` generates 32 random bytes and stores a SHA-256 token hash | `authApi.test.ts`: raw-token storage assertion | Implemented |
| Sessions expire, revoke immediately, and survive restart | Required | SQLite `auth_sessions`, logout revocation, configured TTL | `authApi.test.ts`, `sessionPersistence.test.ts` | Implemented |
| Patient API uses read/write authorization | Required | `patients.ts` uses `patients:read` and `patients:write` | `authorizationApi.test.ts`, authenticated patient API regression suite | Implemented |
| Encounter API uses read/write authorization | Required | `encounters.ts` uses `encounters:read` and `encounters:write` | `authorizationApi.test.ts`, authenticated encounter API regression suite | Implemented |
| Import API uses read/write authorization | Required | `imports.ts` checks permission before Multer and import services | `authorizationApi.test.ts`, authenticated import API regression suite | Implemented |
| Health and login remain public | Required | `app.ts`, `auth.ts` | `health.test.ts`, `authApi.test.ts` | Implemented |
| Initial account is created without a public bootstrap endpoint | Required | `npm run auth:bootstrap`, `bootstrapUser.ts` | Compiler and repository/service tests; route inventory contains no user-creation endpoint | Implemented |
| Final health-worker role names and grants match real workflows | Needs validation | RBAC supports arbitrary roles; only a temporary technical bootstrap role is defined | Follow-up field interview and approved role matrix | Open |
| Session cookie is protected in deployment transport | Required for deployment | `AUTH_COOKIE_SECURE`; production default is enabled | Deployment HTTPS/TLS verification | Open |
| RQ4 → Objective 4: synchronization resilience evaluation | Required | Deterministic network/failure profiles, fault proxy, and evaluation runner | Development smoke tests record SSR, canonical patient synchronization DCI, retry, attempt success, latency, queue drain, duplicates, and loss | Development evidence only; final controlled-experiment results pending |
| SSR is calculated from observed synchronization state | Required | `syncMetrics.ts`, `evaluate-sync.cjs` use unique eventually acknowledged operation IDs divided by unique scheduled operation IDs | Metric unit tests and isolated stable/adverse smoke runs | Instrumented; final study result not yet measured |
| Canonical patient synchronization DCI compares Edge and Central canonical data | Required | Full patient-field snapshots in `evaluate-sync.cjs`; `syncMetrics.ts` | Metric mismatch/missing/duplicate tests and isolated smoke runs | Instrumented for Edge-to-Central consistency; source-mapping DCI not yet measured |
| Adverse connectivity scenarios are reproducible | Required | Seven deterministic profiles and loopback fault proxy | Profile unit tests; each profile completed an isolated 10-operation development smoke | Development harness verified; formal protocol pending |
| Retry, duplicate, and data-loss outcomes are observable | Required | Edge/Central operation correlation plus proxy fault counters | Acknowledgement-loss, intermittent, outage, and interruption smoke runs | Instrumented |
| Latency, queue drain, throughput, CPU, memory, and storage growth are recorded | Required | Evaluation artifact performance block | Stable and adverse development smoke artifacts | Instrumented; final study result not yet measured |
| Actual source systems, exports, workflows, roles, and network characteristics are verified | Required technical audit | Audit deliverables listed in objective and architecture documents | Approved field evidence | Open |
| Final FHIR profiles and source transformations are validated | Required interoperability | Provisional canonical model only | FHIR conformance tests against approved profiles and verified source fixtures | Open |
