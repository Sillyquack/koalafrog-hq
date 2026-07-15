# Application actions and repositories

The application inventories 66 persistent commands. The provider retains query state, but persistence flows through `executeWorkspaceAction` and one deterministic session repository. State is committed only after that repository succeeds; rejection preserves the previous state and exposes `actionError`. `pendingActions` provides operation-level pending state.

## Action inventory

- Products (2): create and update Product metadata.
- Formula (8): update/add/remove/move line, save/transition/duplicate version, create Formula.
- Ingredients and raw-material Inventory (8): create/update/archive Ingredient, save/prefer Supplier Product, receive stock, append Movement, update Lot.
- Lab (10): create/update Batch, update Line, add/update Allocation, commit consumption, transition Batch, add/update Process Step, add Observation.
- Testing (4): create Tester, Template, Session, and immutable Response.
- Production and Costing (10): create/update/transition Run, update Line, add/update Allocation, commit consumption, add/update Process Step, add Cost Line.
- Packaging (10): create/update Component, save Supplier Product, receive stock, append Movement, create Specification, add/update Line, transition/duplicate Version.
- Finished Goods (5): create Batch, add/update Packaging Allocation, commit Packaging consumption, append Movement.
- Compliance (7): create, duplicate, and update Dossier; update Regulatory Review; update PIF Section; create and update Compliance Document metadata.
- Launch (2): update Plan and append Decision.

## Repository selection

`LocalWorkspaceRepository` remains the development default and owns the v9 aggregate read/write plus historical migration chain. `VITE_WORKSPACE_REPOSITORY=supabase` selects the authenticated relational repository once at startup. Supabase mode requires an `active` reconciled workspace, displays loading/error/retry states, and never silently falls back to Local. `FormulaDataProvider` contains no localStorage call and no save-on-state-change effect. A session receives exactly one repository; there is no dual write.

`SupabaseWorkspaceRepository` hydrates all 50 collections and reconstructs normalized Test questions/answers, Compliance composition lines, Regulatory Review sources, and PIF document links. Normal entity mutations use explicit collection-to-table mappings, stable IDs, authenticated workspace ownership, and `updated_at` conflict predicates.

## Confirmation and atomicity

The action executor computes an intended next state, calls the selected repository, and publishes that state only after persistence succeeds. Local persistence is synchronous; Supabase persistence is asynchronous. Rejections never publish the intended state.

Four audit-critical operations use dedicated authenticated, transactional RPCs:

- Lab consumption commitment
- Production consumption commitment
- Packaging consumption commitment
- Finished Goods Batch creation/output registration

Each RPC validates ownership, available ledger balance, compatible units, duplicate commitment, and linked allocation/movement state inside one database transaction. Production allocation cost snapshots are written at commitment and remain historical. Live local-Supabase regression tests cover the critical workflows, every major domain, normalized children, fresh hydration, stale-write rejection, duplicate rejection, rollback, and repository isolation. Local remains the default; selecting Supabase at startup is explicitly deferred to Phase 8B.3.

## Mutation and fresh-hydration verification matrix

Every row below is exercised through `executeWorkspaceAction` and `SupabaseWorkspaceRepository`, followed by a load through a new repository instance.

| Domain | Representative actions | Relational persistence | Normalized / RPC | Result after fresh hydration |
| --- | --- | --- | --- | --- |
| Products | `createProduct`, `updateProduct` | `products` | No | Stable ID, metadata, timestamp, one row |
| Formulas | `createFormula`, `duplicateAsDraft` | `formulas`, `formula_versions`, `formula_lines` | No | Product link, ordered multi-line Draft and independent derived Draft; Approved source unchanged |
| Ingredients | `createIngredient`, `updateIngredient` | `ingredients` | No | INCI, category, functions, threshold, notes and status reconstructed |
| Raw-material Inventory | `receiveStock`, `addMovement` | `inventory_lots`, `inventory_movements` | No | Lot, receipt/sample history, acquisition cost and derived balance reconstructed |
| Lab | `createLabBatch`, `commitBatchConsumption` | Lab tables and `inventory_movements` | Lab RPC | Formula snapshot, allocation/movement link and ledger balance reconstructed |
| Testing | `createTestTemplate`, `createTestSession`, `addTestResponse` | Testing parents plus question/answer tables | Questions and answers | Ordered question types and number/boolean/string answers reconstructed |
| Production | `createProductionRun`, `commitProductionConsumption` | Production tables and `inventory_movements` | Production RPC | Approved source, snapshots, movement link and historical unit cost reconstructed |
| Costing | `addCostLine` | `cost_lines` | No | Product planning and Production actual lines plus historical total reconstructed |
| Packaging | component/line updates, receipt, allocation, consumption | Packaging specification, lot, allocation and movement tables | Packaging RPC | Relationships, allocation links, cost snapshots and balance reconstructed |
| Finished Goods | `createFinishedGoodsBatch`, `addFinishedGoodsMovement` | Finished Goods batch/movement tables | Output RPC | ProductionReceipt, source references, movement history and balance reconstructed |
| Compliance | Dossier, Review and PIF updates | Compliance parents and three normalized tables | Composition/source/document children | Exact configuration, snapshots, link add/remove and orphan-free reconstruction proven |
| Launch | `updateLaunchPlan`, `recordLaunchDecision` | `launch_plans`, `launch_decisions` | No | Dossier relationship and immutable decision/blocker snapshot reconstructed |

## Normalized child semantics

| Child structure | Parent | Mutation rule | Removal / hydration |
| --- | --- | --- | --- |
| Test Template Questions | Test Template | Created with a mutable template; ordered replacement is allowed before historical use | Parent-scoped replacement; fresh load restores ordering, types and choices |
| Test Response Answers | Test Response | Created once with the submitted immutable response | No normal update/delete action; fresh load restores typed JSON values |
| Compliance Composition Snapshots | Compliance Dossier | Captured with the exact Formula configuration on Dossier creation | No normal composition-edit action; fresh load restores the immutable snapshot and historical release workflows do not expose casual mutation |
| Regulatory Review Sources | Regulatory Review | Mutable source-link set through `updateRegulatoryReview` | Add/remove replaces the parent join set; no orphan joins; fresh load restores IDs |
| PIF Document References | PIF Section | Mutable evidence metadata through `updatePifSection` | Add/remove replaces the parent join set; no orphan references; fresh load restores IDs |

Supabase-session tests preserve a sentinel local-v9 value, while a Local action is verified not to alter relational row counts. This proves repository selection does not dual-write. Full-session reload tests hydrate relational state afresh rather than treating React memory as proof of persistence.
