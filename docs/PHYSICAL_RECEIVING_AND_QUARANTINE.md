# Physical receiving and quarantine

The workflow preserves four distinct facts: carrier delivery is a logistics report; physical receipt is the owner’s record that goods arrived; inspection records receiving checks; and quarantine records physically present quantities that remain unavailable.

Receipt lines keep immutable ordered, confirmed, and shipped comparisons beside explicit received, damaged, held, rejected, and quarantine-candidate quantities. Multiple receipts may reference one shipment, and one receipt may explicitly link multiple shipments. Carrier data never supplies received quantity.

Receiving policy `1.0.0` treats identity mismatch, contamination, failed primary-package or required-seal integrity, missing mandatory lot traceability, expiry, unresolved substitution, and critical document mismatch as blockers. Missing received-lot documents, short expiry, minor damage, and temperature review create conditional holds. Requirements remain material-profile specific.

Discrepancies are durable records; resolution never deletes the original observation. Repeated inspections create a new version linked to the prior inspection. Evidence is scoped to the receipt or received lot: a generic supplier document does not prove a lot-specific COA.

`inventory_quarantine_intakes` is separate from raw-material and packaging lot ledgers. It creates no opening balance, Receipt movement, or Production allocation. A later release workflow must review quarantine evidence before creating any Inventory Lot or Inventory Movement.
