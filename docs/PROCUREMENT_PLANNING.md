# Procurement planning

Procurement is a planning and evidence layer around the two existing inventory ledgers. It never mutates stock.

## Requirements

A requirement is calculated from recorded inputs:

`target + planned demand - usable on-hand - open planned supply`

The result is clamped at zero, then adjusted upward for an applicable MOQ and order multiple. The UI shows the calculation basis and distinguishes below-minimum attention from a planned need. Missing inputs remain unknown; they are never silently replaced with zero.

## Quotes and landed cost

Quote lines retain supplier currency. Merchandise, shipping, duties, tax, payment fee, and additional cost are separate components. A comparison currency is shown only when a recorded rate exists. A comparison rate is planning evidence, not accounting truth, and never rewrites the source quote.

## Purchase Plans

Lifecycle: Draft → Ready for review → Approved internally → Ordered externally → Partially received → Received. Cancelled and Archived are explicit terminal paths. “Approved internally” is not an external order. “Ordered externally” only records that a human placed the order elsewhere.

Creating or reviewing a plan creates no Inventory Lot, Inventory Movement, packaging lot, payable, payment, or external transaction. Receipt automation is deliberately deferred behind a future explicit transactional review boundary; current receipts continue through their authoritative domain workflows.
