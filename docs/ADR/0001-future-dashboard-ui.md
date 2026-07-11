# ADR 0001: Dashboard/UI — Deferred, Pending Team & Adviser Alignment

Status: Proposed (not yet approved)
Date: 2026-07-11

## Context
A UI/dashboard has been raised as a likely future need — specifically to give
visibility into sync-engine state (pending / merged / saved-locally records)
for both BHWs at the edge and admins at the central level. Raised informally
by project partner; not yet discussed with adviser or formally scoped.

## Decision
Not building yet. Logged here so the idea isn't lost, and so future
architecture decisions (e.g., sync-engine's queue module data shape) can
keep this consumer in mind without committing to it prematurely.

## Preliminary direction (if approved later)
- Likely React + TypeScript, as a new `dashboard/` workspace in the monorepo
- Two possible audiences, possibly two separate views:
  - BHW-facing (edge-node-served): local sync status for their own device
  - Admin-facing (central-server-facing): fleet-wide sync/edge-node health
- Depends on:
  - Auth scaffold (dashboard needs login)
  - sync-engine's queue module (pending/merged/saved states must exist as
    real trackable data before a UI can display them)

## Next steps before this becomes active work
1. Discuss with project partner — confirm scope and necessity
2. Discuss with adviser — confirm it's in scope for the capstone timeline
3. Revisit this ADR and update status to Accepted / Rejected / Modified