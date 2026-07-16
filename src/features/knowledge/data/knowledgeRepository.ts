import { supabase } from "../../../platform/supabase/client";
import type { Json } from "../../../platform/supabase/generated/database.types";
import type {
  IntelligenceRunRecord,
  IntelligenceThreadRecord,
  KnowledgeReferenceRecord,
} from "../domain/knowledge";
import type {
  ScentMemoryCheckpoint,
  ScentMemorySession,
} from "../domain/scentMemory";

const client = () => {
  if (!supabase) throw new Error("Hosted workspace is unavailable.");
  return supabase;
};
const owner = async () => {
  const result = await client().auth.getUser();
  if (result.error || !result.data.user)
    throw new Error("Your authenticated session has expired.");
  return result.data.user.id;
};

export async function loadKnowledge(workspaceId: string) {
  const [threads, runs, references, sessions, checkpoints] = await Promise.all([
    client()
      .from("intelligence_threads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
    client()
      .from("intelligence_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
    client()
      .from("knowledge_references")
      .select("*")
      .eq("workspace_id", workspaceId),
    client()
      .from("scent_memory_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
    client()
      .from("scent_memory_checkpoints")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("observed_at", { ascending: false }),
  ]);
  const error =
    threads.error ??
    runs.error ??
    references.error ??
    sessions.error ??
    checkpoints.error;
  if (error) throw error;
  return {
    threads: threads.data as IntelligenceThreadRecord[],
    runs: runs.data as unknown as IntelligenceRunRecord[],
    references: references.data as KnowledgeReferenceRecord[],
    sessions: sessions.data as unknown as ScentMemorySession[],
    checkpoints: checkpoints.data as unknown as ScentMemoryCheckpoint[],
  };
}

export async function saveKnowledgeReference(input: {
  workspaceId: string;
  threadId: string;
  current?: KnowledgeReferenceRecord;
  title?: string;
  userNote?: string;
  tags?: string[];
  isPinned?: boolean;
  archived?: boolean;
}) {
  const ownerId = await owner();
  const values = {
    title: input.title?.trim() || null,
    user_note: input.userNote?.trim() || null,
    tags: [...new Set(input.tags ?? [])].map((tag) => tag.trim()).filter(Boolean),
    is_pinned: input.isPinned ?? false,
    archived_at: input.archived ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (!input.current) {
    const result = await client()
      .from("knowledge_references")
      .insert({
        workspace_id: input.workspaceId,
        owner_user_id: ownerId,
        source_type: "intelligence_thread",
        source_intelligence_thread_id: input.threadId,
        ...values,
      })
      .select()
      .single();
    if (result.error) throw result.error;
    return result.data as KnowledgeReferenceRecord;
  }
  const result = await client()
    .from("knowledge_references")
    .update({ ...values, revision: input.current.revision + 1 })
    .eq("id", input.current.id)
    .eq("revision", input.current.revision)
    .select()
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("This Knowledge reference changed. Reload and retry.");
  return result.data as KnowledgeReferenceRecord;
}

export async function createScentMemorySession(input: {
  workspaceId: string;
  title: string;
  productId?: string;
  formulaVersionId?: string;
  labBatchId?: string;
  ingredientId?: string;
  testSessionId?: string;
  developmentExperimentId?: string;
  developmentExperimentVariantId?: string;
}) {
  const ownerId = await owner();
  const result = await client()
    .from("scent_memory_sessions")
    .insert({
      workspace_id: input.workspaceId,
      owner_user_id: ownerId,
      title: input.title.trim(),
      product_id: input.productId || null,
      formula_version_id: input.formulaVersionId || null,
      lab_batch_id: input.labBatchId || null,
      ingredient_id: input.ingredientId || null,
      test_session_id: input.testSessionId || null,
      development_experiment_id: input.developmentExperimentId || null,
      development_experiment_variant_id: input.developmentExperimentVariantId || null,
    })
    .select()
    .single();
  if (result.error) throw result.error;
  return result.data as unknown as ScentMemorySession;
}

export async function saveScentMemorySession(
  session: ScentMemorySession,
  values: Record<string, unknown>,
) {
  const result = await client()
    .from("scent_memory_sessions")
    .update({
      ...values,
      revision: session.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("revision", session.revision)
    .select()
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("This Scent Memory changed. Reload and retry.");
  return result.data as unknown as ScentMemorySession;
}

export async function recordScentMemoryCheckpoint(input: {
  sessionId: string;
  correctionOf?: string;
  checkpoint: Record<string, unknown>;
}) {
  const result = await client().rpc("record_scent_memory_checkpoint", {
    target_session_id: input.sessionId,
    checkpoint: input.checkpoint as Json,
    correction_of: input.correctionOf ?? undefined,
  });
  if (result.error) throw result.error;
  return result.data as string;
}
