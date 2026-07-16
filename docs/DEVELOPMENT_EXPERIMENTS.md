# Development Experiments

Phase 9C introduces an owner-private Development Experiment aggregate beside the relational workspace aggregate. An Experiment owns ordered Variants, proposed Changes, observation prompts, lifecycle events, and explicit handoff records. Intelligence remains advisory: a suggestion opens a review screen and nothing persists until **Save Experiment**.

Lifecycle transitions run through `transition_development_experiment` with an expected revision. Records are archived rather than deleted. Approval requires a meaningful objective or hypothesis, at least one variant, and no quantitative Concept Material that has not been mapped to a real Ingredient.

The deterministic Development Copilot reads these records and highlights the next concrete owner action. It does not call a model and cannot mutate data. Completion may link the Experiment to Scent Memory; empirical observations remain distinct from predicted Intelligence.
# Bible documentation contract

The in-app Development Experiments guide is governed alongside this architecture. It distinguishes immutable source suggestion from human-approved persisted plan, states that Review does not save, documents readiness and idempotent Formula/Lab handoffs, and qualifies Approved as internal experiment approval only.
