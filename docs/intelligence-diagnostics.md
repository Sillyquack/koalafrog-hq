# Intelligence diagnostics

The Intelligence Diagnostics layer is a provider-neutral flight recorder for Koalafrog Intelligence executions. Domain modules own their contracts and semantic rules; Diagnostics owns safe stage timing, failure classification, structural validation metadata, reporting, and aggregate observability.

Diagnostics never receives or records prompts, provider output, images, image or signed URLs, workspace entities, credentials, tokens, secrets, or personal information. Trace types expose only an allowlisted metadata vocabulary. The reporter reconstructs every event through the safety boundary before writing it.

## Architecture

`src/intelligence/Diagnostics` contains the stable rule catalog, trace types and builder, safe reporter, validation-result API, stage timer, cleanup verification, structured-value validation, and aggregation helpers. It imports no domain module. A consumer may add a one-way adapter for its contract; Beard Intelligence does this in the shared Beard contract.

The lifecycle is:

1. Create a trace with an opaque support ID and analysis ID.
2. Emit `started` and terminal events for each applicable stage.
3. Stop at the first failed validation and attach only a stable rule code, JSON path, expected structural category, received structural category, and validator name.
4. Continue cleanup after a terminal provider or validation outcome.
5. Emit delete-requested, delete-acknowledged, delete-verified, and metadata-updated stages.
6. Emit `Completed` only after cleanup reaches a known state.

Production trace events are JSON console records named `koalafrog_intelligence_trace`. They are developer observability records and are not exposed in product UI.

## Stages

Authentication, Workspace Validation, Context Build, Input Validation, Provider Configuration, Image Retrieval, Provider Invocation, Provider Response, Envelope Parsing, JSON Parsing, Schema Validation, Contract Validation, Semantic Validation, Persistence, Cleanup Delete Requested, Cleanup Delete Acknowledged, Cleanup Delete Verified, Cleanup Metadata Updated, and Completed.

Each terminal event includes duration and result. The trace helpers can calculate the last failure, per-stage durations, rule frequencies, top failure inputs, and average or median provider duration without inspecting model content.

## Stable rule catalog

| Code | Meaning |
|---|---|
| VAL-0001 | Invalid HTTP/provider envelope |
| VAL-0002 | Missing output text |
| VAL-0003 | Provider response incomplete |
| VAL-0004 | Invalid output JSON |
| VAL-0010 | Missing required property |
| VAL-0011 | Wrong structural type |
| VAL-0012 | Enum mismatch |
| VAL-0013 | Duplicate observation identifier |
| VAL-0014 | Broken recommendation reference |
| VAL-0015 | Unexpected property |
| VAL-0016 | Constant mismatch |
| VAL-0017 | Numeric range violation |
| VAL-0020 | Semantic safety violation |
| VAL-0030 | Unexpected validator exception |
| CLN-0001 | Storage delete failed |
| CLN-0002 | Delete acknowledgement count mismatch |
| CLN-0003 | Storage-prefix verification failed |
| CLN-0004 | Cleanup metadata update failed |
| PRV-0001 | Provider timeout |
| PRV-0002 | Provider refusal |
| PRV-0003 | Duplicate invocation |

Codes are append-only identifiers. Existing meanings must not be changed or reused.

## Validation API

Validators return `ValidationTrace<T>`, either `{ success: true, value }` or a metadata-only failure containing `ruleCode`, `jsonPath`, `expected`, `received`, `validator`, and `stage`. A failure must never include the rejected value or provider wording.

Schema validation handles required properties, types, enums, constants, ranges, arrays, and unexpected properties. Consumer contract adapters handle cross-field rules. Semantic validators run separately so structurally correct output cannot be mislabeled as malformed JSON.

## Cleanup guarantees

After an Edge invocation begins, the Edge pipeline is the sole cleanup owner. Browser cleanup is limited to failures before invocation. Storage deletion is not considered complete merely because the API returned no error: the acknowledged object count must equal the request count and a subsequent exact-prefix listing must be empty before metadata becomes `deleted`. Otherwise metadata remains `cleanup_required` and `CLN-0001`, `CLN-0002`, or `CLN-0003` identifies the failure.

## Integrating another Intelligence module

1. Use the shared trace builder and reporter.
2. Emit the standard stages that apply; mark genuinely inapplicable stages `skipped`.
3. Use the structured validator or generate an equivalent safe `ValidationTrace`.
4. Keep domain contract and semantic rules in the consumer module.
5. Add new stable rule codes only when an existing code cannot describe the structural rule.
6. Test that arbitrary provider content cannot enter serialized diagnostics.

No database migration is required for this phase. Flight-recorder events use infrastructure logs; durable queryable trace storage would require a separately reviewed metadata-only schema and retention policy.
