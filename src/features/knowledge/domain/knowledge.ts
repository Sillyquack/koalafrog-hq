import type { IntelligenceResponse } from "../../intelligence/domain/intelligenceContract";

export interface IntelligenceThreadRecord {
  id: string;
  mode: string;
  title: string;
  created_at: string;
  updated_at: string;
}
export interface IntelligenceRunRecord {
  id: string;
  thread_id: string;
  user_prompt: string;
  context_selection: Record<string, unknown>;
  context_manifest: Record<string, unknown>;
  response_payload: IntelligenceResponse | null;
  status: string;
  error_code: string | null;
  prompt_version: string;
  response_schema_version: number | null;
  context_version: number;
  provider_name: string | null;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  estimated_cost_usd: number | null;
  pricing_snapshot_version: string | null;
  created_at: string;
  completed_at: string | null;
}
export interface KnowledgeReferenceRecord {
  id: string;
  source_intelligence_thread_id: string;
  title: string | null;
  user_note: string | null;
  tags: string[];
  is_pinned: boolean;
  archived_at: string | null;
  revision: number;
  updated_at: string;
}
export interface LibraryThread {
  thread: IntelligenceThreadRecord;
  runs: IntelligenceRunRecord[];
  reference?: KnowledgeReferenceRecord;
  displayTitle: string;
  latestRun?: IntelligenceRunRecord;
  completedRuns: number;
  totalTokens?: number;
  estimatedCost?: number;
}

export function buildIntelligenceLibrary(
  threads: IntelligenceThreadRecord[],
  runs: IntelligenceRunRecord[],
  references: KnowledgeReferenceRecord[],
) {
  return threads.map((thread): LibraryThread => {
    const threadRuns = runs
      .filter((run) => run.thread_id === thread.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const reference = references.find(
      (item) => item.source_intelligence_thread_id === thread.id,
    );
    const completed = threadRuns.filter((run) => run.status === "completed");
    const eligibleCosts = completed
      .map((run) => run.estimated_cost_usd)
      .filter((value): value is number => value != null);
    const tokens = completed
      .map((run) => run.total_tokens)
      .filter((value): value is number => value != null);
    return {
      thread,
      runs: threadRuns,
      reference,
      displayTitle: reference?.title?.trim() || thread.title,
      latestRun: threadRuns.at(-1),
      completedRuns: completed.length,
      totalTokens: tokens.length
        ? tokens.reduce((sum, value) => sum + value, 0)
        : undefined,
      estimatedCost: eligibleCosts.length
        ? eligibleCosts.reduce((sum, value) => sum + value, 0)
        : undefined,
    };
  });
}

export function filterLibrary(
  items: LibraryThread[],
  options: {
    search?: string;
    status?: string;
    pinnedOnly?: boolean;
    includeArchived?: boolean;
    productId?: string;
    formulaVersionId?: string;
    material?: string;
    materialIds?: string[];
    dateFrom?: string;
    sort?: "newest" | "oldest";
  },
) {
  const search = options.search?.trim().toLowerCase();
  return items
    .filter((item) => options.includeArchived || !item.reference?.archived_at)
    .filter((item) => !options.pinnedOnly || item.reference?.is_pinned)
    .filter(
      (item) =>
        options.status
          ? item.runs.some(
              (run) =>
                run.status === options.status || run.error_code === options.status,
            )
          : item.completedRuns > 0,
    )
    .filter((item) =>
      !options.productId
        ? true
        : item.runs.some(
            (run) => run.context_selection.productId === options.productId,
          ),
    )
    .filter((item) =>
      !options.formulaVersionId
        ? true
        : item.runs.some(
            (run) =>
              run.context_selection.formulaVersionId === options.formulaVersionId,
          ),
    )
    .filter((item) => {
      if (!options.material?.trim()) return true;
      const material = options.material.trim().toLowerCase();
      return item.runs.some(
        (run) =>
          ((run.context_selection.conceptMaterials as string[] | undefined) ?? [])
            .join(" ")
            .toLowerCase()
            .includes(material) ||
          ((run.context_selection.selectedIngredientIds as string[] | undefined) ?? []).some(
            (id) => options.materialIds?.includes(id),
          ),
      );
    })
    .filter(
      (item) =>
        !options.dateFrom ||
        item.runs.some((run) => run.created_at.slice(0, 10) >= options.dateFrom!),
    )
    .filter((item) => {
      if (!search) return true;
      return [
        item.displayTitle,
        item.reference?.user_note,
        item.reference?.tags.join(" "),
        ...item.runs.map((run) => run.user_prompt),
        ...item.runs.map((run) =>
          ((run.context_selection.conceptMaterials as string[] | undefined) ?? []).join(" "),
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => {
      const direction = options.sort === "oldest" ? 1 : -1;
      return direction * (a.latestRun?.created_at ?? a.thread.updated_at).localeCompare(b.latestRun?.created_at ?? b.thread.updated_at);
    });
}

export function intelligenceUsageSummary(items: LibraryThread[]) {
  const completedRuns = items.reduce((sum, item) => sum + item.completedRuns, 0);
  const totalTokens = items.reduce(
    (sum, item) => sum + (item.totalTokens ?? 0),
    0,
  );
  const costs = items
    .flatMap((item) => item.runs)
    .filter((run) => run.status === "completed")
    .map((run) => run.estimated_cost_usd)
    .filter((value): value is number => value != null);
  const estimatedTotalCost = costs.length
    ? costs.reduce((sum, value) => sum + value, 0)
    : undefined;
  return {
    completedRuns,
    totalTokens,
    estimatedTotalCost,
    averageEstimatedCost:
      estimatedTotalCost != null && costs.length
        ? estimatedTotalCost / costs.length
        : undefined,
  };
}
