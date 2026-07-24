# Procurement background research production runbook

This runbook is operator guidance. It does not authorize live traffic. Never
place secret values in Git, logs, tickets, shell history, or browser storage.

## Current checkpoint

- Supabase project: `fetmeynkvylznapdikht`
- functions: initiation (`verify_jwt=true`), webhook and reconciler
  (`verify_jwt=false`)
- live research: disabled
- OpenAI webhook: existing URL subscribed to `response.completed`
- `OPENAI_WEBHOOK_SECRET`: not configured in Supabase
- scheduler: not installed; `pg_cron` and `pg_net` are not enabled
- production lifecycle operations and webhook events: zero

## Preflight

Require a clean `main` at the reviewed release SHA, aligned local/remote
migrations, expected function versions/JWT settings, no active operations, and
a disabled feature flag. List secret names only. Stop on any mismatch.

## Webhook configuration

Keep the existing endpoint:

`https://fetmeynkvylznapdikht.supabase.co/functions/v1/procurement-live-research-webhook`

Official documentation says an endpoint supports one or more event types, but
the current dashboard was observed to permit only one selection. Leave
`response.completed` in place. Do not delete, recreate, rotate, add aliases, or
create duplicate endpoints during this checkpoint.

If the existing endpoint later supports multi-selection, prefer all four exact
terminal events on that one endpoint: `response.completed`, `response.failed`,
`response.incomplete`, and `response.cancelled`. No wildcard or public
webhook-management API is documented. Polling remains authoritative.

Under a separate approval, copy the endpoint signing secret directly into the
Supabase `OPENAI_WEBHOOK_SECRET` Edge Function secret. It is shown once. Never
configure an unverified value.

## Scheduler design

Use exactly one named Supabase Cron job, every minute, invoking only the
reconciler. Store its URL and header secret in Vault. Review and run this only
in the production SQL editor under separate approval:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://fetmeynkvylznapdikht.supabase.co/functions/v1/procurement-live-research-reconcile',
  'procurement_reconciler_url'
);
select vault.create_secret(
  '<enter reconciler secret interactively>',
  'procurement_reconciler_secret'
);

select cron.schedule(
  'procurement-background-reconcile',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name='procurement_reconciler_url'),
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-procurement-reconciler-secret',
      (select decrypted_secret from vault.decrypted_secrets
       where name='procurement_reconciler_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

Verify without revealing values:

```sql
select jobid,jobname,schedule,active
from cron.job
where jobname='procurement-background-reconcile';

select name,created_at,updated_at
from vault.secrets
where name in ('procurement_reconciler_url','procurement_reconciler_secret');
```

Remove safely:

```sql
select cron.unschedule('procurement-background-reconcile');
select vault.delete_secret(id)
from vault.secrets
where name in ('procurement_reconciler_url','procurement_reconciler_secret');
```

Do not disable shared extensions without checking other consumers.

## Negative tests

Before live traffic, confirm initiation remains feature-disabled and rejects
unauthenticated callers. Confirm missing, malformed, stale, or body-mismatched
webhook signatures fail closed. Confirm missing/incorrect reconciler secrets
return unauthorized. These checks must create no lifecycle rows and no OpenAI
request.

## Scheduler simulations

| Scenario | Expected result |
| --- | --- |
| Empty queue | `200`, processed `0` |
| One due operation | one lease, one bounded GET |
| Maximum batch | no more than 5 operations / 100-second transport ceiling |
| Overlap | leased operation returns busy to the second worker |
| HTTP failure | row remains due for later cron |
| Vault failure | invocation fails; no lifecycle mutation |
| `pg_net` disabled | visible cron failure; no provider submission |
| Cron outage | overdue rows resume on the next run |
| Long outage | incident before roughly ten-minute retention |

The five-operation batch and 20-second per-retrieval timeout bound provider
transport waiting to 100 seconds, leaving overhead below the documented
150-second free-plan wall-clock limit. A full batch remains a local simulation
and smoke-test gate.

## Read-only verification

Check counts only: operations, due operations, webhook inbox, active jobs,
candidates, supplier offers, recommendations, purchase plans, and inventory
movements. Check function versions, secret names, cron count, and Vault secret
names. Never select decrypted values.

### Unmatched webhook lifecycle

Verified events that arrive before exact provider attachment remain
`unmatched_pending` for 15 minutes. Each reconciler invocation atomically
terminalizes at most 25 expired, still-unattached rows as
`permanently_rejected` with `UNMATCHED_WEBHOOK_EXPIRED`. The sweep returns only
an aggregate count and uses row locks with `SKIP LOCKED`, so overlapping
reconcilers cannot terminalize the same row twice.

Exact attachment inside the grace window changes the event to `received`.
Attachment at or after the boundary does not reopen it; provider polling remains
the correctness path. Replays never reopen terminal rows. Keep terminal rows as
minimal audit evidence and never manually delete or rewrite them.

Inspect safely:

```sql
select processing_state,count(*) as event_count,
       min(received_at) as oldest_received_at
from public.procurement_background_webhook_inbox
group by processing_state
order by processing_state;
```

Alert when unmatched rows older than 15 minutes remain after two consecutive
one-minute scheduler runs, when more than 25 rows become due per minute, or when
`BACKGROUND_WEBHOOK_SWEEP_FAILED` repeats. Check scheduler health, the
reconciler deployment, RPC privileges, and database logs using safe codes only.
Do not inspect event IDs, provider IDs, payloads, headers, or signatures.

Deployment verification for this lifecycle:

1. Apply the forward unmatched-webhook migration.
2. Deploy the reviewed reconciler version.
3. Confirm the expiry RPC is executable only by `service_role`.
4. Confirm browser roles still cannot read or mutate the inbox.
5. Invoke one authenticated empty reconciliation through the protected
   mechanism and verify aggregate `expiredUnmatched`, `processed`, and
   `sweepStatus` fields only.
6. Confirm the known signed dashboard test artifacts transition naturally; do
   not target them with a data migration or manual update.

Rollback keeps live research disabled. If the new worker is unhealthy, roll
back the function while preserving the forward schema and audit rows. Never
reopen permanently rejected events; polling handles any attached operation.

## Controlled smoke-test gate

Do not proceed until the retention migration and functions are deployed, the
webhook secret is verified, the one-minute scheduler is healthy, negative tests
pass, and an operator explicitly approves one paid request. Record safe
correlation and timestamps, not provider IDs or raw output.

## Incidents and recovery

- Stuck job: check cron health, due count, lease age, safe failure code, and
  consecutive retrieval failures. Never reset the provider gate.
- Lost webhook: reconciliation must terminalize it.
- Unmatched accumulation: restore the one-minute reconciler, verify the bounded
  sweep RPC, and allow batches to drain. Never delete inbox history manually.
- Scheduler outage: restore the one named job. If an outage approached ten
  minutes with active operations, expect safe expiry; never auto-resubmit.
- Duplicate publication: verify one operation per job, one terminal timestamp,
  candidate count, and finalizer outcome. Preserve history.
- Disable traffic: set `PROCUREMENT_LIVE_RESEARCH_ENABLED` false first. Keep
  reconciliation running until existing work terminalizes or safely expires.

## Rotation and rollback

For the reconciler secret, generate a new high-entropy value, update Vault and
the Edge Function in one window, run negative checks, then remove the old value
from operator tooling.

Use the OpenAI dashboard rotation control only under explicit approval. Official
docs confirm rotation exists but do not say whether ordinary endpoint editing
preserves the secret. Update Supabase immediately and send a dashboard test
event without retaining the value.

For rollback, keep live disabled. Unschedule the one named job if unsafe and
revert code normally. Never mutate lifecycle history, provider gates, terminal
rows, candidate rows, or applied migration history.
