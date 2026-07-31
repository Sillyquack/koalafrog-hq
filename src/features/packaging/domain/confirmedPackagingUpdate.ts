import type { OwnerOperationReceipt } from "../../../platform/operations/ownerOperationReceipt";
import type { PackagingComponent } from "../../../types/domain";

const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const receiptValue = (value: unknown) =>
  value == null
    ? null
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

export function confirmedPackagingUpdateReceipt(
  workspaceId: string,
  before: PackagingComponent,
  requested: Partial<PackagingComponent>,
  persisted: PackagingComponent | undefined,
): OwnerOperationReceipt {
  if (!persisted || persisted.id !== before.id)
    throw new Error(
      "Packaging Component owner readback did not return the updated stable ID.",
    );
  for (const [field, value] of Object.entries(requested)) {
    if (
      !equal(
        (persisted as unknown as Record<string, unknown>)[field],
        value,
      )
    )
      throw new Error(
        `Packaging Component readback did not confirm ${field}. Refresh and retry.`,
      );
  }
  if (
    !("ownershipState" in requested) &&
    persisted.ownershipState !== before.ownershipState
  )
    throw new Error(
      "Packaging Component ownership changed outside the approved update.",
    );
  if (
    !("stockState" in requested) &&
    persisted.stockState !== before.stockState
  )
    throw new Error(
      "Packaging Component stock state changed outside the approved update.",
    );

  return {
    schemaVersion: 1,
    entityType: "packaging_component",
    recordId: persisted.id,
    workspaceId,
    operation: "updated",
    persistedAt: persisted.updatedAt,
    naturalIdentity: {
      name: persisted.name,
      category: persisted.category,
    },
    changedFields: Object.keys(requested)
      .filter((field) =>
        !equal(
          (before as unknown as Record<string, unknown>)[field],
          (persisted as unknown as Record<string, unknown>)[field],
        ),
      )
      .map((field) => ({
        field,
        before: receiptValue(
          (before as unknown as Record<string, unknown>)[field],
        ),
        after: receiptValue(
          (persisted as unknown as Record<string, unknown>)[field],
        ),
      })),
  };
}
