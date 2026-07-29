import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database, Json } from "../../../platform/supabase/generated/database.types";
import { finishedGoodsError } from "../domain/finishedGoodsLot";
import type {
  FinishedGoodsInspectionPlan, FinishedGoodsQualityWorkspace, FinishedGoodsReleaseGenealogy,
  FinishedGoodsReleaseReadiness, FinishedGoodsReleaseResult,
} from "../domain/finishedGoodsQuality";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export class FinishedGoodsQualityRepository {
  constructor(private readonly client: Client = requiredClient()) {}

  inspectionPlan(lotId: string) {
    return this.call<FinishedGoodsInspectionPlan>("get_finished_goods_inspection_plan_v1", { target_finished_goods_lot_id: lotId });
  }
  readiness(lotId: string) {
    return this.call<FinishedGoodsReleaseReadiness>("get_finished_goods_release_readiness_v1", { target_finished_goods_lot_id: lotId });
  }
  workspace(lotId: string) {
    return this.call<FinishedGoodsQualityWorkspace>("get_finished_goods_quality_workspace_v1", { target_finished_goods_lot_id: lotId });
  }
  genealogy(releasedInventoryLotId: string) {
    return this.call<FinishedGoodsReleaseGenealogy>("get_released_finished_goods_genealogy_v1", { target_released_inventory_lot_id: releasedInventoryLotId });
  }
  recordInspection(args: Functions["record_finished_goods_inspection_v1"]["Args"]) {
    return this.call<Record<string, unknown>>("record_finished_goods_inspection_v1", args);
  }
  openDeviation(args: Functions["open_finished_goods_deviation_v1"]["Args"]) {
    return this.call<Record<string, unknown>>("open_finished_goods_deviation_v1", args);
  }
  resolveDeviation(args: Functions["resolve_finished_goods_deviation_v1"]["Args"]) {
    return this.call<Record<string, unknown>>("resolve_finished_goods_deviation_v1", args);
  }
  holdQuantity(args: Omit<Functions["record_finished_goods_disposition_v1"]["Args"], "candidate_decision">) {
    return this.disposition({ ...args, candidate_decision: "hold" });
  }
  rejectQuantity(args: Omit<Functions["record_finished_goods_disposition_v1"]["Args"], "candidate_decision">) {
    return this.disposition({ ...args, candidate_decision: "reject" });
  }
  releaseQuantity(args: Omit<Functions["record_finished_goods_disposition_v1"]["Args"], "candidate_decision">) {
    return this.disposition({ ...args, candidate_decision: "release" });
  }
  private disposition(args: Functions["record_finished_goods_disposition_v1"]["Args"]) {
    return this.call<FinishedGoodsReleaseResult>("record_finished_goods_disposition_v1", args);
  }
  private async call<T>(name: keyof Functions, args: Record<string, unknown>): Promise<T> {
    const result = await this.client.rpc(name, args as never);
    if (result.error) throw finishedGoodsError(result.error);
    if (!result.data || typeof result.data !== "object") throw new Error("Finished Goods Quality RPC returned an invalid response.");
    return result.data as unknown as T;
  }
}

export const qualityEvidence = (reference: string, description: string): Json => [
  { type: "operator_note", reference, description },
];

function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Finished Goods Quality control is not configured.");
  return supabase;
}
