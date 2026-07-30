# Workspace Foundation Authoring V1

Workspace Foundation Authoring V1 is post-1.0 development that lets the owner
record incomplete but truthful sourcing and workshop plans. It does not seed
workspace data and does not change the Release 1.0 historical baseline.

## Semantic boundaries

- Supplier Products may be candidates before package or price facts are known.
  Price knowledge is recorded as `unknown`, `quote_required`, or `recorded`;
  zero is never used as an unknown price.
- Packaging Components may be planned, specified, sourced, selected, ordered,
  or rejected without implying physical stock. Only Packaging Inventory Lots
  and their movement ledger represent packaging stock.
- Equipment records separate candidate/planned/ordered/owned state from
  availability and calibration state. Reference-library entries are not
  equipment assets.
- Procurement requirements may exist before quantity and unit are decided.
  Those values become mandatory for order-ready and later operational states.
- Ingredient masters and Supplier Products identify materials and sourcing
  options. Only Inventory Lots and immutable movements represent raw-material
  stock.

## Authority and audit

All records remain workspace-owned and protected by the existing RLS policies.
The new `workspace_foundation_status_events` table is owner-readable and has no
client write grant. A hardened trigger function records lifecycle changes as
append-only history; it has an empty fixed search path and no public,
anonymous, or authenticated execute grant.

The application continues to use the startup-selected repository and workspace
action executor. No hosted environment, production data, or deployment is part
of this capability.

## Compatibility

The migration deterministically maps existing records to the new semantic
states. Existing priced Supplier Products remain `recorded`; existing Packaging
Components and Equipment retain their operational meaning. Physical inventory
tables and movement ledgers are unchanged.
