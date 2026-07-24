# ADR: Durable Procurement background research

## Status

Accepted for the unmerged `feat/procurement-background-research` implementation.

## Problem

Creating an OpenAI background Response and recording its opaque ID cannot be one
database transaction. Webhooks can arrive before attachment, can be duplicated,
or can be lost. Retrieval and database writes can fail transiently. A browser
acknowledgement is not authoritative.

## Invariants

1. One research job consumes its provider gate at most once.
2. One job has one durable submission intent and at most one provider operation.
3. One provider operation binds to at most one intent.
4. Candidate publication occurs at most once.
5. Cancellation or a prior terminal job state prevents late publication.
6. A verified webhook is acknowledged only after safe metadata is durable.
7. Transient processing failures reschedule processing; they never submit again.
8. The browser cannot terminalize an accepted operation because an HTTP response was lost.
9. Internal provider and webhook identifiers never enter browser-readable storage.
10. Raw provider output is validated in memory and never persisted.

## State machine

`procurement_research_jobs.status` remains the owner workflow. Internal lifecycle
uses `procurement_background_operations`:

```text
intent_created → submitting ───────────────→ provider_queued/provider_in_progress
                    │                                      │
                    └→ submission_ambiguous                ├→ terminal_pending_processing
                                                           │
                                                           └→ completed/failed/incomplete/cancelled
```

An unbound ambiguous intent is never resubmitted. Reconciliation detects it and
ends it with `BACKGROUND_SUBMISSION_AMBIGUOUS` after 30 minutes. This cannot
recover an OpenAI Response whose HTTP response was received by a process that
terminated before the response ID reached Postgres; OpenAI documents
`X-Client-Request-Id` for support correlation, not idempotent create or API
lookup. The local intent nevertheless makes the ambiguity visible and bounded.

Webhook inbox state is:

```text
received/unmatched_pending → processing → processed
                         ↘ transient_failure ↗
```

Only event ID, response ID, event type, timestamps, counters, and safe codes are
stored. No raw body or result content is retained.

## Processing and concurrency

Webhook and reconciliation use the same terminal processor and finalization
RPC. A worker claims an operation using a 60-second renewable/reclaimable lease.
The finalizer locks operation first, then research job, which is the universal
lock order. It verifies the operation/job workspace, owner, provider, and lease,
then inserts candidates and updates terminal state in one transaction. A second
processor sees a terminal row and returns `duplicate`.

Transient retrieval statuses are 404, 408, 409, 429, and 5xx, plus network,
body, timeout, and temporary storage failures. Each retrieval has a 20-second
transport timeout. Durable exponential backoff is bounded at six hours.
Processing expires after 12 attempts or 48 hours. Malformed
successfully retrieved output is terminal and publishes nothing.

## Scheduler

`procurement-live-research-reconcile` is a service worker protected by the
dedicated `PROCUREMENT_RECONCILER_SECRET`. It processes at most 20 due operations
per invocation and never calls the Responses create endpoint. Production should
invoke it every two minutes through Supabase Cron plus `pg_net`, with the URL and
secret stored in Vault. Scheduler installation is an explicit deployment step,
not part of this source-only task.

## Cancellation

Local cancellation is authoritative for Koalafrog publication. Reconciliation
continues only to learn and record the provider terminal state; finalization
discards candidates when cancellation committed first. Provider cancellation is
deferred because it requires another durable outbound-command lifecycle. No
automatic resubmission occurs.

## Privacy

Internal tables have RLS enabled and no anon/authenticated privileges.
Service-role RPCs use fixed `search_path`. Owner-visible jobs expose only a
coarse lifecycle label. Provider IDs, webhook IDs, prompts, raw output, keys,
JWTs, signed URLs, and supplier result content are excluded from diagnostics and
logs.

## Operational runbook

- `submission_ambiguous`: wait for the 30-minute reconciliation horizon; never
  manually reset the invocation counter.
- `reconciling`: inspect safe function outcome counts and scheduler health.
- repeated transient retrieval: confirm OpenAI availability and secret validity;
  do not create a replacement job while the original is active.
- expired operation: preserve the audit row. The owner may explicitly create a
  new research job after the original reaches safe terminal failure.
- stuck lease: it is reclaimable after expiry; do not edit internal rows.
