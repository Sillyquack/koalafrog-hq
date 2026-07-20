# Benchmark references

An INCI declaration is label evidence, not a reproducible formula. It does not provide exact percentages, a manufacturing procedure, supplier grades, raw-material compositions, or reliable relative concentration information for ingredients at or below applicable declaration thresholds. Koalafrog therefore stores the exact displayed label order separately and never converts it into percentage-based Formula Lines.

The ingredient layers remain distinct:

- A **Reference Ingredient** is a canonical, provisional research identity shipped in the application library. It is not stock and does not prove safety, suitability, grade, or regulatory status.
- A **Workspace Ingredient** is an identity deliberately adopted for Koalafrog work. Adoption creates no purchasable product or physical quantity.
- A **Supplier Product** is a specific purchasable material with its own documents and grade. It is still not stock.
- An **Inventory Lot** is received physical material whose balance is derived from immutable Inventory Movements.

`Parfum` represents the declared fragrance composition. Anise Alcohol, Benzyl Alcohol, Benzyl Benzoate, Citral, Coumarin, Isoeugenol, Limonene, and Linalool remain separately identifiable declared fragrance constituents, but the benchmark does not assume that they were separately dosed. They may originate from `Parfum` or `Juniperus Virginiana Oil`. Benzyl Alcohol has several possible cosmetic functions generally; its function in this product remains Unknown.

The benchmark hypothesis is an **aqueous glycol soap-gel stick**, more specifically a water/glycol sodium-stearate gel system. Its confidence is `assumed`, not verified. System analysis and desired characteristics are development context only, never ingredient-level facts, performance proof, safety conclusions, compatibility claims, or regulatory conclusions.

Every populated benchmark knowledge statement records its source, confidence, and qualifying notes. Unsupported percentages, process conditions, supplier identities, physical-property values, use levels, identifiers, limits, compatibility, efficacy, and safety conclusions remain Unknown or require review.
