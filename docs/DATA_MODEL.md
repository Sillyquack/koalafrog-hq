# Initial data model

This document describes domain concepts, not a production database schema.

## Product

A product is the central development object. It has a category, operational status, development stage, description, scent profile, target launch date, and audit timestamps. It may reference current development and current approved Formula Version IDs without embedding full formula objects.

## Formula

A Product has zero or more Formulas. A Formula belongs to exactly one Product and represents a named formulation direction such as Original Formula or Summer Lightweight Formula.

## Formula Version

A Formula has one or more Formula Versions with human-readable labels such as `v0.2` or `v1.0`. Draft is editable. Candidate, Approved, and Retired versions are frozen. Changing a frozen composition requires duplication as a new Draft with new version and line IDs and an optional reference to its source version.

Future Lab Batches will reference immutable Formula Version IDs, making historical integrity essential.

## Formula Line

A Formula Version owns ordered Formula Lines. Each line references an Ingredient ID and stores percentage by weight, a flexible phase label, sort order, and working notes. Percentages are canonical; target gram weights are derived at calculation time and are not stored as another source of truth.

## Ingredient

An ingredient identifies a material by common and INCI names, category and function. The foundation also carries a current supplier, quantity on hand, unit, reorder level, unit cost, and working notes. Future inventory work should move stock and supplier relationships into their own entities instead of expanding this convenience model indefinitely.

## Batch

A batch belongs to one product and references a formula version. It records a human-readable batch number, date, status, target and actual yield, notes, and observations. Planned child records include ingredient weigh-ins, process steps, deviations, images, and time-based observations.

## Scent domain

- **Scent profile:** an olfactive direction with descriptive notes and a development maturity signal.
- **Scent material:** an individual aromatic reference with family and observed character.
- **Accord:** a named composition study that references multiple scent materials.
- **Fragrance experiment (planned):** a versioned trial connecting materials or accords, proportions, evaluation, and iteration lineage.
- **Signature scent DNA:** the evolving central profile intended to guide scent decisions across products, not a commercial fragrance formula.

## Supporting concepts

Testing activities schedule observations against a product, batch, packaging study, or future protocol. Activity records provide a readable audit trail of significant changes. Supplier, inventory lot, equipment, production, costing, compliance, packaging, launch, and knowledge entities are reserved for later phases.

## Relationship overview

```text
Product ──< Formula ──< FormulaVersion ──< FormulaLine >── Ingredient
   │                         │
   ├──< Batch >──────────────┘
   │      ├──< BatchObservation
   │      ├──< BatchWeighIn
   │      └──< BatchDeviation
   ├──< TestActivity
   └── ScentProfile

ScentProfile ──< FragranceExperiment >──< Accord >──< ScentMaterial
Ingredient ──< InventoryLot >── Supplier
```

Cardinalities and ownership rules should be validated through real workflows before a database schema is created.
