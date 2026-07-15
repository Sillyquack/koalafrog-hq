# Application actions and repositories

Phase 8B.2 inventories 59 persistent commands. The provider retains query state, but persistence now flows through `executeWorkspaceAction` and one deterministic session repository. State is committed only after that repository succeeds; rejection preserves the previous state and exposes `actionError`. `pendingActions` provides operation-level pending state.

## Action inventory

- Formula (8): update/add/remove/move line, save/transition/duplicate version, create Formula.
- Ingredients and raw-material Inventory (8): create/update/archive Ingredient, save/prefer Supplier Product, receive stock, append Movement, update Lot.
- Lab (10): create/update Batch, update Line, add/update Allocation, commit consumption, transition Batch, add/update Process Step, add Observation.
- Testing (4): create Tester, Template, Session, and immutable Response.
- Production and Costing (10): create/update/transition Run, update Line, add/update Allocation, commit consumption, add/update Process Step, add Cost Line.
- Packaging (10): create/update Component, save Supplier Product, receive stock, append Movement, create Specification, add/update Line, transition/duplicate Version.
- Finished Goods (5): create Batch, add/update Packaging Allocation, commit Packaging consumption, append Movement.
- Compliance (3): create, duplicate, and update Dossier.
- Launch (1): append Decision.

## Repository selection

`LocalWorkspaceRepository` remains the default for Phase 8B.2 and owns the v9 aggregate read/write plus historical migration chain. `FormulaDataProvider` contains no localStorage call and no save-on-state-change effect. A session receives exactly one repository; there is no dual write.

`SupabaseWorkspaceRepository` hydrates all 50 collections and reconstructs normalized Test questions/answers, Compliance composition lines, Regulatory Review sources, and PIF document links. Normal entity mutations use explicit collection-to-table mappings, stable IDs, authenticated workspace ownership, and `updated_at` conflict predicates.

## Confirmation and atomicity

The action executor computes an intended next state, calls the selected repository, and publishes that state only after persistence succeeds. Local persistence is synchronous; Supabase persistence is asynchronous. Rejections never publish the intended state.

Four operations are currently refused by the Supabase adapter rather than persisted unsafely:

- Lab consumption commitment
- Production consumption commitment
- Packaging consumption commitment
- Finished Goods Batch creation/output registration

They require dedicated authenticated transactional RPCs before Phase 8B.2 can be completed. Until those RPCs and representative cross-domain Supabase mutation tests exist, Supabase must not be selected as the application runtime. Phase 8B.3 startup cutover remains deferred.
