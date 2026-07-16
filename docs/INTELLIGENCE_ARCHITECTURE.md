# Koalafrog Intelligence Architecture

## Mission and Phase 9A–9B scope

Koalafrog Intelligence is an evidence-aware development copilot, not a generic chatbot. Phase 9A establishes the authenticated server-side gateway and proves it through Scent Studio. It offers creative hypotheses and controlled experiments without claiming to smell a composition or changing Product, Formula, Ingredient, Inventory, Lab, Testing, Production, Packaging, Compliance, or Launch records.

## Server-side architecture and secrets

The browser invokes the authenticated `koalafrog-intelligence` Supabase Edge Function. The function resolves the JWT user, verifies their Active workspace, and uses that same user-scoped client for all reads and audit writes, leaving RLS authoritative. Provider credentials never enter Vite or browser storage. Configure only server-side Supabase function secrets:

```sh
supabase secrets set OPENAI_API_KEY=... OPENAI_MODEL=...
```

Never commit or paste real values into source files. The function uses the OpenAI Responses API behind its provider boundary and returns `INTELLIGENCE_NOT_CONFIGURED` when either secret is absent. Automated tests use deterministic contract fixtures and make no live model call.

## Grounding and evidence

The Scent context builder loads only selected Products, Formula Versions and lines, selected Ingredients, relevant Lab Batches and recorded observations, linked Test Sessions/Responses, and explicitly entered Concept Materials. Ordering is deterministic. Stable IDs form a versioned context manifest and the evidence universe. Concept Materials are labels only and are never persisted as Ingredients.

Every claim is one of four categories:

- **Fact** — stored Koalafrog data; evidence is mandatory.
- **Observation** — stored empirical Lab/Testing evidence; evidence is mandatory.
- **Prediction** — an explicitly uncertain hypothesis; model knowledge remains here.
- **Recommendation** — an advisory next experiment, never certainty.

Provider Structured Output is validated again by Koalafrog. Unknown evidence, missing evidence, unknown claim kinds, missing sections, and axes outside 0–100 are rejected. Old predictions and recommendations remain those categories during bounded follow-ups; they never become observations.

## Persistence, RLS, and backup

`intelligence_threads` owns a Scent Studio conversation. `intelligence_runs` records schema/prompt/context versions, selection, manifest, validated response or controlled error, provider/model metadata, and timestamps. Composite foreign keys prevent cross-workspace relationships. RLS restricts all access to the authenticated workspace owner; anonymous access is revoked. API keys, authorization headers, and system-prompt text are never persisted. Both tables are included in hosted backup export without changing legacy v9 migration semantics or creating localStorage intelligence authority.

## Phase 9B memory layers

The Intelligence Library reads `intelligence_threads` and `intelligence_runs` directly. Optional `knowledge_references` contain only owner-controlled title, note, tags, pin, archive, and source linkage; prompts and reports are never copied. Provider usage is normalized on the Edge Function, and cost exists only when a versioned server-side pricing snapshot is configured.

Scent Memory is separate empirical data in `scent_memory_sessions` and immutable, revisioned `scent_memory_checkpoints`. Only bounded current checkpoints relevant to the selected Product, Formula Version, Lab Batch, or Ingredient enter context manifest v2. Their evidence type is `scentMemoryCheckpoint`. AI output never creates these records.

## Multi-turn strategy

The UI retains the thread ID and current selection. Each call reloads current hosted domain context. The function includes at most four prior completed runs, preserving their structured semantic labels rather than promoting them to workspace truth.

## Safety and limitations

Intelligence is advisory and cannot establish safety, legal compliance, authority approval, CPSR/PIF/CPNP/IFRA completion, or market readiness. Supplier documentation, restrictions, external assessment, compliance evidence, and physical evaluation remain necessary. There are no autonomous agents, web research, background jobs, or AI domain writes in Phase 9A.

Operations Copilot remains separately scoped and is not implemented. Phase 9B adds no autonomous agents or background AI activity.

## Local and hosted setup

Apply migrations locally, serve the function, and leave provider secrets unset to verify the controlled configuration state. A developer may set local function secrets for an optional paid smoke test. Hosted promotion is explicit: review and push the migration, set the two function secrets, deploy the function, deploy the frontend, then run authenticated/RLS acceptance checks. Never run security fixtures against the real Bobby workspace.
# Bible documentation contract

Koalafrog Bible articles document the implemented Intelligence boundary: workspace records may support Fact, empirical records may support Observation, general model knowledge is normally Prediction, and proposed actions are Recommendation. Concept Materials are not evidence. Intelligence cannot smell, approve compliance, or write autonomous domain changes. The Bible is static repository content and makes no model call.
