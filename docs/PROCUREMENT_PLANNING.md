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

Candidates retain source URL/date, evidence snippets, freshness, confidence, per-field unknown/inferred/verified states, and unresolved fields. Review decisions are explicit: accept creates a new Offer, reject preserves the record, duplicate identifies another candidate, and merge records an existing Offer target without overwriting it. Acceptance runs in the authenticated `accept_procurement_offer_candidate` transaction: it locks the pending candidate, validates active-workspace ownership and any explicitly selected canonical Supplier, optionally creates a canonical Supplier, inserts a new Offer with provenance, and records acceptance. A stale or concurrent second acceptance fails before creating anything; every failure rolls the entire operation back. Manually entered Offers are never updated by the research workflow.

`ProcurementResearchProvider` covers supplier discovery, offer discovery, refresh, and source attribution. `DeterministicMockResearchProvider` drives demos and tests. `ApprovedWebResearchAdapter` accepts only an injected approved service client; it validates provider output and downgrades unsupported document claims to unknown. Production integration belongs behind a server-side/Edge Function boundary with provider credentials stored as server secrets—never browser storage, Procurement tables, or marketplace credentials. Marketplace-specific scraping and checkout are out of scope.

## Phase 3: live provider

The first live adapter is `openai-web-search-v1`. The browser creates an owner-scoped Research Job and passes a versioned, structured request to the authenticated `procurement-live-research` Supabase Edge Function. The function alone can read `OPENAI_API_KEY`; it starts one OpenAI Responses background request with web search and strict JSON-schema output, then returns a safe acknowledgement. A signed server webhook validates and publishes terminal results to the existing review inbox. Neither function has offer-acceptance, ordering, checkout, credential-storage, inventory, or payment capability. The deterministic provider remains the default for demos and automated tests.

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
- Background submission has a fixed 30-second transport boundary; the long-running provider task is not tied to that request.
- `PROCUREMENT_LIVE_DAILY_LIMIT` defaults to five permitted live invocations per owner per rolling 24 hours.
- A partial unique index prevents concurrent `queued` or `running` jobs for the same workspace, request, and provider. These are the only active states. `partial`, `completed`, `failed`, and `cancelled` are terminal snapshots; partial and failed jobs may be retried as a new job whose `retry_of_job_id` preserves lineage. Each job makes exactly one provider call with no automatic retry. A human retry creates a new job and preserves lineage.

Before any paid call, the Edge Function invokes the owner-scoped `begin_procurement_live_invocation` transaction. It serializes the rolling owner limit, locks the job, requires the exact `running` state and live provider, and atomically consumes the job's single invocation slot. Counts use permitted invocations from the preceding 24 hours rather than created jobs. Managed invocation columns cannot be reset through ordinary authenticated table writes.

Provider source dates are accepted only when they are real, non-future `YYYY-MM-DD` calendar dates. Valid historical dates are preserved for freshness calculation; invalid, impossible, missing, or future dates conservatively fall back to the server's current date. A field remains `verified` only when its normalized evidence includes both a safe HTTP(S) source URL and a non-empty snippet; an explicit but unsupported verified claim is downgraded to `reported`.

Local setup uses server-side `PROCUREMENT_LIVE_RESEARCH_ENABLED`, `OPENAI_API_KEY`, and `OPENAI_WEBHOOK_SECRET` secrets plus the optional variables above, followed by serving/deploying both Procurement research functions. Never put real secret values in shell history, `.env.local`, browser storage, exports, or Procurement records.

Cancellation is deliberately honest: cancelling records `cancellation_requested_at` and makes the Koalafrog job terminal, but this slice does not call OpenAI's cancel endpoint. The atomic finalizer consumes and discards any later terminal event, so late responses cannot publish candidates or overwrite a cancelled job.

### Durable provider diagnostics

`procurement_provider_diagnostics` stores one allowlisted diagnostic record per consumed live-provider job. Existing jobs remain valid without a diagnostic row. The record contains booleans, bounded elapsed values, safe timestamps, timeout/abort classification, HTTP status, usage presence, validated-candidate count, terminal error code, and diagnostic version only. It never stores prompts, request bodies, raw provider responses, credentials, provider request IDs, source/supplier content, signed URLs, or personal data.

Only the Edge Function's server-side service role can execute `persist_procurement_provider_diagnostic`. The fixed-search-path RPC verifies the supplied owner, workspace, active workspace lifecycle, live provider, and consumed invocation before writing. Authenticated browser users have owner-scoped read access through RLS, but have no insert, update, delete, or writer-RPC permission; anon and public have no access. Diagnostic persistence is best effort and cannot replace the provider's terminal result, trigger a retry, or publish candidates.

Failed live jobs show a collapsed owner-only panel with safe stage, elapsed time, timeout, abort, completion flags, HTTP status, usage presence, and candidate count. Legacy rows and diagnostic-write failures render without the panel.

Procurement is currently Supabase-only. The route requires `VITE_WORKSPACE_REPOSITORY=supabase`, authentication, and an active owner workspace. The deterministic mock provider also requires Supabase because jobs, candidates, provenance, and review decisions use the same durable RLS-protected workflow. The UI presents setup guidance instead of implying browser-local support. A future local adapter could implement the same repository and transactional semantics, but it is not part of Phases 1–3.

The deployment-safe live contract lives under `supabase/functions/_shared` and is re-exported to browser code so the server schema and client validation cannot drift. Deploy the Edge Function with the listed server secrets and keep its feature flag off until the approved provider account, limits, and monitoring are ready.

Known limitations: the provider cannot prove every web statement, source pages may change after checking, delivery/tax/duty often require a destination-specific quote, refresh is not yet exposed, cancellation cannot stop an in-flight provider request, and no raw response is retained for replay. Phase 4 should introduce a durable background worker with provider-aware cancellation, source re-checking, destination-aware freight/tax services, operator-visible usage metrics, and a reviewed refresh workflow while preserving the no-purchase boundary.

### Background live-research execution

Long-running web research now uses OpenAI Responses background mode. The
JWT-protected `procurement-live-research` function atomically consumes one live
invocation, submits exactly one `background: true` response, stores its opaque
operation ID in the service-only `procurement_background_operations` table,
and returns a safe `202` acknowledgement. The browser never receives or polls
the provider operation and can be closed without stopping research.

OpenAI terminal events arrive at `procurement-live-research-webhook`. This
machine endpoint has gateway JWT verification disabled because OpenAI cannot
present a Supabase user JWT; it instead requires the raw-body Standard
Webhooks signature and a timestamp within five minutes using the server-only
`OPENAI_WEBHOOK_SECRET`. User initiation retains `verify_jwt=true`. The webhook
matches only an already attached operation, retrieves a completed response
once, applies the same strict contract and provenance normalization, and calls
a service-role-only finalization RPC. The RPC locks both operation and job,
deduplicates terminal delivery, discards results after cancellation or another
terminal transition, and publishes candidates plus terminal job state in one
transaction. No provider output, prompt, operation ID, webhook ID, API key, or
webhook secret is exposed to authenticated browser roles or retained in
diagnostics/exports.

Deployment requires `OPENAI_WEBHOOK_SECRET` in addition to the existing
server-only secrets, an OpenAI project webhook subscribed to terminal Response
events, and deployment of both functions. The webhook function deliberately
uses `verify_jwt=false`; all other Procurement function access remains JWT
verified. OpenAI background mode temporarily stores response data to support
asynchronous retrieval, so this design is not suitable for an OpenAI Zero Data
Retention project. Invalid/missing output becomes a safe failed job. Cancellation
prevents publication but does not currently call the provider cancel endpoint.

## Implementation and integration status

- Phase 1 is implemented: request dashboard/detail, manual Offers, recommendations, workflow states, versioned JSON and Offer CSV interchange, landed-cost calculations, seed data, tests, and owner-scoped relational persistence.
- Phase 2 is implemented: durable jobs, deterministic mock research, candidate review, provenance, conservative deduplication, retries, cancellation records, tests, and responsive review UI.
- Phase 3 is implemented behind `PROCUREMENT_LIVE_RESEARCH_ENABLED`: one server-side live provider, strict versioned output, URL/evidence validation, timeouts/backoff/rate limiting, field provenance, sanitized observability, fixtures, and stubbed E2E. It does not order or purchase.
- Suppliers use the canonical shared `suppliers` table. Requested item references point at existing Product/Formula identifiers; raw-material stock truth remains Ingredients plus immutable Inventory Lots/Movements. Procurement owns requests, requested items, Offer research snapshots, recommendations, jobs, and review candidates only.
- Beard Studio should be merged independently. Procurement route declarations and navigation metadata are isolated in feature files to reduce shared-file conflict. Resolve any remaining `App.tsx`, `Sidebar.tsx`, or global stylesheet overlap by preserving both feature registrations; do not copy Procurement persistence into Beard Studio or vice versa.

## Requirements

A requirement is calculated from recorded inputs:

`target + planned demand - usable on-hand - open planned supply`

The result is clamped at zero, then adjusted upward for an applicable MOQ and order multiple. The UI shows the calculation basis and distinguishes below-minimum attention from a planned need. Missing inputs remain unknown; they are never silently replaced with zero.

## Quotes and landed cost

Quote lines retain supplier currency. Merchandise, shipping, duties, tax, payment fee, and additional cost are separate components. A comparison currency is shown only when a recorded rate exists. A comparison rate is planning evidence, not accounting truth, and never rewrites the source quote.

## Purchase Plans

Lifecycle: Draft → Ready for review → Approved internally → Ordered externally → Partially received → Received. Cancelled and Archived are explicit terminal paths. “Approved internally” is not an external order. “Ordered externally” only records that a human placed the order elsewhere.

Creating or reviewing a plan creates no Inventory Lot, Inventory Movement, packaging lot, payable, payment, or external transaction. Receipt automation is deliberately deferred behind a future explicit transactional review boundary; current receipts continue through their authoritative domain workflows.
