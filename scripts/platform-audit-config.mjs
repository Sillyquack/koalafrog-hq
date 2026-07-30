export const auditVersion = "1.0.0"
export const generatedAt = "2026-07-29T12:00:00+02:00"

export const legacyDatabaseObjects = new Map([
  ["table:public.finished_goods_batches", {
    classification: "legacy_frozen",
    domain: "legacy-finished-goods",
    replacement: "public.finished_goods_lots",
    notes: "Legacy Active predates controlled finished-product quality release.",
  }],
  ["table:public.finished_goods_movements", {
    classification: "legacy_frozen",
    domain: "legacy-finished-goods",
    replacement: "public.finished_goods_inventory_movements",
    notes: "Historical legacy Finished Goods movement ledger; no new controlled writes.",
  }],
  ["table:public.packaging_allocations", {
    classification: "legacy_frozen",
    domain: "legacy-finished-goods",
    replacement: "public.packaging_run_inventory_reservations",
    notes: "Legacy Finished Goods packaging commitment; Slice 2 owns new packaging control.",
  }],
  ["table:public.workspace_records", {
    classification: "compatibility_read_only",
    domain: "platform-migration",
    replacement: "public relational domain tables",
    notes: "v9 rollback/reconciliation source only after relational activation.",
  }],
  ["function:public.register_finished_goods_output(jsonb,jsonb)", {
    classification: "deprecated_pending_removal",
    domain: "legacy-finished-goods",
    replacement: "public.create_finished_goods_lot_v1",
    notes: "Authenticated execution frozen; retained for migration/service compatibility.",
  }],
  ["function:public.commit_packaging_consumption(text,jsonb,jsonb)", {
    classification: "deprecated_pending_removal",
    domain: "legacy-finished-goods",
    replacement: "public.record_packaging_inventory_use_v1",
    notes: "Authenticated execution frozen; retained for historical compatibility.",
  }],
])

export const applicationLegacyAllowlist = [
  {
    path: "src/platform/repository/supabaseWorkspaceRepository.ts",
    reason: "Compatibility hydration and fail-closed adapter errors for v9/legacy collections.",
    owner: "platform",
    removalTiming: "After hosted relational reconciliation and legacy export retention approval.",
  },
  {
    path: "src/platform/repository/relationalMigration.integration.test.ts",
    reason: "Compatibility and migration regression evidence.",
    owner: "platform",
    removalTiming: "With the compatibility adapter.",
  },
  {
    path: "src/platform/security/securityStorage.integration.test.ts",
    reason: "Security regression coverage for denied legacy authority.",
    owner: "security",
    removalTiming: "Retain while legacy structures exist.",
  },
  {
    path: "src/features/finished-goods/FinishedGoodsPage.tsx",
    reason: "Read-only legacy history route.",
    owner: "legacy-finished-goods",
    removalTiming: "After legacy history migration is approved.",
  },
  {
    path: "src/features/finished-goods/FinishedGoodsDetailPage.tsx",
    reason: "Read-only legacy history detail.",
    owner: "legacy-finished-goods",
    removalTiming: "After legacy history migration is approved.",
  },
  {
    path: "scripts/generate-relational-migration.mjs",
    reason: "Historical v9-to-relational migration generator.",
    owner: "platform-migration",
    removalTiming: "After hosted reconciliation rollback window closes.",
  },
  {
    path: "src/features/beard-studio/beardStudioUi.test.ts",
    reason: "Regression assertion that Beard Studio does not write the compatibility record store.",
    owner: "beard-studio",
    removalTiming: "With the compatibility record store.",
  },
  {
    path: "src/features/finished-goods-control/data/finishedGoodsLot.integration.test.ts",
    reason: "Canonical Finished Goods integration asserts that no legacy movement is created.",
    owner: "finished-goods",
    removalTiming: "When the legacy movement table is removed.",
  },
  {
    path: "src/features/packaging-run/data/packagingRun.integration.test.ts",
    reason: "Canonical packaging integration proves separation from legacy Finished Goods tables.",
    owner: "packaging",
    removalTiming: "When the legacy Finished Goods tables are removed.",
  },
  {
    path: "src/features/production/data/productionOutput.integration.test.ts",
    reason: "Canonical production-output integration proves separation from legacy Finished Goods tables.",
    owner: "production",
    removalTiming: "When the legacy Finished Goods tables are removed.",
  },
  {
    path: "src/platform/repository/supabaseWorkspaceRepository.test.ts",
    reason: "Compatibility adapter regression coverage for the retired record-store path.",
    owner: "platform",
    removalTiming: "With the compatibility adapter.",
  },
  {
    path: "src/platform/supabase/generated/database.types.ts",
    reason: "Generated schema inventory must describe legacy objects while they remain physically present.",
    owner: "platform",
    removalTiming: "Regenerated automatically when legacy objects are removed.",
  },
]

export const intentionallyUnindexedForeignKeys = [
  {
    constraint: "undesirable_effect_records_workspace_id_finished_goods_batch_id_fkey",
    reason: "Legacy optional safety-effect compatibility link; no current query path or growth evidence.",
    owner: "compliance",
  },
]

export const canonicalPolicies = [
  ["raw_material_balance", "public.kf_inventory_lot_balance_v1", "inventory", "1.0.0"],
  ["finished_goods_balance", "public.kf_finished_goods_inventory_snapshot_v1", "finished-goods", "1.0.0"],
  ["production_availability", "public.list_eligible_inventory_lots_v1", "production", "1.0.0"],
  ["raw_material_fefo", "public.list_eligible_inventory_lots_v1", "production", "1.0.0"],
  ["finished_goods_expiry", "public.kf_finished_goods_inventory_snapshot_v1", "finished-goods", "1.0.0"],
  ["finished_goods_release_readiness", "public.kf_finished_goods_release_readiness_v1", "quality", "1.0.0"],
  ["production_completion", "public.get_batch_inventory_completion_readiness_v1", "production", "1.0.0"],
  ["packaging_run_readiness", "public.get_packaging_run_completion_readiness_v1", "packaging", "1.0.0"],
  ["traceability_confidence", "public.kf_finished_goods_backward_trace_v1", "traceability", "1.0.0"],
  ["recall_scope", "public.generate_recall_readiness_scope_v1", "recall-readiness", "1.0.0"],
  ["recall_decision_readiness", "public.get_recall_readiness_decision_readiness_v1", "recall-readiness", "1.0.0"],
  ["production_cost_snapshot", "public.get_production_output_workspace_v1", "costing", "1.0.0"],
  ["positive_correction_eligibility", "public.record_finished_goods_inventory_operation_v1", "finished-goods", "1.0.0"],
  ["raw_reservation_eligibility", "public.reserve_batch_inventory_lot_v1", "production", "1.0.0"],
]

export const criticalControlledTables = new Set([
  "inventory_movements",
  "batch_material_consumptions",
  "batch_material_waste_records",
  "packaging_inventory_movements",
  "packaging_run_inventory_uses",
  "finished_goods_disposition_reviews",
  "released_finished_goods_inventory_lots",
  "finished_goods_inventory_movements",
  "finished_goods_inventory_operations",
  "finished_goods_inventory_state_history",
  "finished_goods_inventory_events",
  "recall_readiness_case_revisions",
  "recall_readiness_scope_snapshots",
  "recall_readiness_affected_goods",
  "recall_readiness_inventory_impacts",
  "recall_readiness_gaps",
  "recall_readiness_evidence",
  "recall_readiness_reviews",
  "recall_readiness_approvals",
  "recall_readiness_events",
])
