# Initial data model

This document describes domain concepts, not a production database schema.

## Product

A product is the central development object. It has a category, operational status, development stage, description, current formula version, scent profile, target launch date, and audit timestamps. Suggested stages run from Idea through Research, Formulation, Testing, Validation, Compliance, Production Ready, and Launched.

## Formula (planned)

A product has many formula versions and one may be designated current. A formula will contain ingredient lines, percentages, process instructions, calculated yield, and change notes. Formula immutability and promotion rules need design before implementation.

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
Product ──< FormulaVersion ──< FormulaIngredient >── Ingredient
   │              │
   ├──< Batch >───┘
   │      ├──< BatchObservation
   │      ├──< BatchWeighIn
   │      └──< BatchDeviation
   ├──< TestActivity
   └── ScentProfile

ScentProfile ──< FragranceExperiment >──< Accord >──< ScentMaterial
Ingredient ──< InventoryLot >── Supplier
```

Cardinalities and ownership rules should be validated through real workflows before a database schema is created.
