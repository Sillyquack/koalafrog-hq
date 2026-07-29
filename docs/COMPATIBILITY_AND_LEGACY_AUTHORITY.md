# Compatibility and legacy authority

Authority metadata version: `1.0.0`.

This document classifies the remaining compatibility structures. The machine-readable source is [platform-audit-config.mjs](../scripts/platform-audit-config.mjs); generated proof is in [platform-authority-inventory.json](generated/platform-authority-inventory.json).

## Platform authority

```mermaid
flowchart LR
  UI["Authenticated workspace UI"] --> EX["Workspace action executor"]
  EX --> RP["Typed repository"]
  RP --> RPC["Owner-derived RPC"]
  RPC --> DB["Canonical relational tables"]
  DB --> EV["Append-only events and ledgers"]
```

## Raw-material inventory

```mermaid
flowchart LR
  RECEIVE["Receive stock"] --> RR["record_inventory_lot_receipt_v1"]
  ADJUST["Manual movement"] --> AR["append_inventory_movement_v1"]
  PRODUCTION["Lab / Production commitment"] --> CR["Controlled commitment RPCs"]
  RR --> LOT["inventory_lots"]
  RR --> MOV["inventory_movements"]
  AR --> MOV
  CR --> MOV
```

Authenticated clients may select `inventory_movements`; they cannot insert, update, or delete it directly.

## Packaging inventory

```mermaid
flowchart LR
  RECEIVE["Receive packaging"] --> RR["record_packaging_lot_receipt_v1"]
  ADJUST["Manual packaging movement"] --> AR["append_packaging_inventory_movement_v1"]
  RUN["Packaging run"] --> PR["Packaging run control RPCs"]
  RR --> LOT["packaging_inventory_lots"]
  RR --> MOV["packaging_inventory_movements"]
  AR --> MOV
  PR --> MOV
```

The packaging ledger remains separate from the raw-material ledger.

## Finished Goods transition

```mermaid
flowchart TB
  LEGACY["finished_goods_batches / movements"] -->|"read-only history"| HISTORY["Legacy Finished Goods routes"]
  OUTPUT["Controlled production output"] --> LOT["finished_goods_lots"]
  LOT --> QUALITY["Quality disposition and release"]
  QUALITY --> RELEASED["released_finished_goods_inventory_lots"]
  RELEASED --> MOV["finished_goods_inventory_movements"]
```

The legacy tables are frozen. `register_finished_goods_output` and `commit_packaging_consumption` are service-only compatibility functions pending removal.

## Workspace v9 transition

```mermaid
flowchart LR
  V9["Local v9 rollback source"] --> IMPORT["One-time relational import"]
  IMPORT --> REL["Relational domain authority"]
  REL --> RECON["Reconciliation evidence"]
  RECORDS["workspace_records"] -->|"read-only compatibility"| RECON
```

No new domain write may target `workspace_records`.

## Ownership boundary

```mermaid
sequenceDiagram
  participant A as Owner A browser
  participant R as Controlled RPC
  participant D as PostgreSQL
  participant B as Owner B data
  A->>R: Authenticated request
  R->>D: Derive auth.uid and workspace
  D-->>R: Owner A rows only
  R--xB: No caller-supplied owner authority
```

RLS remains defence in depth; security-definer functions must derive the actor and workspace internally.

## Removal sequence

```mermaid
flowchart LR
  EVIDENCE["Hosted reconciliation evidence"] --> EXPORT["Retained legacy export"]
  EXPORT --> APPROVAL["Owner removal approval"]
  APPROVAL --> DROP_RPC["Remove deprecated RPCs"]
  DROP_RPC --> DROP_TABLE["Remove legacy tables"]
  DROP_TABLE --> REGEN["Regenerate types and inventories"]
```

Removal is not authorized by this milestone. It requires a separate, reviewed migration after hosted cutover evidence exists.

## Failure handling

```mermaid
flowchart TD
  COMMAND["Persistent command"] --> CHECK{"Canonical command?"}
  CHECK -->|"yes"| RPC["Controlled RPC"]
  CHECK -->|"legacy"| DENY["LEGACY_AUTHORITY_FROZEN"]
  RPC --> RESULT{"Committed?"}
  RESULT -->|"yes"| RELOAD["Reload authoritative state"]
  RESULT -->|"no"| ERROR["Expose error; no silent fallback"]
```

The Supabase repository never falls back to browser storage or a legacy write after a controlled command fails.
