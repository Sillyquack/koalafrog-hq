import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database } from "../../../platform/supabase/generated/database.types";
import {
  productionOutputError,
  type ProductionOutputCompletionReadiness,
  type ProductionOutputGenealogy,
  type ProductionOutputSnapshot,
} from "../domain/productionOutput";

type Client = SupabaseClient<Database>;

export class ProductionOutputRepository {
  constructor(private readonly client: Client = requiredClient()) {}

  async load(productionRunId: string): Promise<ProductionOutputSnapshot> {
    const outputResult = await this.client.from("production_outputs").select("*")
      .eq("production_run_id", productionRunId).order("output_sequence");
    if (outputResult.error) throw productionOutputError(outputResult.error);
    const outputIds = (outputResult.data ?? []).map((output) => output.id);
    const [run, measurements, components, reconciliations, events, readiness] = await Promise.all([
      this.client.from("production_runs").select("revision,output_stage_status,output_stage_completed_at").eq("id", productionRunId).single(),
      outputIds.length
        ? this.client.from("production_output_measurements").select("*").in("production_output_id", outputIds).order("measurement_version")
        : emptyResult(),
      outputIds.length
        ? this.client.from("production_output_components").select("*").in("production_output_id", outputIds).order("recorded_at")
        : emptyResult(),
      outputIds.length
        ? this.client.from("production_output_reconciliations").select("*").in("production_output_id", outputIds).order("reconciliation_version")
        : emptyResult(),
      this.client.from("production_output_events").select("*").eq("production_run_id", productionRunId).order("occurred_at"),
      this.completionReadiness(productionRunId),
    ]);
    const failed = [run, measurements, components, reconciliations, events].find((result) => result.error);
    if (failed?.error) throw productionOutputError(failed.error);
    return {
      batchRevision: Number(run.data?.revision ?? 0),
      outputStageStatus: run.data?.output_stage_status ?? "not_started",
      outputStageCompletedAt: run.data?.output_stage_completed_at ?? undefined,
      outputs: outputResult.data ?? [],
      measurements: measurements.data ?? [],
      components: components.data ?? [],
      reconciliations: reconciliations.data ?? [],
      events: events.data ?? [],
      readiness,
    };
  }

  create(args: Database["public"]["Functions"]["create_production_output_v1"]["Args"]) {
    return response(this.client.rpc("create_production_output_v1", args));
  }
  measure(args: Database["public"]["Functions"]["record_production_output_measurement_v1"]["Args"]) {
    return response(this.client.rpc("record_production_output_measurement_v1", args));
  }
  component(args: Database["public"]["Functions"]["record_production_output_component_v1"]["Args"]) {
    return response(this.client.rpc("record_production_output_component_v1", args));
  }
  reconcile(args: Database["public"]["Functions"]["reconcile_production_output_v1"]["Args"]) {
    return response(this.client.rpc("reconcile_production_output_v1", args));
  }
  complete(args: Database["public"]["Functions"]["complete_production_output_stage_v1"]["Args"]) {
    return response(this.client.rpc("complete_production_output_stage_v1", args));
  }
  async completionReadiness(productionRunId: string): Promise<ProductionOutputCompletionReadiness> {
    const result = await this.client.rpc("get_production_output_completion_readiness_v1", {
      target_production_run_id: productionRunId,
    });
    if (result.error) throw productionOutputError(result.error);
    return mapReadiness(result.data);
  }
  async genealogy(productionOutputId: string): Promise<ProductionOutputGenealogy> {
    const result = await this.client.rpc("get_production_output_genealogy_v1", {
      target_production_output_id: productionOutputId,
    });
    if (result.error) throw productionOutputError(result.error);
    return result.data as unknown as ProductionOutputGenealogy;
  }
}

function emptyResult() {
  return Promise.resolve({ data: [], error: null });
}
async function response(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const result = await request;
  if (result.error) throw productionOutputError(result.error);
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data))
    throw new Error("Production Output RPC returned an invalid response.");
  return result.data as Record<string, unknown>;
}
function mapReadiness(value: unknown): ProductionOutputCompletionReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid output readiness response.");
  const row = value as Record<string, unknown>;
  const outputs = Array.isArray(row.outputs) ? row.outputs : [];
  const blockers = Array.isArray(row.blockers) ? row.blockers : [];
  return {
    productionBatchId: String(row.productionBatchId),
    policyVersion: String(row.policyVersion),
    state: String(row.state) as ProductionOutputCompletionReadiness["state"],
    readyForCompletion: row.readyForCompletion === true,
    completed: row.completed === true,
    evaluatedAt: String(row.evaluatedAt),
    outputRecordCount: Number(row.outputRecordCount),
    activeOutputRecords: Number(row.activeOutputRecords),
    incompleteOutputRecords: Number(row.incompleteOutputRecords),
    outputs: outputs.map((item) => {
      const output = item as Record<string, unknown>;
      return {
        productionOutputId: String(output.productionOutputId),
        outputCode: String(output.outputCode),
        status: String(output.status),
        theoreticalQuantity: Number(output.theoreticalQuantity),
        theoreticalUnit: String(output.theoreticalUnit),
        actualQuantity: output.actualQuantity == null ? undefined : Number(output.actualQuantity),
        actualUnit: output.actualUnit == null ? undefined : String(output.actualUnit),
        retainedQuantity: Number(output.retainedQuantity),
        wasteQuantity: Number(output.wasteQuantity),
        transferredQuantity: Number(output.transferredQuantity),
        unexplainedVariance: Number(output.unexplainedVariance),
        yieldPercentage: output.yieldPercentage == null ? undefined : Number(output.yieldPercentage),
      };
    }),
    blockers: blockers.map((item) => {
      const blocker = item as Record<string, unknown>;
      return {
        blockerCode: String(blocker.blockerCode),
        category: String(blocker.category),
        severity: String(blocker.severity),
        blocksCompletion: blocker.blocksCompletion === true,
        productionOutputId: blocker.productionOutputId == null ? undefined : String(blocker.productionOutputId),
        quantity: blocker.quantity == null ? undefined : Number(blocker.quantity),
        unit: blocker.unit == null ? undefined : String(blocker.unit),
        humanMessage: String(blocker.humanMessage),
        recommendedAction: String(blocker.recommendedAction),
        metadata: typeof blocker.metadata === "object" && blocker.metadata ? blocker.metadata as Record<string, unknown> : {},
      };
    }),
  };
}
function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Production Output is not configured.");
  return supabase;
}
