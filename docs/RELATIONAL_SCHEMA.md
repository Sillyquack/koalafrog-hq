# Relational schema

Phase 8B.1 persists all 50 v9 collections in 50 explicit domain tables plus five relational child/join tables. Stable application IDs remain `text`; every entity primary key is `(workspace_id, id)`. Child foreign keys include `workspace_id`, preventing cross-workspace relationships. All private tables also carry `owner_id` for clear RLS policies.

## Collection mapping

- Product development: `products`, `formulas`, `formulaVersions`, `formulaLines` → `products`, `formulas`, `formula_versions`, `formula_lines`.
- Raw materials: `ingredients`, `supplierProducts`, `inventoryLots`, `inventoryMovements` → `ingredients`, `supplier_products`, `inventory_lots`, `inventory_movements`.
- Lab: `labBatches`, `labBatchLines`, `labBatchAllocations`, `processSteps`, `labObservations` → `lab_batches`, `lab_batch_lines`, `lab_lot_allocations`, `lab_process_steps`, `lab_observations`.
- Testing: `testers`, `testTemplates`, `testSessions`, `testResponses` → `testers`, `test_templates`, `test_sessions`, `test_responses`; embedded questions and answers become `test_template_questions` and `test_response_answers`.
- Production: `productionRuns`, `productionRunLines`, `productionRunAllocations`, `productionProcessSteps`, `costLines` → `production_runs`, `production_run_lines`, `production_lot_allocations`, `production_process_steps`, `cost_lines`.
- Packaging: `packagingComponents`, `packagingSupplierProducts`, `packagingInventoryLots`, `packagingInventoryMovements`, `packagingSpecifications`, `packagingSpecificationVersions`, `packagingSpecificationLines`, `packagingAllocations` → their snake-case relational tables.
- Finished Goods: `finishedGoodsBatches`, `finishedGoodsMovements` → `finished_goods_batches`, `finished_goods_movements`.
- Compliance: the 15 v9 collections map to `responsible_persons`, `compliance_dossiers`, `compliance_documents`, `regulatory_sources`, `regulatory_reviews`, `pif_evidence_sections`, `cpsr_records`, `label_artwork_versions`, `label_checklist_items`, `inci_declarations`, `claims`, `claim_evidence`, `cpnp_records`, `readiness_issues`, and `undesirable_effect_records`. Dossier composition lines become `compliance_composition_snapshots`; regulatory sources and PIF document references use `regulatory_review_sources` and `pif_section_documents` join tables.
- Launch: `launchPlans`, `launchMilestones`, `launchDecisions` → `launch_plans`, `launch_milestones`, `launch_decisions`.

The authoritative mapping is exported as `relationalTableByCollection` and checked against `FormulaState` in tests.

## Constraints and history

Foreign keys are `DEFERRABLE INITIALLY DEFERRED` so one transaction can preserve cyclic current-version references while still rejecting orphans at commit. Workspace-aware unique constraints cover raw-material lot, packaging lot, Lab Batch, Production Run, and Finished Goods Batch numbers. Positive/non-zero checks protect structural quantities without duplicating workflow transition logic.

Execution snapshot columns remain ordinary immutable historical fields beside their relational references. This includes ingredient names, phases, planned percentages and quantities, cost snapshots, exact release configuration IDs, and dossier composition snapshots.

## Embedded values

No major domain entity is stored as JSONB. `test_response_answers.value` is JSONB because the existing answer value is a scalar union of string, number, or boolean. Small non-relational primitive lists remain PostgreSQL arrays: ingredient functions, template choices, unresolved INCI items, and decision-risk title lists. Entity references use join tables. Migration/report JSONB belongs to the platform audit envelope, not the domain store.

## Import and reconciliation

`import_v9_relational(jsonb)` is an authenticated, `security invoker` transaction. It derives ownership from `auth.uid()`, refuses a populated relational workspace, preserves IDs, inserts in dependency-safe order, and leaves the workspace `reconciliation_required`. The payload is input only and is never retained as the domain source.

Reconciliation compares every collection count and ID, all three ledgers, Production and Finished Goods historical costs, exact Compliance configuration references, and Launch history. `complete_v9_reconciliation` records a Completed migration report only for an authenticated complete comparison. Failed imports roll back all domain rows; `record_v9_migration_failure` records the separate failure report afterward.

`workspace_records` remains only for the earlier scaffold and rollback/debug compatibility. Phase 8B.1 no longer imports new domain data into it. Application source-of-truth cutover is intentionally deferred to Phase 8B.2 and Phase 8B.3.

Phase 8B.2 ordinary mutations use the same collection-to-table map and never write `workspace_records`. Mutable rows use their previous `updated_at` value as a conflict predicate. Multi-table Lab, Production, Packaging, and Finished Goods output operations use dedicated authenticated transactional RPCs.
