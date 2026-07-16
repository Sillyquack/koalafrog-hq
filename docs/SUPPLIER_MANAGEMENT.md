# Supplier management

Phase 10A makes the Supplier a first-class, owner-scoped record while preserving the existing raw-material and packaging Supplier Products.

## Concept mapping

| Existing concept | Phase 10A treatment |
| --- | --- |
| `supplier_products` | Kept as the purchasable raw-material offer; linked to a Supplier with `supplier_id`. |
| `packaging_supplier_products` | Kept as the purchasable packaging offer; linked to a Supplier with `supplier_id`. |
| `supplier_name` snapshots | Kept for historical compatibility; not used as the normalized identity. |
| Inventory and packaging lots | Unchanged; a real receipt and immutable movement remain stock truth. |
| Compliance document objects | Kept for release evidence; Supplier/Equipment document metadata uses the same private-storage boundary. |

Supplier status is explicit: Research, Candidate, Approved internally, Active, Paused, Rejected, and Archived. Archiving hides a Supplier from normal lists but preserves quotes and history.

Research Candidates are deliberately separate and labelled unverified. Conversion is an explicit, idempotent server-side operation. Candidate text or claimed capabilities never become verified facts automatically.

Supplier Products belong to one purchasable domain and may carry MOQ, order multiple, lead time, availability, sample, discontinued, and verification metadata. They are not stock.

Koalafrog does not place orders, execute payments, create payables, or run autonomous supplier agents.
