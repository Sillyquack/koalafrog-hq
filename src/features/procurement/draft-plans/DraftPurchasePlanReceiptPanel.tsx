import { Copy, Download } from "lucide-react";
import { useState } from "react";
import type { DraftPurchasePlanReceiptBundle } from "../domain/procurement";

const download = (name: string, content: string) => {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function DraftPurchasePlanReceiptPanel({
  receipt,
}: {
  receipt: DraftPurchasePlanReceiptBundle;
}) {
  const [message, setMessage] = useState("");
  const json = JSON.stringify(receipt, null, 2);
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}. Select it manually.`);
    }
  };

  return (
    <section
      className="panel draft-plan-receipt"
      aria-labelledby="draft-plan-receipt-title"
      data-testid="draft-plan-receipt"
    >
      <span className="eyebrow">Confirmed atomic persistence</span>
      <h2 id="draft-plan-receipt-title">Draft Purchase Plan receipt bundle</h2>
      <p>
        {receipt.operation === "created" ? "CREATE" : "REUSE"} confirmed.
        The plan is Draft, unplaced, and not authorised for ordering.
      </p>
      <dl>
        <div>
          <dt>Plan ID</dt>
          <dd className="receipt-id">{receipt.plan.recordId}</dd>
        </div>
        <div>
          <dt>Workspace reference</dt>
          <dd className="receipt-id">{receipt.plan.workspaceId}</dd>
        </div>
        <div>
          <dt>Logical operations</dt>
          <dd>
            1 plan {receipt.plan.operation.toUpperCase()} · {receipt.baskets.length}{" "}
            basket {receipt.baskets.length === 1 ? "operation" : "operations"}
          </dd>
        </div>
        <div>
          <dt>Dependent line snapshots</dt>
          <dd>{receipt.lines.length} stable IDs</dd>
        </div>
      </dl>
      <div className="draft-plan-receipt-groups">
        <div>
          <h3>Basket receipts</h3>
          <ol>
            {receipt.baskets.map((basket) => (
              <li key={basket.recordId}>
                <strong>{basket.operation.toUpperCase()}</strong>{" "}
                {basket.currency} · {basket.supplierId}
                <span className="receipt-id">{basket.recordId}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3>Line evidence</h3>
          <ol>
            {receipt.lines.map((line) => (
              <li key={line.recordId}>
                {line.sourceKind.replaceAll("_", " ")} · {line.purchaseQuantity} ×{" "}
                {line.packageQuantity} {line.packageUnit}
                <span className="receipt-id">{line.recordId}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="action-row">
        <button
          className="button ghost"
          type="button"
          onClick={() => void copy(receipt.plan.recordId, "Plan ID")}
        >
          <Copy size={14} /> Copy plan ID
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => void copy(json, "Receipt bundle JSON")}
        >
          <Copy size={14} /> Copy receipt bundle
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() =>
            download(`koalafrog-draft-plan-${receipt.plan.recordId}.json`, json)
          }
        >
          <Download size={14} /> Download receipt bundle
        </button>
      </div>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
