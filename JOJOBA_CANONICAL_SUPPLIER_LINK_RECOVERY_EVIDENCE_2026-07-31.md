# Jojoba Canonical Supplier Link Recovery Evidence

## Scope and execution identity

- Execution date: 2026-07-31
- Evidence generated: 2026-07-31T09:12:15Z
- Authorized update submitted: 2026-07-31T09:06:01.879Z
- Confirmed update receipt persisted: 2026-07-31T09:06:01.919Z
- Branch: `ops/repair-jojoba-canonical-supplier-link`
- Pre-evidence repository HEAD: `a3c698fcad231bae6c3dd1ef70e3c00452a26ffc`
- Owner identity: authenticated production owner, safely redacted (`…RK`)
- Workspace identity: production owner workspace, safely redacted (`1f62…9535`)
- Authority pathway: the deployed production application's normal authenticated
  owner edit workflow, browser-safe publishable credentials, and Row Level
  Security. No service role, privileged SQL, direct database mutation, or RLS
  bypass was used.

This recovery authorized exactly one production business-data update:

```text
Supplier Product: e26016b1-1fb6-482c-a149-b1ae6fc09229
supplier_id: null -> 8c8d12e9-8393-484c-a824-b7542025923e
```

No retry was submitted.

## Pre-update gates

- Working tree was clean and the required branch was checked out.
- The branch was based on deployed `main` at
  `a3c698fcad231bae6c3dd1ef70e3c00452a26ffc`.
- The deployed supplier-link fix was present: the existing record's editor
  showed its legacy unlinked supplier name separately from the stable ID-backed
  canonical option `Mystic Moments UK — Mystic Moments`.
- Platform migration status was `Match`, with 90 applied migrations and head
  `20260731044225`.
- The authenticated application identified the session as the hosted owner
  workspace.

### Existing Supplier Product

| Field | Verified before value |
| --- | --- |
| Stable record ID | `e26016b1-1fb6-482c-a149-b1ae6fc09229` |
| Product | Jojoba Golden Carrier Oil |
| Ingredient ID | `20c96f94-055f-477b-b80f-ce084d6a57ae` |
| Ingredient | Jojoba Oil |
| Supplier ID | `null` |
| Legacy supplier display | Mystic Moments UK |
| Lifecycle | `candidate` |
| Price state | `unknown` |
| Price / currency | `null` / `null` |
| Package quantity / unit | `null` / `null` |
| Preferred | `false` |
| Created | `2026-07-31T07:45:27.073Z` |
| Updated | `2026-07-31T07:45:27.073Z` |

The record appeared exactly once. No Jojoba Golden Carrier Oil record existed
under the intended canonical Supplier ID. Jojoba Oil showed 0 g, 0 active lots,
and no physical inventory data.

### Canonical Supplier

- Stable Supplier ID:
  `8c8d12e9-8393-484c-a824-b7542025923e`
- Trading display: Mystic Moments UK
- Legal identity: Mystic Moments
- Country: GB
- Category/state: raw material / candidate
- Ownership: the same authenticated owner workspace as the Supplier Product

## Authorized update and receipt

The existing Supplier Product edit form was opened. The canonical Supplier was
explicitly selected by its stable ID and the enabled save action was submitted
exactly once.

The confirmed application UPDATE receipt agreed with the intended mutation:

| Receipt field | Confirmed value |
| --- | --- |
| Operation | UPDATE |
| Record ID | `e26016b1-1fb6-482c-a149-b1ae6fc09229` |
| Ingredient ID | `20c96f94-055f-477b-b80f-ce084d6a57ae` |
| Supplier ID | `8c8d12e9-8393-484c-a824-b7542025923e` |
| Supplier display | Mystic Moments UK |
| Product | Jojoba Golden Carrier Oil |
| Persisted at | `2026-07-31T09:06:01.919Z` |

There was no CREATE receipt, no new record ID, no delete, no replacement, and
no retry.

## Readback, fingerprint, and reload

Immediate owner-authorized readback returned the same stable record ID,
Ingredient relationship, product name, lifecycle, price state, null commercial
and package values, availability state, preferred state, and created timestamp.
The persisted Supplier ID was the canonical ID. The normal updated timestamp
changed to the receipt timestamp.

The before fingerprint covered the complete exported record, all 39 named edit
controls, and the associated inventory state:

```text
before sha256: 82fd309a84572f2b65418f9f45aeb84103c381eedd4f48ca45053c8a6f76b73d
after  sha256: f06e8d9f637845bdd82ab29613489bfa1870a377186901966a8122ed8597ddca
```

The full edit-control comparison changed only `supplierId`. The owner export
comparison changed only `supplier_id` and the normal `updated_at` timestamp.
There were no unapproved field differences.

After a fresh application reload, the record still appeared exactly once, the
edit control selected
`8c8d12e9-8393-484c-a824-b7542025923e`, and the complete field comparison still
reported no unapproved differences.

## Owner evidence export

The final owner-scoped preview was generated at
`2026-07-31T09:15:20.773Z`, after the repository audits and build.

| Supported record type | Count |
| --- | ---: |
| Supplier Products | 13 |
| Equipment | 0 |
| Packaging components | 0 |
| Procurement requests | 23 |
| Procurement requested items | 25 |

The target record appeared exactly once. Its record ID matched the UPDATE
receipt, its Supplier ID matched the canonical Supplier, and there was exactly
one Jojoba Golden Carrier Oil entry. Supplier Product IDs showed no create or
delete, and every non-target Supplier Product remained identical to the
pre-update export.

A key-name scan found no access token, refresh token, API key, authorization
value, password, connection string, JWT, service-role material, or other secret.
No credentials, Auth internals, or session material are reproduced here.

## Workspace Foundation Seed V2 reconciliation

The post-update reconciliation resolves Jojoba Golden Carrier Oil as:

```text
Action: REUSE
Stable record ID: e26016b1-1fb6-482c-a149-b1ae6fc09229
Canonical Supplier ID: 8c8d12e9-8393-484c-a824-b7542025923e
CREATE: none
UPDATE: none
Conflict or ambiguity: none
```

The exact unexecuted remainder is:

| Record type | Remaining CREATE actions |
| --- | ---: |
| Supplier Products | 9 |
| Equipment | 3 |
| Packaging components | 9 |
| Procurement requests | 3 |
| Procurement requested items | 20 |
| **Total** | **44** |

The 9 remaining Supplier Product creates are Shea Butter Refined, White Beeswax
Beads, Amyris essential oil, Lavender French essential oil, Pine Sylvestris
essential oil, Cedarwood Atlas essential oil, Bergamot Calabrian essential oil,
Juniper Berry essential oil, and Cardamom essential oil.

The 3 remaining Equipment creates are Precision scale, Stainless-steel mixing
bowls, and Transfer tools or pipettes.

The 9 remaining Packaging creates are Beard Oil bottle, Beard Oil dispensing
insert, Beard Oil cap or closure, Beard Butter jar, Beard Balm primary
container, Primary product label, Batch identification label, Tamper-evidence
component, and Outer carton.

The 3 remaining Procurement requests are Panthenol sourcing requirement,
Workspace equipment foundation requirements, and Initial beard-care packaging
requirements. Their 20 remaining requested-item creates are Panthenol; Precision
scale; Mixing vessels; Transfer tools or pipettes; Spatulas; Thermometer;
Controlled heating equipment; Sanitation equipment; Protective equipment;
Filling tools; Labelling tools; Beard Oil bottle; Beard Oil dispensing insert;
Beard Oil cap or closure; Beard Butter jar; Beard Balm primary container;
Primary product label; Batch identification label; Tamper-evidence component;
and Outer carton.

No part of this 44-create plan was executed.

## Production integrity

| Production record type | Final count |
| --- | ---: |
| Ingredient masters | 18 |
| Suppliers | 58 |
| Supplier Products | 13 |
| Equipment | 0 |
| Packaging components | 0 |
| Procurement requests | 23 |
| Procurement requested items | 25 |
| Raw-material inventory lots | 0 |
| Packaging inventory lots | 0 |

The Packaging surface continued to report 0 planning and physical records.
Product Studio continued to report no Candidate or Approved Beard Oil formula.
The canonical Supplier relationship therefore introduced no stock, ownership,
availability, order, receipt, or readiness implication.

No other Supplier Product changed. No inventory, lot, order, procurement
receipt, ownership, Auth, Storage, Cloudflare, hosted configuration, migration,
or schema change occurred. Production remained at 90 migrations with head
`20260731044225`.

## Validation

The pre-commit closeout passed:

- `git diff --check`
- relevant lint
- 58 focused assertions across 8 Supplier Product, canonical selection,
  submission, preference, owner-operation receipt, and Product Studio test files
- authority audit
- privilege audit
- migration audit: 90 migrations
- documentation audit: 81 Markdown files, 0 findings
- secret audit: 778 repository files
- production build
- final owner-authorized readback
- final owner evidence export
- final reconciliation proving Jojoba REUSE and exactly 44 remaining creates

The authority/privilege audit's generated release baseline was refreshed only
to identify the required operations branch; its sole semantic change is:

```text
branch: fix/supplier-product-canonical-supplier-link
     -> ops/repair-jojoba-canonical-supplier-link
```

Deploy preflight is intentionally run from the clean committed tree so its
clean-tree invariant remains meaningful. Its result belongs to the final
handoff, not to a self-referential commit payload.
