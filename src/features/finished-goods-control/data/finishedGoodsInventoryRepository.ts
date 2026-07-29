import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database, Json } from "../../../platform/supabase/generated/database.types";
import { finishedGoodsError } from "../domain/finishedGoodsLot";
import type { FinishedGoodsInventoryCommand, FinishedGoodsInventoryWorkspace } from "../domain/finishedGoodsInventory";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export class FinishedGoodsInventoryRepository {
  constructor(private readonly client: Client = requiredClient()) {}
  workspace(lotId: string) {
    return this.call<FinishedGoodsInventoryWorkspace>("get_finished_goods_inventory_workspace_v1", { target_released_inventory_lot_id: lotId });
  }
  fefo(productId?: string) {
    return this.call<FinishedGoodsInventoryWorkspace["snapshot"][]>("list_finished_goods_inventory_fefo_v1", { target_product_id: productId });
  }
  operate(command: FinishedGoodsInventoryCommand) {
    const args: Functions["record_finished_goods_inventory_operation_v1"]["Args"] = {
      target_released_inventory_lot_id: command.lotId, expected_inventory_revision: command.revision,
      candidate_operation_type: command.type, candidate_quantity: command.quantity, candidate_unit: command.unit,
      candidate_from_location: command.fromLocation ?? null as never, candidate_to_location: command.toLocation ?? null as never,
      candidate_reason: command.reason, candidate_evidence: command.evidence,
      candidate_related_record_id: command.relatedRecordId ?? null as never, candidate_occurred_at: new Date().toISOString(),
      candidate_idempotency_key: crypto.randomUUID(),
    };
    return this.call<{ workspace: FinishedGoodsInventoryWorkspace; retry: boolean }>("record_finished_goods_inventory_operation_v1", args);
  }
  private async call<T>(name: keyof Functions, args: Record<string, unknown>): Promise<T> {
    const rpc = this.client.rpc as unknown as (functionName: string, functionArgs: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    const result = await rpc.call(this.client, name, args);
    if (result.error) throw finishedGoodsError(result.error);
    if (!result.data || typeof result.data !== "object") throw new Error("Finished Goods Inventory RPC returned an invalid response.");
    return result.data as unknown as T;
  }
}

export const inventoryEvidence = (reference: string, description: string): Json => [{ type: "operator_note", reference, description }];
function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Finished Goods Inventory control is not configured.");
  return supabase;
}
