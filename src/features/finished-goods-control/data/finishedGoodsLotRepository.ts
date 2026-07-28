import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database } from "../../../platform/supabase/generated/database.types";
import { finishedGoodsError, type FinishedGoodsLot, type FinishedGoodsLotDetail, type FinishedGoodsReadiness } from "../domain/finishedGoodsLot";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export class FinishedGoodsLotRepository {
  constructor(private readonly client: Client = requiredClient()) {}

  async readiness(packagingRunId: string): Promise<FinishedGoodsReadiness> {
    const result = await this.client.rpc("get_packaging_run_finished_goods_readiness_v1", { target_packaging_run_id: packagingRunId });
    if (result.error) throw finishedGoodsError(result.error);
    const value = result.data as Record<string, unknown>;
    return {
      packagingRunId: String(value.packagingRunId), productionOutputId: String(value.productionOutputId),
      policyVersion: String(value.policyVersion), state: String(value.state) as FinishedGoodsReadiness["state"],
      packagingRunCompleted: value.packagingRunCompleted === true, readyForLotCreation: value.readyForLotCreation === true,
      conversionCompleted: value.conversionCompleted === true, totalPackagedQuantity: Number(value.totalPackagedQuantity),
      acceptedQuantity: Number(value.acceptedQuantity), rejectedQuantity: Number(value.rejectedQuantity),
      damagedQuantity: Number(value.damagedQuantity), sampleQuantity: Number(value.sampleQuantity),
      retentionQuantity: Number(value.retentionQuantity), unresolvedVariance: Number(value.unresolvedVariance),
      convertedQuantity: Number(value.convertedQuantity), remainingAcceptedQuantity: Number(value.remainingAcceptedQuantity),
      unit: String(value.unit), finishedGoodsLotCount: Number(value.finishedGoodsLotCount), costState: String(value.costState) as "complete" | "provisional",
      reconciliation: value.reconciliation && typeof value.reconciliation === "object" ? value.reconciliation as Record<string, unknown> : undefined,
      blockers: Array.isArray(value.blockers) ? value.blockers.map((item) => {
        const blocker = item as Record<string, unknown>;
        return { blockerCode: String(blocker.blockerCode), category: String(blocker.category), severity: String(blocker.severity),
          blocksLotCreation: blocker.blocksLotCreation === true, humanMessage: String(blocker.humanMessage), recommendedAction: String(blocker.recommendedAction) };
      }) : [],
    };
  }

  async lotsByRun(packagingRunId: string): Promise<FinishedGoodsLot[]> {
    const result = await this.client.from("finished_goods_lots").select("*").eq("packaging_run_id", packagingRunId).order("lot_sequence");
    if (result.error) throw finishedGoodsError(result.error);
    return (result.data ?? []) as unknown as FinishedGoodsLot[];
  }

  async load(lotId: string): Promise<FinishedGoodsLotDetail> {
    const [lot, quarantine, events, genealogy] = await Promise.all([
      this.client.from("finished_goods_lots").select("*").eq("id", lotId).single(),
      this.client.from("finished_goods_quarantines").select("*").eq("finished_goods_lot_id", lotId).single(),
      this.client.from("finished_goods_lot_events").select("*").eq("finished_goods_lot_id", lotId).order("occurred_at"),
      this.genealogy(lotId),
    ]);
    const failed = [lot, quarantine, events].find((result) => result.error);
    if (failed?.error) throw finishedGoodsError(failed.error);
    return { lot: lot.data as unknown as FinishedGoodsLot, quarantine: quarantine.data as Record<string, unknown>,
      events: events.data ?? [], genealogy };
  }

  recordReconciliation(args: Functions["record_packaged_output_reconciliation_v1"]["Args"]) {
    return rpc(this.client.rpc("record_packaged_output_reconciliation_v1", args));
  }
  createLot(args: Omit<Functions["create_finished_goods_lot_v1"]["Args"],
    "candidate_shelf_life_duration"|"candidate_shelf_life_unit"|"candidate_expiry_override"|"candidate_pao_value"|"candidate_pao_unit"> & {
      candidate_shelf_life_duration: number | null;
      candidate_shelf_life_unit: string | null;
      candidate_expiry_override: string | null;
      candidate_pao_value: number | null;
      candidate_pao_unit: string | null;
    }) {
    return rpc(this.client.rpc("create_finished_goods_lot_v1", args as unknown as Functions["create_finished_goods_lot_v1"]["Args"]));
  }
  genealogy(lotId: string) {
    return rpc(this.client.rpc("get_finished_goods_lot_genealogy_v1", { target_finished_goods_lot_id: lotId }));
  }
}

async function rpc(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const result = await request;
  if (result.error) throw finishedGoodsError(result.error);
  if (!result.data || typeof result.data !== "object") throw new Error("Finished Goods RPC returned an invalid response.");
  return result.data as Record<string, unknown>;
}
function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Finished Goods Lot control is not configured.");
  return supabase;
}
