# Workspace Foundation Seed V2 — Final 44 Evidence

## Scope and execution identity

- Execution date: 2026-07-31
- Production create interval: `2026-07-31T09:53:00.272Z` to
  `2026-07-31T10:34:02.722096+00:00`
- Resumed execution interval: `2026-07-31T10:29:32.724797+00:00` to
  `2026-07-31T10:34:02.722096+00:00`
- Branch: `feature/workspace-foundation-seed-v2-final-44`
- Pre-evidence repository HEAD: `92845d13768e904d6ca914bb89546ca379e44aa0`
- Owner identity: authenticated production owner, safely redacted (`…RK`)
- Workspace identity: production owner workspace, safely redacted
  (`1f62…9535`)
- Authority pathway: the deployed production application's normal authenticated
  owner create and lifecycle workflows, browser-safe publishable credentials,
  and Row Level Security.

No service role, privileged SQL, direct database mutation, RLS bypass, schema
change, migration, or application-code change was used. The production frontend
was not deployed or otherwise changed during execution.

## Authorized plan and boundary revision

The exact approved plan contained 44 creates:

| Domain | Approved CREATE actions |
| --- | ---: |
| Supplier Products | 9 |
| Equipment | 3 |
| Packaging components | 9 |
| Procurement requests | 3 |
| Procurement requested items | 20 |
| **Total** | **44** |

The first production session completed 21 creates and stopped before any
Procurement write because the deployed request form creates requests in
`identified`. The revised authorization allowed exactly this supported
two-step lifecycle for the equipment and packaging parents:

```text
CREATE in identified
identified -> specification_required
```

The resumed authorization was therefore exactly 23 creates and two parent
status transitions. No other create, update, delete, transition, or mutation
was authorized or performed.

Excluded throughout:

- no Panthenol Ingredient master;
- no Vitamin E Synthetic Supplier Product;
- no reinterpretation or change to the existing Vitamin E (Tocopherol 70%)
  Supplier Product.

## Resume gate

The repository was clean on the required branch, and `HEAD` exactly matched
`origin/main` at `92845d13768e904d6ca914bb89546ca379e44aa0`.

The fresh pre-resume owner export was generated at
`2026-07-31T10:27:19.432Z`. Platform diagnostics reported `Match`:

| Migration diagnostic | Value |
| --- | --- |
| Actual count | 90 |
| Actual head | `20260731044225` |
| Expected count | 90 |
| Expected head | `20260731044225` |

The production baseline matched exactly:

| Record type | Pre-resume count |
| --- | ---: |
| Ingredient masters | 18 |
| Suppliers | 58 |
| Supplier Products | 22 |
| Equipment | 3 |
| Packaging components | 9 |
| Procurement requests | 23 |
| Procurement requested items | 25 |
| Raw-material inventory lots | 0 |
| Packaging inventory lots | 0 |

All 21 partial-session records were present at the approved IDs and were
byte-equivalent to the verified partial export. None of the three target
requests or twenty target children existed. The reconciliation was exactly:

```text
21 completed records: REUSE
3 Procurement requests: CREATE
20 requested items: CREATE
2 parent transitions: REQUIRED AFTER CREATE
all other UPDATE: 0
DELETE: 0
CONFLICT: 0
AMBIGUOUS: 0
```

## Reused identity anchors

The eight previously created Ingredient masters remained unchanged:

| Ingredient | Stable ID |
| --- | --- |
| Beeswax | `0d6fa51a-b9a6-4102-be75-d67711c35fe1` |
| Cocoa Butter | `d21ef178-9a52-4775-baf3-9467015432b4` |
| Amyris Oil | `945d5c64-9a6c-4d65-8045-d93c7ed036a9` |
| Lavender Oil | `e6ee3201-a61d-4a97-9b50-1c29ab85608e` |
| Scots Pine Leaf Oil | `6aa408c1-b7e4-4fb7-baf9-721af6fedcaa` |
| Atlas Cedarwood Oil | `4466aed4-bf4a-47ac-8f39-54c6e6681b64` |
| Juniper Berry Oil | `d8cf66d2-b24d-450e-8ebc-d4b29c588d41` |
| Cardamom Oil | `510b6aae-38fc-4b95-ba5e-5fb2c278faea` |

Jojoba Golden Carrier Oil remained REUSE:

| Field | Verified value |
| --- | --- |
| Supplier Product ID | `e26016b1-1fb6-482c-a149-b1ae6fc09229` |
| Canonical Supplier ID | `8c8d12e9-8393-484c-a824-b7542025923e` |
| Ingredient | Jojoba Oil |
| Lifecycle | `candidate` |
| Price state | `unknown` |

It was not updated, recreated, relinked, renamed, or counted among the 44
CREATE receipts.

## Complete CREATE receipt index

Every create produced a confirmed owner operation receipt. Receipt ID,
workspace scope, natural identity, persisted timestamp, and applicable
Ingredient, Supplier, or parent ID agreed with immediate owner-authorized
readback.

### Supplier Products — 9 receipts

All nine retained canonical Supplier ID
`8c8d12e9-8393-484c-a824-b7542025923e`, lifecycle `candidate`, price state
`unknown`, and null commercial/package facts.

| Supplier Product | Stable ID | Ingredient ID | Persisted |
| --- | --- | --- | --- |
| Shea Butter Refined | `11e781a5-a724-4beb-8c53-5ca45e05c899` | `5db2bb27-07a1-483b-98fd-43a325a137d5` | `2026-07-31T09:53:00.272Z` |
| White Beeswax Beads | `9bed3473-f1d4-40e3-a1cc-4d99a4c5aa23` | `0d6fa51a-b9a6-4102-be75-d67711c35fe1` | `2026-07-31T09:56:22.914Z` |
| Amyris essential oil | `91bb8532-f9bb-4ebc-b0e2-07b25979947a` | `945d5c64-9a6c-4d65-8045-d93c7ed036a9` | `2026-07-31T09:57:20.211Z` |
| Lavender French essential oil | `881ec39e-9074-4f50-992f-1a89b90692f4` | `e6ee3201-a61d-4a97-9b50-1c29ab85608e` | `2026-07-31T09:57:43.748Z` |
| Pine Sylvestris essential oil | `7ed84a68-c50a-4cb4-a37a-244f648ccb82` | `6aa408c1-b7e4-4fb7-baf9-721af6fedcaa` | `2026-07-31T09:58:02.830Z` |
| Cedarwood Atlas essential oil | `f3023c5d-c6ab-4b75-9673-2b139a88d49a` | `4466aed4-bf4a-47ac-8f39-54c6e6681b64` | `2026-07-31T09:58:20.977Z` |
| Bergamot Calabrian essential oil | `b6d082d5-0734-44ce-a921-bab46ecaa535` | `bc3d51d5-3d56-4c7d-9deb-de095a8dc979` | `2026-07-31T09:58:42.513Z` |
| Juniper Berry essential oil | `59ecd4e0-1d7a-4ac2-af8f-e574518c04f3` | `d8cf66d2-b24d-450e-8ebc-d4b29c588d41` | `2026-07-31T09:59:01.032Z` |
| Cardamom essential oil | `266c5827-e1b0-4d7a-abda-227f2177846e` | `510b6aae-38fc-4b95-ba5e-5fb2c278faea` | `2026-07-31T09:59:22.182Z` |

### Equipment — 3 receipts

| Equipment | Stable ID | Truth state | Persisted |
| --- | --- | --- | --- |
| Precision scale | `8631d7dc-2e98-4534-b27c-d64b3209836f` | planned, not owned, availability unknown | `2026-07-31T10:00:54.580276+00:00` |
| Stainless-steel mixing bowls | `ebc10ce4-98eb-47c8-b3ba-ae22d8fa550f` | planned, not owned, availability unknown | `2026-07-31T10:01:38.15821+00:00` |
| Transfer tools or pipettes | `c0277a9d-30b1-419f-aeaf-8e312ff5357b` | candidate, not owned, availability unknown | `2026-07-31T10:02:21.806368+00:00` |

### Packaging components — 9 receipts

All nine remain not owned, with stock not recorded and no Packaging Inventory
lot.

| Packaging component | Stable ID | Persisted |
| --- | --- | --- |
| Beard Oil bottle | `8c2449b1-b667-4232-a88a-b78cb8a233c3` | `2026-07-31T10:03:30.417Z` |
| Beard Oil dispensing insert | `8efd16ae-d218-4550-a85b-8486b0bf37c6` | `2026-07-31T10:04:17.546Z` |
| Beard Oil cap or closure | `0ec0d2b0-0391-4ec5-a56b-85432caa3772` | `2026-07-31T10:04:45.745Z` |
| Beard Butter jar | `d290d94a-0180-4e1c-a39c-ce0113ce318a` | `2026-07-31T10:05:03.680Z` |
| Beard Balm primary container | `fd739da0-e430-4653-9f59-aab128425bbf` | `2026-07-31T10:05:20.345Z` |
| Primary product label | `2f037ee4-eba5-4e85-8325-096fe09a9ffa` | `2026-07-31T10:05:37.813Z` |
| Batch identification label | `3cb1e971-b853-40d8-9708-b612a1181391` | `2026-07-31T10:05:55.379Z` |
| Tamper-evidence component | `4f58508b-d1ef-4cfb-8575-e93c87198b2e` | `2026-07-31T10:06:14.464Z` |
| Outer carton | `0f07fed4-2973-4543-9e6b-ad53e1a3cc81` | `2026-07-31T10:06:32.964Z` |

### Procurement requests — 3 receipts and 2 transitions

| Request | Stable ID | Created | Final status | Transition readback |
| --- | --- | --- | --- | --- |
| Panthenol sourcing requirement | `1e0313e3-d6f0-45f8-9d97-198c94c45134` | `2026-07-31T10:29:32.724797+00:00` | `identified` | none; remained identified |
| Workspace equipment foundation requirements | `6d64f948-5b34-405c-8663-f7ac554e7836` | `2026-07-31T10:32:09.895249+00:00` | `specification_required` | exactly one transition, persisted `2026-07-31T10:32:29.369+00:00` |
| Initial beard-care packaging requirements | `d2ed7dda-4ebc-4435-97f3-2713c7ac2a52` | `2026-07-31T10:33:29.359082+00:00` | `specification_required` | exactly one transition, persisted `2026-07-31T10:33:42.771+00:00` |

The Panthenol parent retained the exact reason:

> Material identity and physical form must be clarified before Ingredient-master adoption.

### Procurement requested items — 20 receipts

All twenty persisted in `identified`, with quantity and unit undecided, no
target Supplier or Supplier Product, and no ownership, order, receipt, or stock
implication.

| Parent | Requested item | Stable ID | Persisted |
| --- | --- | --- | --- |
| Panthenol | Panthenol | `a9bf6f2e-0b6a-4064-88e1-3adb3edf25e6` | `2026-07-31T10:31:06.522011+00:00` |
| Equipment | Precision scale | `6da62bbe-4cb0-47a8-8ba9-473ce8b25d4d` | `2026-07-31T10:32:51.827054+00:00` |
| Equipment | Mixing vessels | `10ba4bfe-dc86-455a-956d-43ba5e8cc297` | `2026-07-31T10:32:59.110483+00:00` |
| Equipment | Transfer tools or pipettes | `6fe5e972-4337-469b-b1ef-6bdb9cca0c81` | `2026-07-31T10:33:00.486778+00:00` |
| Equipment | Spatulas | `2b0a2acb-c9f1-4d36-8130-44abe882a0e0` | `2026-07-31T10:33:02.015282+00:00` |
| Equipment | Thermometer | `de72c043-4c60-431a-a680-7f7246f31fe0` | `2026-07-31T10:33:03.496164+00:00` |
| Equipment | Controlled heating equipment | `307d1570-2f08-43b0-821a-ba82bff03279` | `2026-07-31T10:33:04.877353+00:00` |
| Equipment | Sanitation equipment | `2411022e-4fa8-42e2-8954-ad628cfeb4c0` | `2026-07-31T10:33:06.25708+00:00` |
| Equipment | Protective equipment | `76e779e5-c095-4589-9218-fed1e5a0cffc` | `2026-07-31T10:33:08.043545+00:00` |
| Equipment | Filling tools | `21fe5e14-a1a9-4b7c-8b97-01aec27e7ae9` | `2026-07-31T10:33:09.526646+00:00` |
| Equipment | Labelling tools | `b498bacb-2ff3-4355-9446-30d18686d871` | `2026-07-31T10:33:10.84812+00:00` |
| Packaging | Beard Oil bottle | `564da639-4e90-4371-9b42-5a19c3304000` | `2026-07-31T10:33:51.262599+00:00` |
| Packaging | Beard Oil dispensing insert | `ac3297c1-e55a-4115-8186-4b6e76f92fd5` | `2026-07-31T10:33:52.693463+00:00` |
| Packaging | Beard Oil cap or closure | `1997eb00-56cc-4697-8ab6-31f7ab2952dc` | `2026-07-31T10:33:54.213454+00:00` |
| Packaging | Beard Butter jar | `99e993a8-f360-4039-bfe2-7046fb5852b6` | `2026-07-31T10:33:55.717572+00:00` |
| Packaging | Beard Balm primary container | `c6cafb85-3d35-4df0-b052-e0fadc0a1838` | `2026-07-31T10:33:57.026707+00:00` |
| Packaging | Primary product label | `d56dc512-43f2-4d76-8d9a-deae17b2b8ee` | `2026-07-31T10:33:58.371584+00:00` |
| Packaging | Batch identification label | `8a0ecd6a-5f20-4fa9-be20-e32eb33ca9cc` | `2026-07-31T10:33:59.752006+00:00` |
| Packaging | Tamper-evidence component | `18184015-bf47-4089-b146-8a83fccff44e` | `2026-07-31T10:34:01.240662+00:00` |
| Packaging | Outer carton | `151f8b5e-12a4-4743-9b20-8fc1d807e467` | `2026-07-31T10:34:02.722096+00:00` |

The Panthenol child explicitly retains unresolved material identity. Its first
form interaction was stopped by client-side required-category validation before
submission. A fresh owner export at `2026-07-31T10:30:51.336Z` proved the item
count was still 25 and no Panthenol child existed. The completed valid form was
then submitted once and produced the single receipt indexed above. No ambiguous
write was retried.

## Readback and unchanged-record proof

- Every CREATE receipt matched immediate owner-authorized readback.
- Fresh reloads returned all three parent IDs, final statuses, and exactly
  1 / 10 / 9 children under the Panthenol / equipment / packaging parents.
- All 82 records present in the pre-resume export remained byte-equivalent in
  the final export.
- All 21 partial-session records remained byte-equivalent to the verified
  partial export.
- All 23 resumed receipt IDs appeared exactly once in the final export.
- Every record remained scoped to the same owner workspace.
- No unexpected field, identity, parent, Supplier link, or lifecycle difference
  was found.

## Final counts and owner evidence export

The final owner-scoped Preview was generated at
`2026-07-31T10:34:57.254Z`:

| Record type | Before Final 44 | Final | Delta |
| --- | ---: | ---: | ---: |
| Ingredient masters | 18 | 18 | 0 |
| Suppliers | 58 | 58 | 0 |
| Supplier Products | 13 | 22 | +9 |
| Equipment | 0 | 3 | +3 |
| Packaging components | 0 | 9 | +9 |
| Procurement requests | 23 | 26 | +3 |
| Procurement requested items | 25 | 45 | +20 |
| Raw-material inventory lots | 0 | 0 | 0 |
| Packaging inventory lots | 0 | 0 | 0 |

The final Preview, focused-browser Copy, local paste, and Download were all
syntactically valid schema-version-1 JSON. Parsed payloads were semantically
identical and had the same generated timestamp, record IDs, and counts. The
downloaded file was independently parsed from disk and matched the Preview.

A secret scan found no password, access token, refresh token, API key,
service-role material, Auth internal, connection string, database credential,
or other-workspace record. The full export is not reproduced in this evidence
document.

## Product Studio and physical truthfulness

Before and after execution, Product Studio reported no Candidate or Approved
Beard Oil formula. Final Beard Oil readiness remained blocked and explicitly
reported:

- Supplier Products never count as stock;
- no valid structured liquid base was selected;
- the Precision scale and Mixing vessel planning records were not both owned
  and available;
- Transfer tools or pipettes remained only candidate/planned and unavailable;
- suitable liquid packaging was planned but neither selected nor owned.

Raw-material Inventory reported 0 Ingredients with stock and 0 active lots.
Packaging reported all nine components at 0 pieces with no inventory data.
Procurement reported no internal Purchase Plans and no Purchase Orders.

No Product became ready because a planning or candidate record existed.

## Zero-write reconciliation

The final fresh owner export was rerun at `2026-07-31T10:38:45.236Z`. Its
records were byte-equivalent to the final export, aside from the new export
generation timestamp. All 45 plan identities—the 21 partial-session creates,
23 resumed creates, and Jojoba REUSE—resolved to the same stable IDs:

```text
REUSE: 45 / 45
CREATE: 0
UPDATE: 0
DELETE: 0
CONFLICT: 0
AMBIGUOUS: 0
```

The idempotency rerun performed zero writes. Platform diagnostics remained
`Match` at migration count 90 and head `20260731044225`.

## Unresolved decisions and integrity confirmations

- Panthenol Ingredient identity and physical form remain unresolved; no
  Ingredient master was created.
- Vitamin E Synthetic mapping remains unresolved; no Supplier Product was
  created or inferred from Vitamin E (Tocopherol 70%).
- No historical sourcing observation was promoted to a current commercial,
  package, price, stock, or availability fact.
- No existing production record was changed, except the two explicitly
  authorized lifecycle transitions on newly created parent requests.
- No Jojoba update occurred.
- No physical stock, lot, inventory movement, ownership, purchase plan, order,
  procurement receipt, payment, delivery, or availability was invented.
- No Auth, Storage, Cloudflare, hosted configuration, schema, migration, or
  application code changed during execution.

## Validation

The pre-commit closeout passed:

- `git diff --check`;
- clean `npm ci` installation (203 packages);
- lint;
- full unit suite: 127 files passed, 11 skipped; 926 assertions passed,
  55 skipped; Cloudflare readiness passed;
- focused Supplier Product canonical-link, owner-operation receipt, and Product
  Studio regressions: 8 files and 55 assertions passed;
- local Supabase integration: 11 files and 55 assertions passed;
- authority and privilege audits: 199 tables, 209 functions, 187 policies,
  638 indexes, and 630 foreign keys inspected;
- migration audit: 90 migrations;
- documentation audit: 81 Markdown files, 0 findings;
- secret audit: 779 repository files;
- accessibility audit: PASS, 0 static findings;
- desktop E2E: 16 passed;
- mobile E2E: 11 passed;
- production build.

The generated authority baseline was refreshed through the standard audit
writer. Its sole diff changes the recorded branch from the prior Jojoba
operations branch to `feature/workspace-foundation-seed-v2-final-44`; all
authority counts and generated audit content otherwise remained unchanged.

The post-validation owner export at `2026-07-31T10:51:02.976Z` remained
record-equivalent to the final seed export, retained the exact final counts,
contained no secret pattern, and Platform still reported `Match` at 90 /
`20260731044225`.

Deploy preflight is run from the clean committed tree so its clean-tree
invariant remains meaningful. Its result belongs to the final handoff rather
than a self-referential commit payload.
