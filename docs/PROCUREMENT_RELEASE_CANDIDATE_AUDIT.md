# Procurement Readiness V1 release-candidate audit

Status: local release-candidate hardening

Scope: procurement through the controlled handoff to Production

Non-goals: landed cost, claims, payments, integrations, deployment, or new workflow stages

## Lifecycle invariant map

Every mutation is one PostgreSQL transaction. Browser writes use authenticated RPCs; history and ledgers are not browser-writable.

| Boundary | Allowed transition and immutable evidence | Forbidden transition / side effect | Atomic effect and retry boundary |
|---|---|---|---|
| Published Scenario → Purchase Plan | Approve one exact scenario/round revision; snapshot supplier, line, quantities, assumptions, and scenario source | Approval never places an order or creates stock | Lock scenario and round; one immutable plan version and audit event; an identical approval returns the existing plan |
| Plan → checkout-ready | Record/waive explicit verification findings against the plan version | Verification never changes ordered, received, or stock quantities | Lock plan/finding revisions; audit every decision; stale revisions fail |
| Checkout-ready Plan → Draft Purchase Orders | Derive one draft per immutable plan basket | No external reference, shipment, receipt, or stock | Lock plan; handoff key/fingerprint covers plan version and baskets; header, lines, and events roll back together |
| Draft → placed | Record externally observed placement with reference and time | Internal approval is not placement; placement is not confirmation or receipt | Lock order/revision; placement key and payload distinguish retry from conflict; audit and supplier event are atomic |
| Placed → confirmation | Append supplier confirmation version and line decisions | Confirmation never overwrites ordered snapshots and never ships goods | Lock order and lines; confirmation key/fingerprint; header, lines, audit, and supplier event are atomic |
| Accepted confirmation → Shipment | Create shipment lines only from accepted confirmed quantities | Cumulative shipped cannot exceed accepted confirmed quantity | Lock order/confirmation/lines; creation key plus payload; shipment and event rows are atomic |
| Shipment → carrier state | Append tracking event and update controlled shipment state | Carrier “delivered” never creates a physical receipt | Lock shipment revision; event key/fingerprint; transition and history are atomic |
| Delivered shipment/order → Receipt | Record physical possession independently of carrier quantity | Receipt is not inspection, acceptance, or release | Lock order and relevant lines; receipt key; header and receipt lines are atomic |
| Receipt → Inspection | Append inspection facts, damage, holds, rejection, and acceptable quantity | Inspection cannot create inventory lots or usable balance | Lock receipt/revision; inspection key; findings, discrepancy, audit, and receiving state are atomic |
| Inspection → Quarantine | Create intake only from acceptable inspected quantity | Quarantine never contributes to available inventory | Lock completed receiving aggregate; intake key/fingerprint; intake and events are atomic |
| Quarantine → Quality Release | Append review decision and quantity | Held/rejected quantities cannot be released | Lock intake and prior reviews; review key/fingerprint; decision and audit are atomic |
| Release → Inventory Lot | Create a provenance-bound raw-material or packaging lot | Direct browser lot creation and cross-domain/cross-intake linking are denied | Same release transaction; lot is created only for a release decision |
| Inventory Lot → opening movement | Append exactly one Receipt movement with acquisition-cost snapshot (or Unknown) | No duplicate opening movement; no mutation of historical movements | Unique release provenance/idempotency constraint; review, lot, movement, and aggregate update roll back together |
| Released Lot → Production | Availability derives from ledger balance less reservations; exact compatible unit/domain required | Quarantined, held, rejected, depleted, foreign-workspace, or incompatible-unit lots cannot be reserved or consumed | Production commitment locks run, allocations, lots, and ledger state; retry does not duplicate Consumption |

Negative proof: each earlier stage lacks both the grant and RPC path needed to create a later-stage record. Carrier delivery is evidence only. Inspection and quarantine have no inventory effect. The release RPC is the sole bridge and commits its review, lot, opening movement, and aggregate change together. Unique provenance and idempotency keys make replay observable without duplicating effects.

## Transaction and idempotency matrix

| Mutation family | Locked revision/source | Idempotency/fingerprint | Retry / conflict | Historical effects |
|---|---|---|---|---|
| Scenario generation/publication/approval | round + scenario | source fingerprint and exact revisions | matching generated set or published state returns; stale revision fails | scenario/plan audit |
| Checkout verification | plan + verification | verification identity and revision | same current fact is safe; stale revision fails | plan audit |
| Draft handoff | plan + baskets | handoff key + plan-version payload | identical retry returns drafts; conflicting payload fails | order audit |
| Placement | purchase order | order revision + placement key/payload | identical retry returns revision; conflicting external fact fails | order audit + supplier event |
| Confirmation and decision | order + prior confirmation | confirmation key/version + line payload | identical retry returns record; stale/conflicting version fails | order audit + supplier event |
| Shipment and transition | order + confirmation + shipment | creation/event key + payload | identical event is no-op/return; conflicting retry fails | shipment history + audit + supplier event |
| Receipt/inspection/quarantine | order + shipment/receipt | creation key + complete line payload | exact retry returns aggregate; cross-stage or stale input fails | receiving/discrepancy/audit events |
| Quality release | quarantine intake + review history | release key + decision/quantity/evidence fingerprint | identical retry returns lot/movement; conflict fails | quality review + order audit |
| Production reservation/consumption | run + allocations + lots | explicit commitment identity | committed replay cannot duplicate ledger rows | immutable Reservation/Consumption movements |

PostgreSQL exceptions abort the entire statement transaction. Focused pgTAP covers invalid links, stale revisions, conflicting retries, direct history/ledger mutation, and unavailable-lot consumption. Deliberate failures after dependent inserts prove no header-only, line-only, lot-only, or movement-only state survives.

## Quantity and unit reconciliation

| Quantity | Authority | Cumulative invariant |
|---|---|---|
| required | immutable procurement requirement derived from exact formula/run planning inputs | never inferred from an order |
| planned | immutable Purchase Plan line | at least the approved requirement decision; remains distinct from ordered |
| ordered | Purchase Order line snapshot | never overwritten by confirmation |
| confirmed | accepted confirmation lines, summed by order line | independent versioned supplier assertion |
| shipped | shipment lines, summed by order line | `shipped <= accepted confirmed` |
| physically received | receipt lines, summed by order line | independent of shipped/carrier-delivered; discrepancies remain explicit |
| damaged / held / rejected | inspection and quality-review facts | excluded from acceptable/releasable/available |
| quarantined | quarantine intake lines | `quarantined <= acceptable physically received` |
| released | release reviews | `released <= quarantined - prior terminal decisions` |
| current balance | immutable lot movements | opening + adjustments + receipts - consumption (reservations are commitments, not physical depletion) |
| reserved | active Reservation movements/allocations | excluded from availability and cannot exceed usable balance |
| consumed | Consumption movements | committed only from released compatible lots |
| available | derived per compatible lot/unit | `physical balance - active reservations`; never includes quarantine, held, or rejected quantities |

Split orders, confirmations, shipments, receipts, releases, movements, and reservations reconcile by immutable source-line identifiers, not by description. Unit equality/normalization occurs before allocation; incompatible mass, volume, count, raw-material, and packaging units are rejected rather than converted speculatively.

## Numeric bounds and deterministic ranking

PostgreSQL commercial amounts and ranking scores use arbitrary-precision `numeric`. Package counts remain positive `integer`; every weighted counter in ranking is explicitly promoted to `numeric` before multiplication, preventing `int4` intermediate overflow. Monetary multiplication, percentage division, discount allocation, shipping addition, surplus cost, and basket sums remain `numeric` end to end.

The browser projection accepts only finite magnitudes up to `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). This comfortably exceeds the documented maximum-realistic case (10,000 suppliers, 100,000 lines, and 1 trillion currency units) while rejecting unsafe or infinite beyond-operational inputs. Fractional package prices, quantities, discounts, and shipping remain supported. Exact persisted financial truth remains PostgreSQL `numeric`, not JavaScript.

Ranking uses score ascending, then strategy, then stable scenario id. Null totals use the established fallback; no business weights changed.

## Drift and warning disposition

| Finding | Classification | Disposition |
|---|---|---|
| Beard semantic-v4 function-body assertions | stale test after v6 wrapper delegation | assert the current public wrapper delegates to the private v5 semantic validator; v4 constraints/provenance assertions remain |
| Four FK failures | obsolete pgTAP overload usage, not missing constraints | assert both columns of each composite FK explicitly |
| RLS plan 270 vs 284 | migration-order/test-plan drift | enumerated 284 current assertions; exact plan now passes |
| `prevent_beard_log_mutation` mutable search path | implementation hardening | fixed to `pg_catalog,public,pg_temp` |
| scenario ranking overflow | implementation bug | promote integer counters before weighted multiplication; browser guards unsafe numbers |
| legacy JSONB assignment warning | established static PL/pgSQL warning; reviewed behavior-preserving assignment | deferred: no demonstrated correctness fault; replace only with a separately tested function rewrite |
| `convert_supplier_candidate` idempotency parameter | legacy API naming/unused parameter | deferred: aggregate is already idempotent by locked candidate conversion; removing the parameter would break the published RPC signature |
| broad auth init-plan warnings | historic policy surface | current procurement lifecycle policies already use scalar `(select auth.uid())`; avoid unrelated policy churn in this milestone |

## Release gate

A release candidate requires: clean reset from all local migrations; 9/9 pgTAP files with the exact 592-test plan; focused procurement integration and security suites; complete unit suite; lint/advisor review with no new warning; production build; and configured desktop/mobile E2E. This document records local evidence only and authorizes no remote migration, push, merge, or deployment.
