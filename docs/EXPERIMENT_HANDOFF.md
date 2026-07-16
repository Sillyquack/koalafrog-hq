# Experiment handoff

Formula and Lab handoffs are explicit transactional PostgreSQL functions. `create_formula_branch_from_experiment` derives a new Draft from an exact base Formula Version, applies mapped percentage changes, validates a 100% total, records Experiment/Variant provenance, and is idempotent. It never mutates the source version.

`create_lab_batch_from_experiment` snapshots an eligible Formula Version into a Planned Lab Batch, records provenance, and is idempotent. It creates no Inventory Movement and performs no stock allocation or consumption.

Direct provenance writes are blocked by database triggers. Every handoff records an immutable handoff row and lifecycle event. Failures roll back the whole transaction.

## Safe hosted rollout

1. Back up the hosted database and private Storage manifest.
2. Review `20260716130000_development_experiments.sql` and generated types.
3. Apply migrations with the established Supabase migration workflow.
4. Redeploy the application; the Intelligence Edge Function does not need changes for these tables.
5. Sign in as the owner and verify an empty Development library.
6. Review an existing Intelligence suggestion and save one Experiment deliberately.
7. Verify lifecycle, handoff, and RLS with disposable records and a second test user.

Do not seed, migrate, activate, or alter hosted domain data as part of this patch.
