# Equipment management

An Equipment Item is a Koalafrog-owned operational asset. It is distinct from an equipment Supplier Product, which is only a purchasable offer.

Equipment records hold identity, status, location, capacity, precision, purchase reference, and optional Supplier. Capabilities describe what an item can do. Policies describe expected inspection, calibration, maintenance, and cleaning evidence.

Inspection, calibration, maintenance, repair, and cleaning are append-only Service Events. Corrections are new events; old evidence is not rewritten.

Readiness evaluates recorded status, capability, capacity, precision, cleaning requirements, and due dates. Its result is operational guidance, not a safety certification, regulatory approval, or guarantee that equipment is fit for use.

Phase 10A does not implement IoT ingestion, autonomous maintenance scheduling, or autonomous operational decisions.
