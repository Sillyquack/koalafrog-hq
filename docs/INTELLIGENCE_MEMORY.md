# Intelligence Memory

## Authoritative records and no-copy architecture

Completed conversations remain authoritative in `intelligence_threads` and `intelligence_runs`. The Intelligence Library queries those records directly, so historical runs appear automatically. `knowledge_references` is an optional left-joined organization record created only when the owner renames, annotates, tags, pins, or archives a thread. It never stores a prompt or response payload.

The thread detail reads the exact stored `user_prompt`, validated `response_payload`, historical context selection/manifest, prompt and schema versions, provider/model, usage, and cost estimate. Internal system prompts, raw provider envelopes, credentials, authorization headers, and full context records are not displayed or copied.

## Library behavior

The default library hides archived organization records and does not emphasize failures. Search covers authoritative questions plus custom title, note, tags, and Concept Material names. Product, Formula Version, material, date, technical status, pinned-only, archived, and ordering filters are available. Reopening a thread preserves its ID and still causes the Edge Function to load fresh hosted context for the next run.

## Usage and estimated cost

`intelligence_runs` accepts normalized input, output, total, cached-input, and reasoning token counts reported by the provider. Historical rows may contain no usage. Usage absence never invalidates an analysis.

Cost is calculated only in the server-side provider adapter when all required rates and an explicit pricing snapshot version are configured. The UI always labels this value **Estimated cost**. Without a complete pricing snapshot it displays token usage and `Cost unavailable`; it never invents a value. Optional Edge Function configuration uses `OPENAI_INPUT_USD_PER_MILLION_TOKENS`, `OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS`, `OPENAI_OUTPUT_USD_PER_MILLION_TOKENS`, and `OPENAI_PRICING_SNAPSHOT_VERSION`.

## Privacy, RLS, backup, and limitations

Knowledge references use composite workspace/thread foreign keys and owner RLS. Anonymous access is revoked, cross-workspace references fail, and mutable saves use a revision predicate for stale-write detection. Hosted backup exports threads, runs including usage, and Knowledge references without changing local v9 migration semantics. There is no hard-delete workflow, autonomous organization, background model activity, or exact provider billing reconciliation.
