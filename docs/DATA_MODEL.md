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

An Ingredient is the raw-material concept: common and INCI names, category, multiple functions, description, default unit, reorder threshold, notes, and lifecycle status. It carries no authoritative physical quantity.

## Supplier Product

A Supplier Product is one purchasable source for an Ingredient. It records the supplier as a name until the dedicated Supplier module exists, plus SKU, package size, price, currency, URL, notes, and preferred status. One Ingredient may have multiple supplier products and at most one is marked preferred by the current UI.

## Inventory Lot

An Inventory Lot represents a specific physical receipt or container group. It belongs to an Ingredient and may reference a Supplier Product. It owns an immutable internal lot number, receipt metadata, opening receipt quantity, unit, dates, location, status, and notes. Internal numbers currently follow `KF-ING-YYMMDD-NNN`; generation is isolated so the format can evolve.

## Inventory Movement

Every stock change is an append-only Inventory Movement against one lot. Receipt adds stock; Consumption, Waste, and Sample remove it; Adjustment carries an explicit positive or negative correction. Movement history is authoritative and balances are derived rather than overwritten. Old movements are not edited casually.

Units remain deliberately small: g, kg, ml, L, and pcs. Only kg ↔ g and L ↔ ml conversions are supported. Mass and volume are never interconverted.

## Batch

A Lab Batch belongs to a Product and Formula and references an exact Formula Version. It records planning, lifecycle, purpose, actual final yield, summary, and timestamps. Planned → In Progress fixes the source and opens execution; Completed freezes core execution but still permits later Observations and linked Testing; Aborted preserves work and movements; Archived remains historical. Completed means execution finished, not commercial approval.

## Lab Batch Line and Lot Allocation

Lab Batch Lines are execution snapshots generated once from canonical formula percentages. They preserve ingredient identity/name context, phase, planned quantity, actual quantity, variance, status, and notes. They never update the Formula Version.

A line may have multiple Lot Allocations. Each allocation records the actual lot and quantity used. Stock changes only when allocations are explicitly committed. Commit creates immutable Consumption movements with `referenceType: LabBatch`, the batch ID, and stores each movement ID on its allocation to prevent duplicates.

## Process, observations, and testing

Ordered Process Steps are copied from available formula instructions and then belong to the batch. Lab Observations support arbitrary types and target dates plus structured sensory and physical notes. Due state is derived as Completed, Overdue, Due, Upcoming, or Unscheduled.

A Tester is a lightweight display identity. Test Templates contain ordered focused questions. A Test Session references one exact Lab Batch and Template. A submitted Test Response references its Session and Tester and is immutable.

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
   │                         └──< LabBatch ──< LabBatchLine ──< LotAllocation
   │                                              │                  │
   │                                              ├──< Observation   └── InventoryMovement
   │                                              └──< TestSession ──< TestResponse
   └── ScentProfile

ScentProfile ──< FragranceExperiment >──< Accord >──< ScentMaterial
Ingredient ──< SupplierProduct
     │
     └──< InventoryLot ──< InventoryMovement
```

Cardinalities and ownership rules should be validated through real workflows before a database schema is created.
## Production and costing

`Product → Formula → Approved FormulaVersion → ProductionRun → ProductionRunLine → ProductionRunAllocation → InventoryMovement`

- ProductionRunLine is an execution snapshot: source line and ingredient IDs plus ingredient name, phase, percentage, planned quantity, unit, and notes at creation.
- ProductionRunAllocation supports many physical lots per line. Commitment stores its append-only movement ID and historical unit-cost/currency snapshot.
- ProductionProcessStep copies source instructions and can be completed, skipped, or annotated independently.
- InventoryLot optionally stores `totalAcquisitionCost`, `acquisitionCostCurrency`, and `costNotes`. Absence means Unknown.
- CostLine has ProductionRun, Product, or FormulaVersion scope and a simple category/amount/currency/quantity record. It is deliberately not packaging inventory or accounting.

Historical run rules: source and execution become fixed after starting/completion as appropriate; Completed execution, committed movements, and allocation cost snapshots are not silently rewritten. Acquisition metadata on an editable lot may be corrected without rewriting movements, while already-committed Production allocations retain their earlier snapshot.

## Packaging and Finished Goods

`PackagingComponent → PackagingSupplierProduct → PackagingInventoryLot → PackagingInventoryMovement`

`Product → PackagingSpecification → PackagingSpecificationVersion → PackagingSpecificationLine`

`ProductionRun → FinishedGoodsBatch → FinishedGoodsMovement`

Packaging allocations connect exact Specification Lines and physical Packaging Lots to a Finished Goods Batch. Committed allocations retain movement and unit-cost snapshots. Finished Goods availability is the sum of ProductionReceipt and Adjustment less Sample, Tester, Sale, Waste, and InternalUse movements. `Sale` is manual stock bookkeeping only.

Registered Finished Goods quantities across a Production Run may never exceed `actualUnitsProduced`. Finished Goods trace back through exact Production Run and Formula Version IDs; packaged output additionally retains the exact Approved Packaging Specification Version.
