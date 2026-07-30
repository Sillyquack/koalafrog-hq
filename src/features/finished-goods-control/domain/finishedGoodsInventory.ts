import type { Json } from "../../../platform/supabase/generated/database.types";

export type FinishedGoodsInventoryOperationType =
  | "internal_transfer" | "hold" | "release_hold" | "block" | "unblock"
  | "damage_pending" | "damage_writeoff" | "loss_writeoff"
  | "destruction_writeoff" | "controlled_negative_adjustment"
  | "controlled_positive_correction";

export interface FinishedGoodsInventorySnapshot {
  policyVersion: string;
  revision: number;
  lot: { id: string; finished_goods_lot_id: string; consumer_batch_code: string; internal_lot_code: string; product_id: string;
    quantity_released: number; unit: string; location: string; manufacturing_date: string; expiry_date: string;
    unit_cost: number | null; currency: string | null; cost_confidence: string };
  onHandQuantity: number; availableQuantity: number; reservedQuantity: number; heldQuantity: number;
  blockedQuantity: number; damagedQuantity: number; lostQuantity: number; destroyedQuantity: number;
  expiryState: "eligible" | "expiring_soon" | "expired"; eligible: boolean;
  blockers: { code: string; message: string }[];
  locations: { location: string; quantity: number }[];
  valuation: { quantity: number; unitCost: number | null; totalCost: number | null; currency: string | null;
    confidence: string; state: "unknown" | "provisional" | "final" };
  reservationBoundary: { implemented: false; reservedQuantity: 0; downstreamReady: boolean };
}

export interface FinishedGoodsInventoryWorkspace {
  snapshot: FinishedGoodsInventorySnapshot;
  movements: Record<string, unknown>[]; stateHistory: Record<string, unknown>[];
  operations: Record<string, unknown>[]; events: Record<string, unknown>[]; genealogy: Record<string, unknown>;
}

export interface FinishedGoodsInventoryCommand {
  lotId: string; revision: number; type: FinishedGoodsInventoryOperationType; quantity: number; unit: string;
  fromLocation?: string; toLocation?: string; reason: string; evidence: Json; relatedRecordId?: string;
}
