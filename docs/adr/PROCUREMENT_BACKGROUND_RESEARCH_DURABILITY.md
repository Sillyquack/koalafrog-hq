# ADR: Durable Procurement background research

## Status

Accepted. Production migrations and functions are deployed with live research
disabled. Retention-window hardening remains pending review and deployment.

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
                         exact attachment inside 15 minutes
unmatched_pending ─────────────────────────────────────────→ received
        │                                                       │
        └── 15-minute expiry sweep → permanently_rejected       ├→ processing
                                                                ├→ transient_failure
                                                                └→ processed/duplicate
```

Only event ID, response ID, event type, timestamps, counters, and safe codes are
stored. No raw body or result content is retained.

### Bounded unmatched webhook lifecycle

A correctly signed event can still be unrelated to any Koalafrog operation.
Leaving such an event in `unmatched_pending` forever would make the durable
inbox an unbounded nonterminal queue. A service-role-only database RPC therefore
terminalizes at most 25 unmatched rows per reconciler invocation after a
15-minute grace period. The RPC performs one atomic `FOR UPDATE SKIP LOCKED`
update and returns only a count; event and provider identifiers never leave
Postgres during the sweep.

Fifteen minutes accommodates an early webhook, ordinary attachment latency, a
brief database or deployment interruption, and several one-minute scheduler
runs. At or beyond that boundary, exact attachment does not reopen the event:
the row becomes `permanently_rejected` with the safe code
`UNMATCHED_WEBHOOK_EXPIRED`. The attached provider operation remains recoverable
through authoritative polling. This keeps terminal transitions monotonic and
avoids allowing an old event to publish results.

Replays of the same event ID remain idempotent and do not reopen terminal rows.
Attachment continues to use the exact globally unique provider operation ID;
there is no workspace search or fuzzy association. Terminal inbox rows are
retained as minimal audit metadata. Destructive purge is a separate retention
policy and is not part of this lifecycle fix.

## Processing and concurrency

Webhook and reconciliation use the same terminal processor and finalization
RPC. A worker claims an operation using a 60-second renewable/reclaimable lease.
The finalizer locks operation first, then research job, which is the universal
lock order. It verifies the operation/job workspace, owner, provider, and lease,
then inserts candidates and updates terminal state in one transaction. A second
processor sees a terminal row and returns `duplicate`.

Transient retrieval statuses are 404, 408, 409, 429, and 5xx, plus network,
body, timeout, and temporary storage failures. Each retrieval has a 20-second
transport timeout. OpenAI documents only roughly ten minutes of temporary
background Response retention, so retry delay is capped at 60 seconds and four
consecutive failed retrievals end in safe local expiry. A successful `queued`
or `in_progress` poll resets that failure budget. Malformed successfully
retrieved output is terminal and publishes nothing.

This is intentionally different from operation age. A legitimate background
Response may run for tens of minutes; successful running polls remain eligible,
while a continuous retrieval outage is bounded inside provider retention.

## Scheduler

`procurement-live-research-reconcile` is a service worker protected by the
dedicated `PROCUREMENT_RECONCILER_SECRET`. It processes at most 5 due operations
per invocation and first terminalizes at most 25 expired unmatched inbox rows.
The two workloads are independently bounded, and a sweep failure is logged with
a safe code without starving operation recovery. The worker never calls the
Responses create endpoint. Production should invoke it every minute through one
Supabase Cron job plus `pg_net`, with the URL and secret stored in Vault.
Scheduler installation is an explicit deployment step, not part of this
source-only task.

## OpenAI webhook decision

Official OpenAI documentation says a dashboard endpoint can subscribe to “one
or more event types.” The current Koalafrog project dashboard was observed on
2026-07-24 to expose only one selected event type and reject another endpoint
using the same URL. The public OpenAI API specification contains no webhook
endpoint management resource. Official documentation found in this review does
not document wildcard subscriptions, duplicate-URL rules, ordinary edit-secret
semantics, event ordering, or account/browser rollout differences.

The existing `response.completed` endpoint remains unchanged. Reconciliation is
authoritative and polls every attached nonterminal operation for `completed`,
`failed`, `incomplete`, and `cancelled`; webhooks accelerate processing. If the
existing endpoint can later select all four terminal events without rotating
its secret, that is useful resilience, but four URL aliases are not justified.

Official sources reviewed:

- <https://developers.openai.com/api/docs/guides/webhooks>
- <https://developers.openai.com/api/docs/guides/background>
- <https://platform.openai.com/docs/api-reference/webhook-events>

## Terminal recovery matrix

| Provider outcome | Webhook required | Reconciler action | Local result |
| --- | --- | --- | --- |
| `completed` | No | GET, validate, atomic finalize | candidates published once |
| `failed` | No | GET sees `failed` | safe failed job |
| `incomplete` | No | GET sees `incomplete` | safe failed job |
| `cancelled` | No | GET sees `cancelled` | cancelled job |
| `queued` / `in_progress` | No | reschedule; reset failures | remains active |
| terminal but GET unavailable | No | retry at 15–60 seconds | recover or safe-expire |
| terminal after local cancellation | No | finalizer discards | no candidates |

## Failure modes

| Failure | Recovery/invariant |
| --- | --- |
| Lost/delayed webhook | next reconciliation polls the Response |
| Early webhook | exact attachment within 15 minutes; otherwise safe permanent rejection and polling |
| Duplicate webhook | inbox and finalizer are idempotent |
| Webhook/reconciler race | lease plus row lock; loser is busy/duplicate |
| Scheduler overlap | lease prevents duplicate processing |
| Missed scheduler run | later run processes overdue rows |
| Transient GET failure | bounded retry inside retention |
| Expired GET | safe terminal expiry; never resubmit |
| Interrupted worker | 60-second lease is reclaimable |
| Ambiguous submission | never resubmit; safe failure after 30 minutes |
| Local cancellation | terminal provider result is discarded |

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

### Private-table privilege boundary

Production verification after the durable migration exposed a Supabase
public-schema default: newly created tables can retain broad `service_role`
table privileges even when a migration explicitly grants only `SELECT`. Direct
`service_role` writes would bypass the validation, locking, and idempotency
rules owned by the lifecycle RPCs.

The forward `procurement_background_rpc_boundary` migration therefore revokes
all privileges on both internal tables from `public`, `anon`, `authenticated`,
and `service_role`, then grants only `SELECT` to `service_role`. The effective
matrix is:

| Role | SELECT | INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER |
| --- | --- | --- |
| `anon` | No | No |
| `authenticated` | No | No |
| `service_role` | Yes | No |

All mutations remain available to `service_role` only through the fixed-search-
path `SECURITY DEFINER` lifecycle RPCs. Future private server-owned tables must
follow the same migration pattern: revoke every default role privilege
immediately after creation, minimally re-grant required access, and test the
effective privileges with `has_table_privilege` plus behavioral denial checks.

## Operational runbook

- `submission_ambiguous`: wait for the 30-minute reconciliation horizon; never
  manually reset the invocation counter.
- `reconciling`: inspect safe function outcome counts and scheduler health.
- repeated transient retrieval: confirm OpenAI availability and secret validity;
  do not create a replacement job while the original is active.
- expired operation: preserve the audit row. The owner may explicitly create a
  new research job after the original reaches safe terminal failure.
- stuck lease: it is reclaimable after expiry; do not edit internal rows.
- unmatched webhook accumulation: inspect aggregate state/age counts. More than
  25 due rows for two consecutive one-minute runs indicates arrival pressure or
  scheduler failure; do not delete rows manually.
