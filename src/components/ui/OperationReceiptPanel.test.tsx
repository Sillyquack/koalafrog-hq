import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperationReceiptPanel } from "./OperationReceiptPanel";

const receipt = {
  schemaVersion: 1 as const,
  entityType: "procurement_requested_item" as const,
  recordId: "child-id-that-must-wrap",
  workspaceId: "workspace-id-that-must-wrap",
  operation: "created" as const,
  persistedAt: "2026-07-31T05:00:00.000Z",
  naturalIdentity: { name: "Jojoba oil", category: "raw_material" },
  parent: {
    entityType: "procurement_request" as const,
    recordId: "parent-request-id",
  },
};

describe("OperationReceiptPanel", () => {
  it("renders explicit persistence evidence and accessible actions", () => {
    const html = renderToStaticMarkup(
      <OperationReceiptPanel result={{ state: "confirmed", receipt }} />,
    );
    expect(html).toContain("CREATE confirmed");
    expect(html).toContain(receipt.recordId);
    expect(html).toContain(receipt.workspaceId);
    expect(html).toContain(receipt.parent.recordId);
    expect(html).toContain("Copy ID");
    expect(html).toContain("Copy receipt JSON");
    expect(html).toContain("Download receipt JSON");
    expect(html).toContain('data-testid="operation-receipt"');
  });

  it("shows duplicate and ambiguity states without a fabricated success", () => {
    const duplicate = renderToStaticMarkup(
      <OperationReceiptPanel
        result={{
          state: "rejected_duplicate",
          entityType: "equipment",
          existingId: "existing-id",
          message: "Duplicate rejected.",
        }}
      />,
    );
    const ambiguous = renderToStaticMarkup(
      <OperationReceiptPanel
        result={{
          state: "ambiguous_conflict",
          entityType: "supplier_product",
          candidateIds: ["candidate-a", "candidate-b"],
          message: "Identity is ambiguous.",
        }}
      />,
    );
    expect(duplicate).toContain("Duplicate rejected.");
    expect(duplicate).not.toContain("confirmed for");
    expect(ambiguous).toContain("candidate-a");
    expect(ambiguous).not.toContain("confirmed for");
  });
});
