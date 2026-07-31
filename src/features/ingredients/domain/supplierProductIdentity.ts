import type { SupplierProduct } from "../../../types/domain";

const normalizeIdentity = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function sameSupplierProductIdentity(
  left: Pick<
    SupplierProduct,
    "ingredientId" | "supplierId" | "supplierName" | "productName"
  >,
  right: Pick<
    SupplierProduct,
    "ingredientId" | "supplierId" | "supplierName" | "productName"
  >,
) {
  return (
    left.ingredientId === right.ingredientId &&
    normalizeIdentity(left.productName) ===
      normalizeIdentity(right.productName) &&
    (left.supplierId && right.supplierId
      ? left.supplierId === right.supplierId
      : normalizeIdentity(left.supplierName) ===
        normalizeIdentity(right.supplierName))
  );
}

export function matchingSupplierProductIdentities(
  candidates: SupplierProduct[],
  input: Pick<
    SupplierProduct,
    "ingredientId" | "supplierId" | "supplierName" | "productName"
  >,
  excludedId?: string,
) {
  return candidates.filter(
    (candidate) =>
      candidate.id !== excludedId &&
      sameSupplierProductIdentity(candidate, input),
  );
}
