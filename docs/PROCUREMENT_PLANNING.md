# Procurement planning

Procurement is a planning and evidence layer around the two existing inventory ledgers. It never mutates stock.

## Request workspace (v1)

The request-centred workspace adds four owner-scoped relational aggregates:

- `procurement_requests` records the operational workflow: Needed, Researching, Recommended, Ordered, Received.
- `procurement_requested_items` records the need, intended Product/Formula references, specifications, substitutes, priority and deadline.
- `procurement_supplier_offers` is a dated research snapshot linked to the normalized `suppliers` identity. It may reference an existing raw-material or packaging Supplier Product, but does not replace those purchasable catalog records.
- `procurement_recommendations` records a human-reviewed choice and rationale. A recommendation is evidence, not approval or an order.

Supplier Offer shipping, tax/duty, delivery, MOQ, document availability and confidence are nullable or explicitly unknown. Calculations never coerce an incomplete landed estimate into a complete total. Quantity conversion is intentionally limited to compatible mass, volume, or piece units; density-based conversion remains unknown until a trustworthy density boundary is introduced.

Portable JSON exports are versioned and include requests, items, offers and recommendations. CSV is deliberately an offer interchange format, with stable identifier columns for the requested item and Supplier. JSON imports pass through the authenticated repository into one RLS-respecting database transaction, so a failed import cannot leave a partial aggregate. Binaries and credentials are never part of these formats.

## Future research-agent boundary

`ProcurementResearchService` accepts a read-only request snapshot and returns candidate Supplier Offers. The current `ManualProcurementResearchService` returns no automated results. A future agent implementation must:

1. use supported supplier APIs, uploaded evidence, or human-provided URLs rather than brittle marketplace scraping;
2. return proposals through the same validation/import boundary;
3. preserve source URL, checked date, document/claim uncertainty, and confidence;
4. require explicit human persistence and recommendation; and
5. remain unable to place purchases, create payments, or write either inventory ledger.

Existing Purchase Plans continue to represent the controlled post-recommendation planning lifecycle. The request status `ordered` means a human reported an external order event; it does not call a marketplace or mutate a Purchase Plan automatically.

## Phase 2: assisted research

Assisted research adds durable `procurement_research_jobs` and `procurement_offer_candidates`. A job records provider identity, queued/running/partial/completed/failed/cancelled state, timestamps, errors, result counts, and retry lineage. Provider findings are never inserted directly into `procurement_supplier_offers`.

Candidates retain source URL/date, evidence snippets, freshness, confidence, per-field unknown/inferred/verified states, and unresolved fields. Review decisions are explicit: accept creates a new Offer, reject preserves the record, duplicate identifies an existing target, and merge records the target without overwriting it. Manually entered Offers are immutable from the research workflow.

`ProcurementResearchProvider` covers supplier discovery, offer discovery, refresh, and source attribution. `DeterministicMockResearchProvider` drives demos and tests. `ApprovedWebResearchAdapter` accepts only an injected approved service client; it validates provider output and downgrades unsupported document claims to unknown. Production integration belongs behind a server-side/Edge Function boundary with provider credentials stored as server secrets—never browser storage, Procurement tables, or marketplace credentials. Marketplace-specific scraping and checkout are out of scope.

## Phase 3: live provider

The first live adapter is `openai-web-search-v1`. The browser creates an owner-scoped Research Job and passes a versioned, structured request to the authenticated `procurement-live-research` Supabase Edge Function. The function alone can read `OPENAI_API_KEY`; it invokes the OpenAI Responses API with web search and strict JSON-schema output. It returns candidates to the existing review inbox and has no offer-acceptance, ordering, checkout, credential-storage, inventory, or payment capability. The deterministic provider remains the default for demos and automated tests.

Trust boundaries are explicit:

- Browser inputs and provider output are untrusted. The server checks authentication, job ownership, provider identity, item count, and schema version.
- The provider response is schema-constrained and then application-validated. Candidate URLs must be HTTP(S), contain no embedded credentials, and cannot target localhost, example domains, or other explicitly rejected hosts.
- Every candidate needs a source URL. Field state is `unknown`, `inferred`, `reported`, or `verified`; `verified` means the provider supplied source evidence, not that Koalafrog independently guarantees the claim. Generated prose alone is never verified evidence.
- COA, SDS, and technical-document claims are downgraded to Unknown unless field evidence includes both a source URL and snippet. Certification claims are never copied into accepted offers by this slice.
- Raw provider payloads are neither logged nor persisted. Logs contain only correlation/request IDs, job ID, result count, partial state, and sanitized error code. Provider request IDs may be retained on the job for support correlation.

Live request inputs include item identity/category, quantity/unit, specifications, substitutes, delivery country, needed-by date, documentation requirements, supplier preferences/exclusions, priority, and notes. Missing commercial values remain null. Marketplace results are labeled, and unresolved shipping, MOQ, package size, documentation, or delivery terms remain visible in review. Landed-cost completeness is preferred in the research instruction, but price never creates an automatic recommendation.

Operational controls:

- `PROCUREMENT_LIVE_RESEARCH_ENABLED=true` enables the server function.
- `OPENAI_API_KEY` is required and must be configured as a Supabase Function secret.
- `OPENAI_PROCUREMENT_MODEL` defaults to `gpt-5.6`.
- `PROCUREMENT_LIVE_TIMEOUT_MS` defaults to 30 seconds.
- `PROCUREMENT_LIVE_DAILY_LIMIT` defaults to five jobs per owner per rolling 24 hours.
- A partial unique index prevents concurrent queued/running/partial jobs for the same workspace, request, and provider. Provider calls make at most three attempts, use bounded exponential backoff, honor `Retry-After`, and emit controlled timeout/rate-limit errors.

Local setup uses `supabase secrets set PROCUREMENT_LIVE_RESEARCH_ENABLED=true OPENAI_API_KEY=...` plus the optional variables above, followed by serving/deploying `procurement-live-research`. No live-provider secret belongs in `.env.local`, browser storage, exports, or Procurement records.

Known limitations: the provider cannot prove every web statement, source pages may change after checking, delivery/tax/duty often require a destination-specific quote, refresh is not yet exposed, and no raw response is retained for replay. Phase 4 should add approved supplier/API adapters, asynchronous durable execution, source re-checking, destination-aware freight/tax services, operator-visible usage metrics, and a reviewed refresh workflow while preserving the no-purchase boundary.

## Requirements

A requirement is calculated from recorded inputs:

`target + planned demand - usable on-hand - open planned supply`

The result is clamped at zero, then adjusted upward for an applicable MOQ and order multiple. The UI shows the calculation basis and distinguishes below-minimum attention from a planned need. Missing inputs remain unknown; they are never silently replaced with zero.

## Quotes and landed cost

Quote lines retain supplier currency. Merchandise, shipping, duties, tax, payment fee, and additional cost are separate components. A comparison currency is shown only when a recorded rate exists. A comparison rate is planning evidence, not accounting truth, and never rewrites the source quote.

## Purchase Plans

Lifecycle: Draft → Ready for review → Approved internally → Ordered externally → Partially received → Received. Cancelled and Archived are explicit terminal paths. “Approved internally” is not an external order. “Ordered externally” only records that a human placed the order elsewhere.

Creating or reviewing a plan creates no Inventory Lot, Inventory Movement, packaging lot, payable, payment, or external transaction. Receipt automation is deliberately deferred behind a future explicit transactional review boundary; current receipts continue through their authoritative domain workflows.
