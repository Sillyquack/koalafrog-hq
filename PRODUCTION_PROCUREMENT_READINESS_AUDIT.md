# Production Procurement Readiness V1 — architecture audit

Date: 2026-07-27

## Executive finding

Koalafrog HQ already has most of the commercial, supplier-research, formula, and inventory primitives needed for production procurement. The missing capability is not another procurement system: it is a durable, versioned production-round aggregate that binds exact formula versions to deterministic requirements, an inventory snapshot, accepted supplier offers, basket scenarios, and an immutable approval snapshot.

The implementation should therefore extend the existing procurement boundary and reuse `purchase_plans`, `purchase_plan_lines`, `procurement_requested_items`, `procurement_supplier_offers`, supplier commercial terms, candidate review, and the receiving ledger.

## Existing capabilities to reuse

### Products, studios, and formulas

- `products` records development stage and current development/approved formula-version links.
- `formulas`, `formula_versions`, and `formula_lines` are relational and workspace scoped.
- Formula composition is percentage based. `scaleFormula` provides deterministic scaling and approved/candidate versions are already non-editable in the UI/domain.
- Product Studio provides atomic product/formula handoff and records generated IDs.
- Beard Butter supports phase definitions and manufacturing steps.
- Natural Deodorant Product Studio is a first-class concept type with formulation archetype, phase, heat/process, packaging-intent, and ingredient-knowledge validation.
- There is no Beard Balm Product Studio type, but ordinary Products and Formulas support the category.

### Ingredient identity and inventory

- `ingredients` is the canonical workspace ingredient identity and may adopt a versioned reference-catalog identity.
- Formula lines use ingredient IDs, so consolidation can use identity rather than display name.
- `supplier_products` links purchasable offers to canonical ingredients and records pack size, unit, price, currency, URL, grade, INCI, processing, verification, and preferred status.
- Raw-material stock is an append-only lot/movement ledger. Receipt, Consumption, Waste, Sample, and Adjustment are explicit movement types.
- Units support mg, g, kg, ml, L, and pcs. Existing conversion logic only converts within mass, volume, or count families and correctly rejects mass/volume inference.
- Active, quarantined, exhausted, expired, and disposed lots are distinguished.
- Existing inventory does not model general-purpose reservations. Lab/production allocations exist, but a procurement gap calculator must explicitly account for committed allocations that have not yet created consumption.

### Suppliers and procurement

- Suppliers, contacts, quotes, quote lines, stock policies, purchase plans, purchase-plan lines, requests, requested items, supplier offers, recommendations, discounts, shipping rules, documents, supplier events, cart scenarios, and cart scenario items already exist.
- Supplier offers preserve source Supplier Product domain/ID and commercial evidence; fuzzy/provider results remain candidates until explicit acceptance.
- Assisted and provider-backed research supports explicit start, retry, cancellation, diagnostics, background reconciliation, duplicate controls, and human acceptance.
- `calculateOffer`, `calculateCartScenario`, and quote comparison already cover integer packages, MOQ, discounts, thresholds, unknown landed-cost components, and original currencies.
- `mark_purchase_plan_external_order` is the existing explicit external-order transition and does not receive inventory.
- Supplier events provide an audit trail for externally placed orders and receiving-related events.

### Costing

- Planning costs live on supplier offers, cart scenarios, quotes, and purchase plans.
- Actual material cost is derived from inventory-lot acquisition cost and committed allocations.
- Currency is preserved on source records; missing landed-cost components remain nullable instead of becoming zero.

### Persistence and security

- Local v9 remains the development/rollback adapter; relational Supabase is the controlled durable target.
- Persistent commands are routed through the workspace action boundary or narrowly scoped repositories.
- Relational tables consistently carry `workspace_id` and `owner_id`; RLS tests cover anonymous denial, owner/workspace isolation, grants, and RPC execution.
- Critical RPCs use `auth.uid()`, fixed search paths, row locks, idempotency keys, and workspace composite foreign keys.
- Current Supabase platform changes make explicit table/function grants important for new Data API objects; new migrations must not rely on automatic exposure.

## Missing entities and behavior

- A production procurement round and selected-product records.
- Exact formula-version basis snapshots per selected product.
- A versioned formula-readiness gate with deodorant-specific checks.
- Requirement and requirement-source snapshots preserving product, formula, phase, overage, unit, and calculation path.
- Inventory-gap snapshots distinguishing unusable/quarantined/expired stock and reservations.
- Purchasing specifications and accepted requirement-to-offer matches.
- Cross-supplier scenario publication and deterministic strategy ranking.
- Immutable approval snapshots that survive later price, stock, or formula changes.
- Line-level external-order progress across multiple suppliers.

## Duplicated or overlapping concepts

- `SupplierProduct` and `procurement_supplier_offers` overlap intentionally: the former is the canonical ingredient offer; the latter is a dated procurement comparison/evidence record. A production requirement should point to an accepted supplier offer that in turn may point to a Supplier Product.
- `purchase_plans` and procurement cart scenarios already represent review/approval and supplier baskets. A production round should own or reference them, not replace them.
- `StockPolicy` calculates replenishment needs, but it is policy/target based rather than exact formula-version demand. Its arithmetic can be reused, not its aggregate semantics.
- Supplier-wide documents and Supplier Product verification answer different questions. Production matching must combine both without inferring product documentation from supplier-wide marketing.

## Migration requirements

Add a focused production-round migration with:

- `production_procurement_rounds`
- `production_procurement_round_products`
- `production_procurement_requirements`
- `production_procurement_requirement_sources`
- `production_procurement_matches`
- scenario/approval links or snapshots where existing cart/purchase-plan structures cannot preserve cross-supplier history

Every mutable table needs revision checks; every child reference needs a workspace composite foreign key. All exposed tables require RLS and explicit authenticated grants. Approval and requirement publication should be transactional RPCs with idempotency and immutable JSON snapshots.

## Security risks

- Client-supplied owner IDs or cross-workspace formula, ingredient, lot, Supplier Product, offer, and plan IDs.
- `SECURITY DEFINER` RPCs without explicit `auth.uid()` checks, fixed `search_path`, revoked PUBLIC execution, or full workspace validation.
- Direct mutation of approved snapshots.
- Treating a provider candidate as canonical before acceptance.
- Counting unreceived orders, quarantined/expired lots, or incompatible unit families as available stock.
- Assuming automatic Data API grants for new tables.

## Current limitations

- Formula lines contain percentages but no line unit; deterministic purchasing can only scale them in the selected batch mass unit unless a future immutable formula model records another unit basis.
- Reservations are execution-allocation records rather than a general inventory-reservation aggregate.
- Existing cart scenarios are supplier-specific, so a complete multi-supplier strategy requires an aggregate scenario layer or immutable snapshot.
- Existing shipping rules cover flat-rate and thresholds, but not weight tiers, hazardous-goods surcharges, exclusions, or total ranges.
- Discount exclusions and eligibility provenance are not fully normalized.
- Supplier Product stock/price freshness is split between canonical product metadata and dated supplier offers.

## Recommended implementation shape

1. Add pure, versioned calculators for formula readiness, scaling, consolidation, stock gaps, package selection, landed cost, and deterministic scenario scoring.
2. Add the production-round relational aggregate and transactional create/regenerate/approve RPCs.
3. Build `/procurement/production-readiness` as a staged workspace using current FormulaData and Procurement repositories.
4. Generate existing requested items/offers and supplier cart scenarios from round gaps; do not duplicate research or commercial-term workflows.
5. On approval, persist a complete immutable snapshot and create/link existing purchase plans by supplier.
6. Record external orders through the existing RPC and supplier-event path. Receive only through the existing inventory receiving workflow.

This audit is the implementation boundary for V1: production planning never writes inventory, approval never places an order, and research never silently changes canonical supplier data.
