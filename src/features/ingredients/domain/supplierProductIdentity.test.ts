import { describe, expect, it } from "vitest";
import {
  matchingSupplierProductIdentities,
  sameSupplierProductIdentity,
} from "./supplierProductIdentity";

const candidate = {
  ingredientId: "ingredient",
  supplierId: "supplier",
  supplierName: "Mystic Moments UK",
  productName: "Jojoba Golden Carrier Oil",
};

describe("Supplier Product identity", () => {
  it("detects a normalized duplicate for the same supplier and Ingredient", () => {
    expect(
      sameSupplierProductIdentity(candidate, {
        ...candidate,
        supplierName: "Compatibility name does not override a canonical ID",
        productName: "  jojoba   golden carrier oil ",
      }),
    ).toBe(true);
  });

  it("keeps distinct products and Ingredients separate", () => {
    expect(
      sameSupplierProductIdentity(candidate, {
        ...candidate,
        productName: "Jojoba Refined Carrier Oil",
      }),
    ).toBe(false);
    expect(
      sameSupplierProductIdentity(candidate, {
        ...candidate,
        ingredientId: "another-ingredient",
      }),
    ).toBe(false);
  });

  it("keeps a legacy null-ID row compatible with its canonical identity", () => {
    expect(
      sameSupplierProductIdentity(
        { ...candidate, supplierId: undefined },
        candidate,
      ),
    ).toBe(true);
  });

  it("exposes ambiguous legacy matches instead of selecting one", () => {
    const legacy = {
      ...candidate,
      supplierId: undefined,
      id: "legacy-a",
      notes: "",
      isPreferred: false,
      createdAt: "",
      updatedAt: "",
    };
    expect(
      matchingSupplierProductIdentities(
        [legacy, { ...legacy, id: "legacy-b" }],
        candidate,
      ).map((item) => item.id),
    ).toEqual(["legacy-a", "legacy-b"]);
  });
});
