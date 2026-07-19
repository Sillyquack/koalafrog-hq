# Ingredient Knowledge

Ingredient Knowledge is an evidence-aware layer attached to a Workspace Ingredient. It does not replace Reference Ingredients, Supplier Products, Inventory Lots, Formula Lines, Lab, Testing, or Compliance records.

Fields use `known`, `unknown`, `not_applicable`, or `review_required`. Unknown is never zero or an empty typed value. Measured facts retain units, optional bounds, source references, confidence, and notes. Conflicting sources remain `conflicting`; they are not silently resolved.

Evidence distinguishes supplier documents, scientific literature, patents, regulatory documents, internal Lab records, observations, user notes, and unknown sources. `verified` requires a strong traceable source; `supported` is credible documentation; `observed` is contextual recorded behavior; `assumed` is visibly weak; `unknown` is unestablished; `conflicting` is unresolved. Reference, supplier-specific, internal, and user provenance remain distinct.

The layer records identity, physical properties, roles, sensory observations, compatibility evidence, and future deterministic model inputs. It does not predict, recommend ingredients or percentages, generate pairings, or make safety, efficacy, stability, regulatory, or launch conclusions. Sensory uses 0–10, where zero is recorded absence and unknown remains separate. Compatibility is contextual evidence, never approval.

Completeness is field-state coverage, not a quality score. Its denominator is the identity, physical, and sensory fields in the bounded profile. A field counts only when it is explicitly `not_applicable`, or is `known` with confidence other than `unknown`. Prediction placeholders do not increase completeness. Review-required and conflicting fields remain unresolved and do not count as complete.

Product Studio prefers known physical form and primary roles. Legacy metadata is a lower-confidence fallback for old records. Natural Deodorant uses the structured source without new heuristics; Beard Oil and Beard Butter remain unchanged. Formula Lines remain canonical Workspace Ingredient references. Lab observations may be manually linked but are never automatically universalized.

Formula readiness reads current Ingredient Knowledge. A later knowledge edit can therefore change the current readiness display for an older Formula without rewriting that Formula or claiming the knowledge existed at Formula creation or Lab execution. Historical execution continues to belong to immutable Formula and Lab snapshots.

Prediction inputs default to unknown and have no formula-level calculation in v0.12.0. Bounded sections live on `ingredient_knowledge_profiles`; repeatable roles, compatibility, and evidence use dedicated relational tables with workspace/owner identity, timestamps, foreign keys, indexes, and RLS. The workspace schema and backup format identifiers remain unchanged.

Known limitations: evidence history uses timestamps rather than a full approval workflow; measurement method/conditions are retained in notes/source material; compatibility has no automation; prediction inputs have no validated quantitative model.

## Child-record editors

Role cards edit role, level, context, confidence, zero-or-more Evidence links, and notes. Compatibility cards edit the directional target type, canonical same-workspace Ingredient target or explicitly user-defined non-Ingredient label, context, rating, confidence, Evidence links, and notes. Evidence cards edit source type, provenance, confidence, title, organization/author, document identifier, document revision, evidence date, safe public HTTP(S) URL, bounded summary, and notes.

Evidence links display titles and source types rather than raw IDs. Editing a Role or Compatibility record preserves its links. Deleting either relationship never deletes Evidence. Linked Evidence cannot be deleted until every Role and Compatibility link is removed, and the editor reports the blocking record counts. Non-Ingredient compatibility labels are user-defined and are not verified catalog identities.

Field validation remains associated with stable controls for duplicate roles/relationships, missing or self-referencing targets, unavailable Evidence, invalid dates, unsupported URL schemes, private-path identifiers, and invalid state/value combinations. Failed validation retains entered values. Semantic dirty-state detection and controlled navigation protection cover the complete aggregate.

Older application builds that do not understand the four Ingredient Knowledge collections are not safe editors after knowledge records exist: they may preserve the v9 envelope while omitting those collections on a subsequent save. Use v0.12.0 or later for any workspace containing Ingredient Knowledge.

## Local authenticated browser tests

The repository-owned Playwright suite is documented in `docs/E2E.md`. It uses the normal `AuthGate`, a random confirmed local owner, an isolated clean workspace, and automatic teardown. The helpers and global setup reject non-local Supabase URLs. Credentials remain in a mode-0600 ignored runtime file and never enter browser code or source control.
## Reliability and editing semantics

The editor compares the complete in-memory aggregate with a saved baseline through a reusable semantic normalizer. Profile fields and all Role, Compatibility, Evidence, and Evidence-link records participate. Empty optional strings are equivalent to absence, timestamps and editor-source metadata are ignored, evidence-link identifiers are sorted, and unordered child collections are compared deterministically. React object identity and temporary UI state do not affect the result. Saving is always explicit.

While the aggregate is dirty, `beforeunload` protects refresh and close using the browser’s standard message, and React Router blocks controlled navigation, browser Back, sidebar links, Ingredient Detail, Dashboard, and switching to another ingredient. The accessible in-app dialog offers “Stay and continue editing” or “Discard changes and leave”; Escape means Stay. Section-tab changes do not navigate and therefore do not prompt. Successful aggregate persistence replaces the baseline and removes both guards. Validation, transport failure, and stale-write conflict preserve the local edits and dirty baseline.

The page save state is one of `idle`, `dirty`, `validating`, `saving`, `saved`, `validation_failed`, `save_failed`, or `stale_conflict`. “Saved” means only that the aggregate transaction completed; it never means verified, approved, safe, compliant, or ready. A stale conflict never force-overwrites remote state: local edits remain visible for manual reconciliation, while refresh deliberately discards them and loads the latest record.

Legacy Evidence document identifiers are classified centrally before display. Unix and Windows paths, UNC locations, `file:` URLs, mounted/container and private-storage internals, and URLs with embedded credentials are replaced with “Legacy private path hidden”. Viewing does not rewrite the stored record; the owner may clear or replace it. Safe HTTP(S) references and ordinary document identifiers remain displayable.

Authenticated browser QA uses Playwright, `scripts/browser-test-owner.mjs`, `scripts/browser-test-server.mjs`, and the normal AuthGate against local Supabase. Browser-native custom `beforeunload` wording is intentionally not attempted.

`updatedAt` supports optimistic concurrency and recent-edit display. It is not complete revision history.
