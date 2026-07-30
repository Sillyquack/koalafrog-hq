import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database } from "../../../platform/supabase/generated/database.types";
import type { BackwardGenealogy, ForwardTrace, TraceabilityIntegrityResult, TraceabilityReadiness, TraceabilitySearchResult, TraceabilitySnapshot } from "../domain/traceability";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export class TraceabilityRepository {
  constructor(private readonly client: Client = requiredClient()) {}
  search(query: string) { return this.call<TraceabilitySearchResult[]>("search_finished_goods_traceability_v1", { candidate_query: query, candidate_limit: 25 }); }
  backward(finishedGoodsLotId?: string, releasedInventoryLotId?: string) {
    return this.call<BackwardGenealogy>("get_finished_goods_backward_genealogy_v1", {
      target_finished_goods_lot_id: finishedGoodsLotId ?? null, target_released_inventory_lot_id: releasedInventoryLotId ?? null,
    });
  }
  rawMaterialForward(lotId: string) { return this.call<ForwardTrace>("get_raw_material_lot_forward_trace_v1", { target_inventory_lot_id: lotId }); }
  packagingForward(lotId: string) { return this.call<ForwardTrace>("get_packaging_lot_forward_trace_v1", { target_packaging_inventory_lot_id: lotId }); }
  productionBatch(batchId: string) { return this.call<Record<string, unknown>>("get_production_batch_trace_v1", { target_production_batch_id: batchId }); }
  packagingRun(runId: string) { return this.call<Record<string, unknown>>("get_packaging_run_trace_v1", { target_packaging_run_id: runId }); }
  readiness(finishedGoodsLotId?: string, releasedInventoryLotId?: string) {
    return this.call<TraceabilityReadiness>("get_traceability_readiness_v1", { target_finished_goods_lot_id: finishedGoodsLotId ?? null, target_released_inventory_lot_id: releasedInventoryLotId ?? null });
  }
  integrity(finishedGoodsLotId?: string, releasedInventoryLotId?: string) {
    return this.call<TraceabilityIntegrityResult>("get_traceability_integrity_v1", { target_finished_goods_lot_id: finishedGoodsLotId ?? null, target_released_inventory_lot_id: releasedInventoryLotId ?? null });
  }
  snapshot(trace: BackwardGenealogy): TraceabilitySnapshot {
    return { root: trace.root, evaluatedAt: trace.evaluatedAt, policyVersion: trace.policyVersion, nodes: trace.nodes, edges: trace.edges,
      affectedQuantities: trace.quantityAttribution, currentStates: trace.releasedInventory, missingLinks: trace.missingLinks,
      confidence: trace.confidence, queryParameters: { direction: "backward", rootId: trace.root.immutableId }, fingerprint: trace.fingerprint };
  }
  private async call<T>(name: keyof Functions, args: Record<string, unknown>): Promise<T> {
    const rpc = this.client.rpc as unknown as (functionName: string, functionArgs: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    const result = await rpc.call(this.client, name, args);
    if (result.error) throw normalizeTraceabilityError(result.error.message);
    if (!result.data || typeof result.data !== "object") throw new Error("Traceability RPC returned an invalid response.");
    return result.data as T;
  }
}

function normalizeTraceabilityError(message: string) {
  const known = ["AUTHENTICATION_REQUIRED","TRACEABILITY_ROOT_NOT_FOUND","AMBIGUOUS_TRACEABILITY_ROOT","TRACEABILITY_QUERY_TOO_SHORT","UNSUPPORTED_TRACEABILITY_ROOT"];
  return new Error(known.find(code => message.includes(code)) ?? `TRACEABILITY_SERVER_ERROR: ${message}`);
}
function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Traceability is not configured.");
  return supabase;
}
