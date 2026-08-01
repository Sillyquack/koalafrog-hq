# Production Procurement Draft Plan Authoring Migration Retry — 2026-08-01

## Result

**PASS — production advanced exactly from migration 90 to migration 91.**

The repository-controlled Supabase workflow applied only
`20260731205657_procurement_draft_plan_authoring_v1.sql` to the canonical
Koalafrog HQ production project. The linked CLI completed with exit code `0`,
the hosted migration history independently read back all 91 repository versions
in order, and a final dry run reported that the remote database was up to date.

No Draft Purchase Plan was created. All required business counts and all
captured full-row fingerprints remained unchanged. Production still has zero
Internal Purchase Plans, Purchase Orders, and Procurement Recommendations. The
existing deployed application reports migration state `Match` at 91 /
`20260731205657`.

Procurement Reality Phase 2 was not resumed, the 34 procurement operations were
not resumed, Packaging was not updated, and the pre-existing Procurement Reality
stash was not inspected or changed.

## Repository and target

- Required branch:
  `ops/apply-procurement-draft-plan-authoring-v1-v2`
- Starting HEAD:
  `332e0284e2cee89c77435d0e7fea4225f19ac2cc`
- Refreshed `origin/main`:
  `332e0284e2cee89c77435d0e7fea4225f19ac2cc`
- Starting ahead / behind relative to `origin/main`: `0 / 0`
- Required ancestors present on `origin/main`:
  - `11f94df8dcf93d93523664e1f66881ebcf65d147`
  - `33548c0912f421daf755666da4b657a5ee542350`
- Starting working tree: clean
- Evidence commit: the commit containing this file; resolved dynamically to
  avoid a self-referential hash
- Canonical production project: `fetm…dikht` (`Koalafrog HQ`, redacted)
- Project health before and after: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- PostgreSQL: `17.6.1.141`
- Linked project file, local application configuration, Supabase connector, and
  Dashboard title all identified the same canonical production project
- Supabase CLI: lockfile-installed `2.109.1`
- Existing deployed frontend: `https://koalafrog-hq.pages.dev`

No access token, publishable key, service-role credential, connection string,
Auth identifier, workspace identifier, owner identifier, or stash content is
recorded here. No migration repair, production reset, Dashboard SQL, manual SQL
paste, deployment, push, or pull request was used.

## Backup gate

The authenticated production Dashboard showed a current completed/listed
physical backup with an available Restore action:

- Timestamp: `2026-08-01 04:18:32 UTC`
- Type: `PHYSICAL`
- Restore action: available
- Restore to New Project: available as a separate Beta workflow
- Older completed physical backups: present

No restore action was clicked. Database backup recovery does not restore Storage
object binaries; private Storage recovery remains a separately controlled
procedure.

## Strict 90 → 91 suffix and checksum proof

Immediately before mutation:

- Repository migrations: 91 unique ordered versions
- Repository head: `20260731205657`
- Production migrations: 90 ordered versions
- Production head: `20260731044225`
- Remote-only migrations: none
- History divergence: none
- Shared prefix: all first 90 versions paired in exact repository order
- Only local-only version: `20260731205657`
- Linked dry run listed only:
  `20260731205657_procurement_draft_plan_authoring_v1.sql`

Checksums:

- Superseded checksum:
  `4d0ccac05c14f7adef6f25e8649bc9de0f2dedb0ff79d563fb0afc967ede286a`
- Hardened checksum:
  `b1a101383988231173bbc5f9becb1d992fa72bb9c88b548b4581064c992ebfc8`
- Pending file checksum immediately before apply: exact hardened match
- Generated hosted-migration manifest: exact hardened match

Fresh connector enumeration returned all three accessible projects: the
Koalafrog production project, the Koalafrog Auth rehearsal project, and an
unrelated `mesh-shift-log` project. The two persistent Koalafrog database
environments and the production frontend were checked as follows:

- production was at 90 with the target version absent;
- the persistent Auth rehearsal project was at 87 with the target absent; and
- the currently deployed application bundle contained the hardened checksum
  once and the target version three times, while containing the superseded
  checksum zero times.

The superseded digest remains intentionally quoted in historical repository
evidence describing the blocked first attempt and the hardening correction. It
is not present in an active hosted migration or deployed application artifact.
Absence of a migration-history row alone cannot prove that equivalent SQL was
never manually executed. The checks establish that there was no hosted history
or deployed-artifact reference to the superseded checksum; the hardened apply
also created every target object without a duplicate-object error. Together
these provided no evidence that the superseded body was materialized before the
controlled apply, without overstating migration history as a general manual-SQL
audit.

## Hardened migration risk review

The migration creates no new table and executes no business-data backfill. It:

- adds Draft authority, budget/range, evidence, and authoring columns to
  `purchase_plans`;
- makes selected basket planning totals nullable to preserve Unknown values and
  adds VAT, dangerous-goods, payment-FX, and evidence fields;
- adds line-source and evidence-snapshot fields plus a Packaging Component
  foreign key;
- creates two internal helpers and the aggregate
  `create_draft_purchase_plan_v1` RPC;
- removes direct browser mutation authority from plan, basket, and line tables;
  and
- adds a normalized, partial unique index for active owner-authored Draft
  titles.

Operational risks reviewed before apply:

- `ALTER TABLE`, constraint/FK validation, and non-concurrent index creation
  take ordinary PostgreSQL locks; the migration defines no `lock_timeout`;
- the baseline of zero plans, baskets, and lines bounded validation/index work;
- the new `(workspace_id, packaging_component_id)` referencing columns have no
  covering index, which is a future performance consideration rather than a
  correctness defect;
- non-empty child semantics are enforced by the aggregate RPC and browser DML
  denial rather than a cross-table declarative constraint; and
- no down migration exists, so recovery is a reviewed forward fix or the
  controlled physical-backup process.

The three-second apply completed without lock, constraint, transaction, or
schema-cache error.

## Production execution

```text
apply_start_utc=2026-08-01T07:15:26Z
apply_command=npx --no-install supabase db push --linked --yes
apply_finish_utc=2026-08-01T07:15:29Z
apply_duration_seconds=3
apply_exit_code=0
```

CLI output identified exactly one migration, then reported:

```text
Applying migration 20260731205657_procurement_draft_plan_authoring_v1.sql...
Finished supabase db push.
```

Transaction result: **committed and unambiguous**. This is supported by the
successful command, the new unique remote history row, the independently
materialized schema objects, all 91 paired CLI history entries, and the final
“Remote database is up to date” dry run. Retry count was zero. Migration repair
and repair SQL were not used.

The only apply warning was that Supabase CLI `2.111.0` was available while the
lockfile-installed version was `2.109.1`. No migration warning or SQL
notice was emitted.

## Final 91-version history

The linked CLI paired every local and remote version. The independent hosted
connector returned the same count, order, names, and head:

```text
20260714210000 — platform_foundation
20260715090000 — relational_domain
20260715120000 — application_action_rpcs
20260715121000 — rpc_helper_permissions
20260715130000 — document_storage_lifecycle
20260715140000 — clean_workspace_bootstrap
20260715193000 — nullable_product_target_launch_date
20260715200000 — intelligence_foundation
20260716090000 — intelligence_memory
20260716130000 — development_experiments
20260716180000 — procurement_equipment_foundation
20260716200000 — procurement_quote_line_created_at
20260716210000 — atomic_supplier_product_preference
20260716220000 — ingredient_metadata_clarity
20260716230000 — ingredient_reference_adoption
20260717090000 — milligram_unit_support
20260717110000 — ingredient_supplier_workflow
20260717120000 — atomic_preference_timestamp_alignment
20260718090000 — product_studio_concepts
20260718120000 — beard_butter_multiphase
20260719090000 — atomic_product_studio_formula_handoff
20260720090000 — natural_deodorant_product_studio
20260720120000 — ingredient_knowledge_foundation
20260720160000 — beard_studio_foundation
20260720170000 — beard_studio_hosted_runtime
20260720180000 — beard_studio_child_replacement
20260720190000 — beard_studio_merge_cleanup
20260720200000 — beard_studio_workspace_integrity
20260720210000 — beard_studio_stale_write_guard
20260720220000 — beard_log_cascade_cleanup
20260721140000 — beard_photo_analysis
20260721150000 — beard_photo_privilege_hardening
20260721210000 — beard_photo_attempt_provenance
20260722090000 — beard_semantic_diagnostics
20260722100000 — beard_guard_strategy_semantics
20260722101000 — beard_semantic_v3_constraints
20260722110000 — beard_persistence_diagnostics
20260722130000 — beard_observation_keys
20260722190000 — beard_support_diagnostic_lookup
20260723044918 — fix_beard_support_diagnostic_rpc
20260723060732 — beard_semantic_safety_v4
20260723071830 — procurement_workspace_v1
20260723073840 — assisted_procurement_research
20260723080007 — live_procurement_provider
20260723095108 — procurement_stabilization
20260723105527 — secure_live_procurement_invocation
20260723125652 — beard_provider_timeout_observability
20260723191905 — procurement_provider_diagnostics
20260723213000 — procurement_background_research
20260724054059 — procurement_background_rpc_boundary
20260724064750 — procurement_background_retention_window
20260724124819 — procurement_unmatched_webhook_lifecycle
20260725093000 — procurement_purchasing_intelligence
20260725133000 — procurement_purchasing_intelligence_hardening
20260726122046 — beard_semantic_failure_invariant
20260726124135 — beard_support_lookup_backward_compatibility
20260726185922 — beard_guard_strategy_v6
20260727043935 — beard_provider_429_classification
20260727055227 — beard_responses_parser_v1
20260727095115 — beard_intelligence_v2
20260727095850 — beard_support_lookup_v6_composition
20260727114702 — beard_legacy_null_target_review
20260727120000 — supplier_documentation
20260727121000 — supplier_history_reliability
20260727131021 — production_procurement_durable_workflow
20260727135143 — production_procurement_supplier_matching
20260727141437 — production_procurement_basket_scenarios
20260727155213 — procurement_semantic_separation_v1
20260727165818 — production_purchase_plan_approval_gate
20260728080000 — draft_purchase_order_handoff
20260728090000 — external_purchase_order_placement
20260728100000 — supplier_confirmation_and_shipments
20260728110000 — physical_receiving_inspection_quarantine
20260728120000 — controlled_quality_release_inventory_commitment
20260728130000 — procurement_release_candidate_hardening
20260728140000 — production_inventory_reservations
20260728150000 — production_inventory_consumption_reconciliation
20260728154754 — production_output_yield_reconciliation_v1
20260728160000 — production_inventory_control_contracts_v1
20260728170000 — packaging_run_planning_consumption_v1
20260728203257 — finished_goods_lot_creation_quarantine_v1
20260729043721 — finished_product_quality_release_v1
20260729054425 — active_finished_goods_inventory_controls_v1
20260729065048 — batch_genealogy_traceability_v1
20260729083226 — platform_authority_hardening_v1
20260729094510 — recall_readiness_v1
20260729160000 — rehearsal_definer_execute_hardening
20260730123820 — workspace_foundation_authoring_v1
20260730154408 — supplier_product_owner_workspace_integrity
20260731044225 — workspace_seed_evidence_surfaces_v1
20260731205657 — procurement_draft_plan_authoring_v1
```

Final count: `91`. Final head: `20260731205657`. There is no local-only,
remote-only, duplicate, reordered, or drifted version.

## Hardened authority and schema verification

Read-only hosted catalogue inspection proved:

- the aggregate RPC has the exact four-argument signature;
- it is owned by trusted `postgres`, is `SECURITY DEFINER`, and has the fixed
  empty search path;
- `authenticated` can execute the aggregate RPC, while `anon` and `PUBLIC`
  cannot;
- the numeric and receipt helpers have fixed empty search paths and deny
  `PUBLIC`, `anon`, and `authenticated`; hosted default privileges leave them
  callable only by trusted `postgres` / `service_role`, never browser roles;
- all three aggregate tables have RLS enabled;
- `authenticated` has SELECT only on plans, baskets, and lines;
- `anon` has no table privilege on those tables;
- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER are denied to both
  browser roles on all three tables;
- all ten target checks/FK constraints exist and are validated;
- all three budget/range constraints use null-safe `num_nonnulls(... )` pairing;
- the Packaging Component foreign key is present and validated;
- `purchase_plans_active_draft_normalized_title_unique` is unique, ready,
  valid, scoped to active owner-authored Drafts, and normalizes surrounding
  whitespace plus case;
- Draft placement defaults are `unplaced` and `order_authorized=false`; and
- evidence JSON is non-null with an object default/check.

Static hosted function-definition checks found DML only for
`purchase_plans`, `purchase_plan_baskets`, and `purchase_plan_lines`. The RPC
contains the authenticated owner/workspace lookup, advisory transaction lock,
payload fingerprint, `reused`, `IDEMPOTENCY_CONFLICT`, and normalized-title
conflict contracts. It contains no write path for Purchase Orders,
recommendations, carts/checkout, scenario publication, verification records,
inventory lots, Packaging lots, receipts, ownership, payment, or Quality
Release.

The Supabase security advisor reports the authenticated aggregate
`SECURITY DEFINER` endpoint as an intentional warning; the exact owner,
search-path, caller-derived authority, ACL, RLS, and browser-DML checks above
are the compensating contract. See the
[authenticated SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
The performance advisor reports the new Packaging Component foreign key as
unindexed informational debt, matching the pre-apply risk review. See the
[unindexed foreign-key advisory](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
No repair or opportunistic schema change was made.

The explicit hosted `service_role` helper grant is a Supabase
default-privilege materialization that differs from the owner-only helper ACL
observed in the local hardening environment. It still satisfies the requested
internal-helper restriction: `service_role` is a trusted backend role whose
credential is prohibited from the frontend, while `PUBLIC`, `anon`, and
`authenticated` are denied. The variance is recorded rather than hidden, and
no ad hoc privilege repair was improvised.

## Business integrity

| Record class | Before | After | Result |
| --- | ---: | ---: | --- |
| Ingredients | 18 | 18 | unchanged |
| Suppliers | 58 | 58 | unchanged |
| Supplier Products | 22 | 22 | unchanged |
| Equipment | 3 | 3 | unchanged |
| Packaging Components | 9 | 9 | unchanged |
| Procurement Requests | 26 | 26 | unchanged |
| Procurement Requested Items | 45 | 45 | unchanged |
| Raw-material inventory lots | 0 | 0 | unchanged |
| Packaging inventory lots | 0 | 0 | unchanged |
| Internal Purchase Plans | 0 | 0 | unchanged |
| Purchase Plan Baskets | 0 | 0 | unchanged |
| Purchase Plan Lines | 0 | 0 | unchanged |
| Purchase Orders | 0 | 0 | unchanged |
| Procurement Recommendations | 0 | 0 | unchanged |
| Procurement Supplier Offers | 55 | 55 | unchanged |
| Purchase Order Receipts | 0 | 0 | unchanged |
| Raw-material inventory movements | 0 | 0 | unchanged |
| Packaging inventory movements | 0 | 0 | unchanged |
| Auth users | 1 | 1 | preserved |
| Auth identities | 1 | 1 | preserved |
| Workspaces | 1 | 1 | preserved |
| Owned workspaces | 1 | 1 | preserved |

Server-side full-row fingerprints matched before and after for Ingredients,
Suppliers, Supplier Products, Equipment, Packaging Components, Procurement
Requests, Requested Items, Offers, Recommendations, and the workspace. Stable
Auth user/identity and workspace-owner fingerprints also matched exactly.

No Packaging, Supplier, Supplier Product, Offer, inventory, movement, order,
receipt, ownership, payment, verification, Quality Release, Auth identity, or
workspace record was created, updated, or deleted by the migration.

## Existing deployed application

No frontend deployment was triggered.

After the production apply, the existing Platform page was explicitly
refreshed and reported:

- Actual migration count: `91`
- Expected application count: `91`
- Actual migration head: `20260731205657`
- Expected application head: `20260731205657`
- State: `Match`
- Final evaluated readback: `2026-08-01T07:21:54.53021+00:00`

The production Draft Plan Builder loaded with live owner-workspace Suppliers and
source records. It showed:

> Draft only — does not place an order. Unknown costs remain Unknown. No
> supplier receives this plan.

The Builder emitted no browser console warning or error and showed no
missing-column, schema-cache, authorization, chunk, or runtime failure. The
form was not reviewed or submitted, so the browser did not invoke the creation
RPC. RPC existence, signature, ownership, fixed search path, and caller ACL were
instead proved by the separate read-only hosted catalogue inspection; no
browser-RPC success is claimed.

Because production correctly remains at zero plans, no persisted detail page
can display a real status strip. The currently deployed detail chunk was loaded
read-only and its shipped artifact was verified to contain the exact `Draft`,
`Unplaced`, and `Not authorised for ordering` labels. No Draft was created to
manufacture that visual proof.

## Local validation ledger

| Validation | Result |
| --- | --- |
| `git diff --check` | PASS before apply |
| `npm ci` | PASS; 203 packages installed |
| exact local upgrade 90 → 91 | PASS; only migration 91 applied |
| fresh local reset through 91 | PASS |
| focused hardening suite | PASS; 68 assertions |
| real normalized-title concurrency | PASS; 6 assertions and observed lock wait |
| focused pgTAP | PASS; 1 file / 74 assertions |
| full pgTAP | PASS; 25 files / 1,332 assertions |
| Supabase integration | PASS; 12 files / 56 tests |
| authority audit | PASS; 10 artifacts / 0 critical findings |
| privilege audit | PASS; 10 artifacts / 0 critical findings |
| migration audit | PASS; 91 migrations |
| documentation audit | PASS; 81 Markdown files / 0 findings |
| secrets audit | PASS; 800 repository files including this report |
| ESLint | PASS |
| TypeScript project build | PASS |
| unit/component suite | PASS; 129 files / 935 tests |
| separately executed database tests skipped by unit suite | PASS; 12 files / 56 tests |
| Cloudflare readiness | PASS |
| production build | PASS; 2,066 modules transformed |
| final linked history and no-pending dry run | PASS |
| final Platform Match and business comparison | PASS |

`npm ci` warned that two optional `fsevents` install scripts were not in npm's
allow-scripts list. The production build repeated the repository's known
ineffective dynamic-import and large-chunk warnings. Neither warning changed
tracked files or blocked the relevant test/build command.

`deploy:preflight` requires a clean committed tree and is therefore run after
the single evidence commit. Its actual result belongs to the final handoff; it
cannot be self-recorded inside that same immutable commit without a second
commit or amendment.

The documentation audit scans `docs/**/*.md` and does not include this required
root-level report. This report received a separate read-only evidence review,
the post-report secret scan covered 800 repository files including this file,
and the final `git diff --check` is run immediately before staging.

## Recovery posture and untouched scope

- Production migration/schema: exactly 91 / `20260731205657`
- Production business data: unchanged
- Draft Purchase Plans: zero; none created
- Purchase Orders and Recommendations: zero
- Auth identity and owner workspace: preserved
- Private Storage objects: untouched
- Packaging: untouched
- Supplier and Supplier Product records: untouched
- Cloudflare and environment configuration: untouched
- Existing frontend: no deployment
- Repository remote: no push, pull request, merge, or tag
- Procurement Reality Phase 2: not resumed
- 34 procurement operations: not resumed
- Procurement Reality stash: still one entry at
  `de5e8c4dbbe6582c1b276f829f5477c073ffeda0`; not applied, popped, dropped,
  rewritten, restored, or inspected for content

If a later defect requires recovery, do not edit migration history or improvise
production SQL. Use a reviewed forward migration or the controlled physical
backup/restore process, with independent history, Auth/workspace, business-data,
and private-Storage verification.
