# Koalafrog Workspace Foundation Seed V1 — Production Evidence

Date: 2026-07-30  
Disposition: **BLOCKED — no production writes performed**

## Scope and safety

The production project `fetmeynkvylznapdikht` (`Koalafrog HQ`) was inspected
read-only before creation. It reported `ACTIVE_HEALTHY`. The active workspace is
`1f6298dd-f661-4c05-86f9-112e6b989535`, owned by
`aa566306-bbdd-4deb-adf0-bdb5c160a113`.

No schema, migration, RLS, Auth, Storage, Cloudflare, application code,
environment, deployment, or hosted configuration change was made. No production
row was inserted, updated, or deleted.

## Before / after manifest

| Domain | Before | Created | Reused / reconciled | Skipped or unresolved |
| --- | ---: | ---: | --- | --- |
| Equipment | 0 | 0 | None | Precision scale; stainless mixing bowls |
| Packaging components | 0 | 0 | None | All six requested planned components |
| Raw-material inventory lots | 0 | 0 | None | Correctly omitted: factual lot fields are absent |
| Packaging inventory lots | 0 | 0 | None | Correctly omitted: factual lot fields are absent |
| Supplier | Existing | 0 | Mystic Moments (`candidate`, UK context retained) | No duplicate created |
| Ingredient masters | 10 existing relevant records | 0 | Argan Oil; Castor Oil; Coconut Fractionated Carrier Oil; Jojoba Oil; Mango Butter; Shea Butter; Squalane; Sunflower Seed Oil; Tocopherol; Bergamot Oil | Additional aromatic/wax/butter masters not created |
| Procurement requests | Existing extensive request set | 0 | Requests already cover CCT, castor oil, squalane, white beeswax, vitamin E, jojoba, Amyris, lavender, pine, cedarwood, bergamot, juniper and cardamom | Equipment and packaging gaps remain absent |
| Supplier products | Existing workspace rows, but no truthful Mystic Moments seed set established | 0 | None added | Blocked by mandatory factual values described below |

The existing records are richer than the proposed sparse seed in several areas,
so they were preserved rather than overwritten. Existing semantically equivalent
names were treated as matches (for example `Jojoba Oil`, `Coconut Fractionated
Carrier Oil`, `Tocopherol`, and `Shea Butter`).

## Blocking conditions

The authorized instruction prohibits invented price, package size, and other
commercial facts and prohibits bypassing application authority with direct SQL.
The current normal application contracts cannot represent all requested records
truthfully:

1. `supplier_products.package_quantity`, `package_unit`, `price`, and `currency`
   are non-null. The normal Supplier Product form additionally rejects a price
   that is not greater than zero. Therefore the confirmed reviewed Mystic
   Moments items cannot be created when price is unknown, and products whose
   package size is unknown cannot be created without fabrication.
2. Packaging masters require `colour`, `material`, `notes`, and a status, while
   the production Packaging creation UI creates only a name plus fixed defaults
   (`Other`, blank material/colour/notes, `Research`). Its edit action exposes
   only the name. The requested operational states (`Planned`, `To source`,
   `Specification required`) and decision notes cannot be recorded through the
   normal UI.
3. `equipment_items` has no quantity field. Creating five identical mixing-bowl
   rows would introduce semantic duplicates, while creating one row would lose
   the confirmed quantity. The production create UI also captures only name,
   type, and location; it cannot capture the confirmed range, resolution, use,
   quantity, or calibration-verification note.
4. Procurement requested items require a positive requested quantity and unit.
   For equipment and packaging verification gaps those quantities/specifications
   are not all factual, so the missing gaps cannot all be created without
   inventing values.

Using privileged SQL would bypass the authenticated owner/RLS write path and was
therefore deliberately not used.

## Product Studio readiness

Production Product Studio loaded successfully under the owner session and used
the authoritative Supabase workspace. The Beard Oil “Make Something Today”
workflow reported:

- no available owned precision scale;
- no available owned mixing vessel;
- no available owned transfer tools or pipettes;
- no suitable bottle stock;
- workspace ingredient selection remains available, but Supplier Products do
  not count as stock.

This is an accurate readiness result. No unavailable stock was marked owned and
no readiness state was forced.

## Duplicate prevention

- Mystic Moments was matched to the existing supplier and not recreated.
- Ten equivalent ingredient masters were matched and not recreated.
- Existing procurement requests were matched by material intent, not merely by
  exact title.
- No new inventory lot was created because the mandatory factual lot identity,
  received date, quantity, and location are not available.
- Existing production data already contains duplicate-like research records in
  some areas; this execution neither altered nor compounded them.

## Required unblock

Provide an authenticated, owner-scoped application/RPC import path that:

- accepts `Unknown` commercial values without converting them to zero;
- supports idempotency keys or semantic upsert matching;
- records full equipment and packaging master metadata, including confirmed
  quantity or an explicit asset-group model;
- creates verification/procurement gaps without fabricated requested quantity;
- preserves the existing workspace action executor and RLS ownership.

Alternatively, change the requested scope to omit supplier products and fields
that the current production UI cannot truthfully represent. Until one of those
conditions is met, this seed cannot receive a PASS disposition.
