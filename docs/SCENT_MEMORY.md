# Scent Memory

## Evidence mission

Scent Memory records what the owner actually smelled or evaluated. It is not an AI archive. Predictions and recommendations never create Scent Memory automatically and remain predictions/recommendations unless a person performs an evaluation and deliberately records an observation.

Sessions link to at least one real Product, Formula Version, Lab Batch, Ingredient, or Test Session. Composite workspace foreign keys reject cross-workspace links. A database context trigger rejects contradictory Product/Formula/Lab/Test combinations. Exact Lab Batch and Formula Version links are preferred for formula evaluations.

## Sessions, checkpoints, and revision

`scent_memory_sessions` stores the private title, exact context, active/completed state, optional overall score, and optional conclusions. Checkpoints support immediate, 15-minute, one-hour, four-hour, next-day, and custom times. Descriptors, notes, fixed 1–5 scales, and overall impression are optional.

`scent_memory_checkpoints` is revisioned evidence. Direct browser insert/update/delete is not granted. The `record_scent_memory_checkpoint` RPC derives workspace ownership from the authenticated session, inserts an immutable revision, and marks the previous current revision superseded during an explicit correction. Historical revisions remain private and readable. Normal deletion is archival/supersession, not physical evidence removal.

## Intelligence grounding

The Edge Function loads at most 20 owner-visible, non-archived sessions, retains only sessions matching selected Product, Formula Version, related Lab Batch, or selected Ingredient, then loads at most 30 current non-archived checkpoints. Stable IDs enter context manifest v2 as `scentMemoryCheckpointIds` and the evidence universe as `scentMemoryCheckpoint:<id>`.

A model `OBSERVATION` may cite an eligible current checkpoint. A separate `PREDICTION` may infer likely behavior and a `RECOMMENDATION` may propose an experiment. Concept Materials are exploratory text and never Scent Memory or evidence.

## Privacy, backup, and limitations

Session/checkpoint RLS is owner-private; anonymous and second-user access is denied. Hosted backup includes every session and all checkpoint revisions. No records are written to localStorage or `workspace_records`. There are no timed notifications, binary attachments, offline capture, or automatic scheduling.
