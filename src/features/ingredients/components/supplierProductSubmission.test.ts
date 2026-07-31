import { describe, expect, it, vi } from "vitest";
import {
  persistSupplierProductForm,
  persistenceErrorMessage,
} from "./supplierProductSubmission";

describe("Supplier Product form persistence", () => {
  it("closes only after confirmed persistence", async () => {
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const saved = { id: "supplier-product" };

    await expect(
      persistSupplierProductForm(
        () => Promise.resolve(saved),
        onSuccess,
        onFailure,
      ),
    ).resolves.toBe(saved);
    expect(onSuccess).toHaveBeenCalledWith(saved);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("keeps the form open and surfaces the persistence error", async () => {
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    await expect(
      persistSupplierProductForm(
        () => Promise.reject(new Error("RLS denied the insert")),
        onSuccess,
        onFailure,
      ),
    ).resolves.toBeUndefined();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith("RLS denied the insert");
  });

  it("does not emit success when canonical Supplier readback mismatches", async () => {
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const mismatch =
      "Supplier Product persistence readback did not match the selected canonical Supplier.";

    await persistSupplierProductForm(
      () => Promise.reject(new Error(mismatch)),
      onSuccess,
      onFailure,
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(mismatch);
  });

  it("provides an actionable fallback for non-Error failures", () => {
    expect(persistenceErrorMessage({ code: "unexpected" })).toBe(
      "Could not save Supplier Product.",
    );
  });
});
