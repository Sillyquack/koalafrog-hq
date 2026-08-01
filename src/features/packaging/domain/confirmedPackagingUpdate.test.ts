import { describe, expect, it } from "vitest";
import type { PackagingComponent } from "../../../types/domain";
import { confirmedPackagingUpdateReceipt } from "./confirmedPackagingUpdate";

const before: PackagingComponent = {
  id: "component-id",
  name: "Amber bottle",
  category: "bottle",
  defaultUnit: "pcs",
  status: "selected",
  notes: "Before",
  ownershipState: "not_owned",
  stockState: "none",
  createdAt: "2026-07-30T10:00:00.000Z",
  updatedAt: "2026-07-30T10:00:00.000Z",
};

describe("confirmed Packaging Component updates", () => {
  it("returns a stable UPDATE receipt only for a matching persisted fingerprint", () => {
    const persisted = {
      ...before,
      notes: "Confirmed planning note",
      updatedAt: "2026-07-31T10:00:00.000Z",
    };
    expect(
      confirmedPackagingUpdateReceipt(
        "workspace-id",
        before,
        { notes: "Confirmed planning note" },
        persisted,
      ),
    ).toEqual({
      schemaVersion: 1,
      entityType: "packaging_component",
      recordId: before.id,
      workspaceId: "workspace-id",
      operation: "updated",
      persistedAt: persisted.updatedAt,
      naturalIdentity: { name: before.name, category: before.category },
      changedFields: [
        {
          field: "notes",
          before: "Before",
          after: "Confirmed planning note",
        },
      ],
    });
  });

  it("returns no receipt when readback is absent or does not match", () => {
    expect(() =>
      confirmedPackagingUpdateReceipt("workspace-id", before, { notes: "New" }, undefined),
    ).toThrow(/stable ID/);
    expect(() =>
      confirmedPackagingUpdateReceipt(
        "workspace-id",
        before,
        { notes: "New" },
        { ...before, notes: "Different" },
      ),
    ).toThrow(/did not confirm notes/);
  });

  it("keeps ownership and stock unchanged unless explicitly requested", () => {
    expect(() =>
      confirmedPackagingUpdateReceipt(
        "workspace-id",
        before,
        { notes: "New" },
        { ...before, notes: "New", ownershipState: "owned" },
      ),
    ).toThrow(/ownership changed/);
    expect(() =>
      confirmedPackagingUpdateReceipt(
        "workspace-id",
        before,
        { notes: "New" },
        { ...before, notes: "New", stockState: "available" },
      ),
    ).toThrow(/stock state changed/);
  });
});
