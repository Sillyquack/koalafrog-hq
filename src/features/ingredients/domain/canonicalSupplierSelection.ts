import type { Supplier } from "../../procurement/domain/procurement";

export function canonicalSupplierName(
  supplier: Pick<Supplier, "legal_name" | "trading_name">,
) {
  return supplier.trading_name?.trim() || supplier.legal_name.trim();
}

export function canonicalSupplierOptionLabel(
  supplier: Pick<Supplier, "legal_name" | "trading_name">,
) {
  const legalName = supplier.legal_name.trim();
  const tradingName = supplier.trading_name?.trim();
  return tradingName && tradingName !== legalName
    ? `${tradingName} — ${legalName}`
    : tradingName || legalName;
}

export function resolveCanonicalSupplier(
  suppliers: Supplier[],
  supplierId: string,
) {
  return suppliers.find((supplier) => supplier.id === supplierId);
}

export function legacySupplierSelectionLabel(supplierName: string) {
  return `Legacy supplier name — not canonically linked: ${supplierName}`;
}
