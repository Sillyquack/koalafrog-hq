import { describe, expect, it } from "vitest";
import type { Supplier } from "../../procurement/domain/procurement";
import {
  canonicalSupplierName,
  canonicalSupplierOptionLabel,
  legacySupplierSelectionLabel,
  resolveCanonicalSupplier,
} from "./canonicalSupplierSelection";

const supplier = (
  input: Partial<Supplier> & Pick<Supplier, "id" | "legal_name">,
): Supplier => ({
  trading_name: null,
  supplier_type: "raw_material",
  status: "candidate",
  website_url: null,
  country_code: null,
  default_currency: null,
  default_lead_time_days: null,
  default_payment_terms: null,
  default_incoterm: null,
  minimum_order_value: null,
  internal_rating: null,
  internal_notes: "",
  is_preferred: false,
  verification_state: "unknown",
  archived_at: null,
  revision: 1,
  created_at: "2026-07-31T08:00:00.000Z",
  updated_at: "2026-07-31T08:00:00.000Z",
  ...input,
});

describe("canonical Supplier selection", () => {
  const mystic = supplier({
    id: "supplier-mystic",
    legal_name: "Mystic Moments Ltd",
    trading_name: "Mystic Moments UK",
  });

  it("resolves selection exclusively by stable Supplier ID", () => {
    expect(resolveCanonicalSupplier([mystic], mystic.id)).toBe(mystic);
    expect(
      resolveCanonicalSupplier([mystic], "Mystic Moments UK"),
    ).toBeUndefined();
  });

  it("derives the persisted identity from trading name with legal-name context", () => {
    expect(canonicalSupplierName(mystic)).toBe("Mystic Moments UK");
    expect(canonicalSupplierOptionLabel(mystic)).toBe(
      "Mystic Moments UK — Mystic Moments Ltd",
    );
  });

  it("uses the legal name when no trading name exists", () => {
    const legalOnly = supplier({
      id: "supplier-legal",
      legal_name: "Legal Supplier AS",
    });
    expect(canonicalSupplierName(legalOnly)).toBe("Legal Supplier AS");
    expect(canonicalSupplierOptionLabel(legalOnly)).toBe("Legal Supplier AS");
  });

  it("labels an unlinked legacy identity without auto-assigning it", () => {
    expect(legacySupplierSelectionLabel("Legacy Supplier")).toBe(
      "Legacy supplier name — not canonically linked: Legacy Supplier",
    );
    expect(
      resolveCanonicalSupplier([mystic], "Legacy Supplier"),
    ).toBeUndefined();
  });
});
