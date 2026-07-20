# Benchmark Lab

Benchmark Lab turns a reference product into a distinct Koalafrog development project. It is a requirements and evidence workflow, not a formula-copying or prediction system.

## Domain boundary

The application uses the existing Product Studio Concept as the project aggregate. Its structured `benchmarkLab` analysis document is persisted atomically by the local v9 repository and the relational `product_studio_concepts.analysis` JSONB column. This is appropriate versionable document content: the brief, scorecard, hypothesis, role map, comparison, and readiness acknowledgement are edited together. Products, Formulas, Formula Lines, Ingredient Knowledge, Testing, supplier, procurement, inventory, Lab, and compliance remain separate relational domains.

A benchmark and a product concept are different:

- The benchmark preserves source evidence and an immutable application-shipped snapshot identifier.
- The project records Koalafrog intent, user observations, targets, hypotheses, functional requirements, and open questions.
- Creation copies only the benchmark ID, its snapshot identifier, supported context, and explicit hypotheses. It does not copy the benchmark INCI into composition.

## Evidence semantics

- **Observation** is entered by a user after evaluating a reference product. A 1–10 score has `user_observation` provenance and is not a target.
- **Target** is a Development Brief requirement. It is not evidence that the benchmark or a future product meets it.
- **System hypothesis** is explicitly provisional and uses the existing confidence model: `verified`, `supported`, `observed`, `assumed`, `unknown`, or `conflicting`.
- **Ingredient Knowledge** remains attached to Workspace Ingredients. A manually linked Reference Ingredient candidate is only a stable library ID and does not adopt the ingredient.
- **Formula ingredient** exists only as a Formula Line referencing a Workspace Ingredient.

`Unknown`, `Not tested`, and `Not applicable` are distinct. Zero never represents any of them, and score zero is invalid.

## Workflow

1. Open Natural Deodorant Studio and review the structured benchmark.
2. Create a development project with an editable title, category, format, and physical-system hypothesis.
3. Record actual benchmark observations in the scorecard.
4. Define the Development Brief, constraints, targets, priorities, and user-written success criteria.
5. Review the system hypothesis, evidence source, confidence, supporting or contradicting observations, and open questions.
6. Review functional requirements and optionally link Reference Ingredient candidates.
7. Compare observed benchmark scores with Koalafrog targets.
8. Complete the readiness review or explicitly acknowledge unresolved items.
9. Create a blank Draft Formula.

The Formula Gate creates a Product, Formula, and Draft Formula Version through the existing atomic Product Studio handoff. The Formula has no Formula Lines, percentages, phases, or manufacturing process. Development notes preserve benchmark → project → Draft lineage.

## Persistence and safety

Explicit save follows existing Product Studio behavior. Navigation and browser-close attempts are guarded while edits are dirty. Supabase updates retain the repository’s optimistic `updated_at` stale-conflict check. Backup/export/import already includes Product Studio Concepts and therefore the entire Benchmark Lab document.

Deleting or editing a development project never overwrites the application-shipped benchmark. Benchmark linkage creates no Workspace Ingredients, Supplier Products, Inventory Lots, Inventory Movements, procurement requests, packaging stock, Lab Batches, or compliance conclusions.

## Current limitations

- One benchmark per project.
- No media attachments in this first version; compliance document storage is not reused for informal benchmark media.
- No candidate or Lab-result comparison yet.
- No Formula recommendation, prediction, automated role suggestion, chemistry, safety, regulatory, efficacy, or supplier-availability inference.
- Product Studio Concepts are not independently revisioned; repository timestamps and backups provide current-state history boundaries.

Future extensions may add multi-benchmark comparison, lab-result comparison, statistical analysis, automated candidate suggestions, and an evidence-aware development assistant without changing the separation rules above.
