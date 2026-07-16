/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";
import {
  classifyProviderFailure,
  sanitizeProviderDiagnostic,
  type ProviderFailureCategory,
} from "../_shared/providerDiagnostics.ts";
import { assertOpenAIStructuredOutputSchema } from "../_shared/structuredOutputSchema.ts";
import { validateIntelligenceProviderResponse } from "../_shared/intelligenceResponseValidation.ts";
import { createValidationDiagnostic } from "../_shared/validationDiagnostics.ts";
import {
  normalizeOpenAIUsage,
  type NormalizedProviderUsage,
} from "../_shared/intelligenceUsage.ts";
import { relevantScentMemorySessions } from "../_shared/scentMemoryContext.ts";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
type Selection = {
  productId?: string;
  formulaVersionId?: string;
  selectedIngredientIds: string[];
  conceptMaterials: string[];
};
type RequestBody = {
  schemaVersion: 1;
  mode: "scent_exploration";
  workspaceId: string;
  threadId?: string;
  userPrompt: string;
  contextSelection: Selection;
};
const validRequest = (v: unknown): v is RequestBody => {
  const x = v as RequestBody;
  return (
    !!x &&
    x.schemaVersion === 1 &&
    x.mode === "scent_exploration" &&
    typeof x.workspaceId === "string" &&
    typeof x.userPrompt === "string" &&
    x.userPrompt.trim().length > 0 &&
    Array.isArray(x.contextSelection?.selectedIngredientIds) &&
    Array.isArray(x.contextSelection?.conceptMaterials)
  );
};
const axes = [
  "fresh",
  "woody",
  "spicy",
  "dark",
  "sweet",
  "dry",
  "warm",
  "aromatic",
  "smoky",
  "leathery",
];
const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "title",
    "summary",
    "confidence",
    "claims",
    "scentProfile",
    "ingredientRoles",
    "strengths",
    "tensions",
    "missingDimensions",
    "directions",
    "experiments",
    "questions",
    "limitations",
  ],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    title: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "text", "evidenceRefs"],
        properties: {
          id: { type: "string" },
          kind: {
            type: "string",
            enum: ["fact", "prediction", "observation", "recommendation"],
          },
          text: { type: "string" },
          evidenceRefs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["entityType", "entityId", "label"],
              properties: {
                entityType: { type: "string" },
                entityId: { type: "string" },
                label: { type: "string" },
              },
            },
          },
        },
      },
    },
    scentProfile: {
      type: "object",
      additionalProperties: false,
      required: ["axes", "dominantFamilies", "opening", "heart", "base"],
      properties: {
        axes: {
          type: "object",
          additionalProperties: false,
          required: axes,
          properties: Object.fromEntries(
            axes.map((a) => [a, { type: "number", minimum: 0, maximum: 100 }]),
          ),
        },
        dominantFamilies: { type: "array", items: { type: "string" } },
        opening: { type: "array", items: { type: "string" } },
        heart: { type: "array", items: { type: "string" } },
        base: { type: "array", items: { type: "string" } },
      },
    },
    ingredientRoles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "materialName",
          "materialRef",
          "predictedRole",
          "contribution",
        ],
        properties: {
          materialName: { type: "string" },
          materialRef: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["entityType", "entityId"],
            properties: {
              entityType: { type: "string", const: "ingredient" },
              entityId: { type: "string" },
            },
          },
          predictedRole: { type: "string" },
          contribution: { type: "string" },
        },
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    tensions: { type: "array", items: { type: "string" } },
    missingDimensions: { type: "array", items: { type: "string" } },
    directions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "intent",
          "predictedEffect",
          "tradeoffs",
          "suggestedMaterials",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          intent: { type: "string" },
          predictedEffect: { type: "string" },
          tradeoffs: { type: "array", items: { type: "string" } },
          suggestedMaterials: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "source", "ingredientId", "reason"],
              properties: {
                name: { type: "string" },
                source: { type: "string", enum: ["workspace", "concept"] },
                ingredientId: { type: ["string", "null"] },
                reason: { type: "string" },
              },
            },
          },
        },
      },
    },
    experiments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "hypothesis", "changes", "observe"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          hypothesis: { type: "string" },
          changes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "materialName",
                "ingredientId",
                "action",
                "guidance",
                "reason",
              ],
              properties: {
                materialName: { type: "string" },
                ingredientId: { type: ["string", "null"] },
                action: {
                  type: "string",
                  enum: ["add", "increase", "decrease", "remove"],
                },
                guidance: {
                  type: "string",
                  enum: ["trace", "low", "moderate", "structural"],
                },
                reason: { type: "string" },
              },
            },
          },
          observe: { type: "array", items: { type: "string" } },
        },
      },
    },
    questions: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
};
assertOpenAIStructuredOutputSchema(responseSchema);
const system = `KOALAFROG DEVELOPMENT COPILOT — SCENT STUDIO. Prompt version scent-studio-v1. Be a creative, disciplined sparring partner. Never claim to smell an untested composition. Every claim is exactly fact, observation, prediction, or recommendation. Before assigning a claim kind, apply this rule: a statement directly grounded in a loaded Koalafrog workspace record is FACT and must cite valid evidenceRefs; a statement directly grounded in a loaded Koalafrog lab, test, or user observation is OBSERVATION and must cite valid empirical evidenceRefs; a hypothesis about likely sensory or material behavior is PREDICTION; a proposed next action is RECOMMENDATION. General fragrance or material knowledge is always PREDICTION, never FACT. Concept Materials are exploratory user text, not stored Ingredients or evidence records: they may be named in analysis and experiments, but must never receive fabricated evidenceRefs. When the context manifest has no eligible factual or observational evidence, output zero unsupported FACT claims and zero unsupported OBSERVATION claims. Never fabricate evidence or records. Be uncertain and experimentally useful. Never claim safety, compliance, legal approval, IFRA/CPSR/PIF/CPNP completion, or make medical claims. Suggestions remain advisory and require supplier documentation, restrictions, assessment and physical evaluation. Prefer small qualitative experiments over fake precision.`;
interface IntelligenceModelProvider {
  name: string;
  model: string;
  analyze(input: { prompt: string; context: unknown }): Promise<{
    response: unknown;
    usage?: NormalizedProviderUsage;
  }>;
}
class ProviderCallError extends Error {
  constructor(public category: ProviderFailureCategory) {
    super(category);
  }
}
class OpenAIResponsesProvider implements IntelligenceModelProvider {
  name = "openai";
  constructor(
    private key: string,
    public model: string,
    private audit: { threadId: string; runId: string },
  ) {}
  private log(input: Parameters<typeof sanitizeProviderDiagnostic>[0]) {
    console.error(JSON.stringify(sanitizeProviderDiagnostic(input)));
  }
  async analyze(input: { prompt: string; context: unknown }) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(input) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "koalafrog_intelligence_response",
              strict: true,
              schema: responseSchema,
            },
          },
        }),
      });
    } catch {
      const category = "provider_server_failure";
      this.log({
        providerName: this.name,
        modelName: this.model,
        category,
        safeMessage: "OpenAI request failed before an HTTP response.",
        ...this.audit,
      });
      throw new ProviderCallError(category);
    }
    if (!response.ok) {
      let providerError: { type?: string; code?: string; message?: string } =
        {};
      try {
        providerError =
          ((await response.json()) as { error?: typeof providerError }).error ??
          {};
      } catch {
        providerError = {
          message: "OpenAI returned a non-JSON error response.",
        };
      }
      const category = classifyProviderFailure(
        response.status,
        providerError.type,
        providerError.code,
      );
      this.log({
        providerName: this.name,
        modelName: this.model,
        category,
        httpStatus: response.status,
        errorType: providerError.type,
        errorCode: providerError.code,
        requestId: response.headers.get("x-request-id") ?? undefined,
        safeMessage: providerError.message,
        ...this.audit,
      });
      throw new ProviderCallError(category);
    }
    let raw: any;
    try {
      raw = await response.json();
    } catch {
      const category = "provider_response_parsing";
      this.log({
        providerName: this.name,
        modelName: this.model,
        category,
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
        safeMessage: "OpenAI success response was not valid JSON.",
        ...this.audit,
      });
      throw new ProviderCallError(category);
    }
    const output = raw.output
      ?.flatMap((x: any) => x.content ?? [])
      .find((x: any) => x.type === "output_text")?.text;
    if (typeof output !== "string") {
      const category = "provider_response_parsing";
      this.log({
        providerName: this.name,
        modelName: this.model,
        category,
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
        safeMessage: "OpenAI response did not contain structured output.",
        ...this.audit,
      });
      throw new ProviderCallError(category);
    }
    try {
      return {
        response: JSON.parse(output),
        usage: normalizeOpenAIUsage(raw.usage, {
          inputUsdPerMillion: Deno.env.get(
            "OPENAI_INPUT_USD_PER_MILLION_TOKENS",
          ),
          cachedInputUsdPerMillion: Deno.env.get(
            "OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS",
          ),
          outputUsdPerMillion: Deno.env.get(
            "OPENAI_OUTPUT_USD_PER_MILLION_TOKENS",
          ),
          snapshotVersion: Deno.env.get("OPENAI_PRICING_SNAPSHOT_VERSION"),
        }),
      };
    } catch {
      const category = "provider_response_parsing";
      this.log({
        providerName: this.name,
        modelName: this.model,
        category,
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
        safeMessage: "OpenAI structured output was not valid JSON.",
        ...this.audit,
      });
      throw new ProviderCallError(category);
    }
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST")
      return json(
        { error: { code: "INVALID_REQUEST", message: "POST required." } },
        405,
      );
    const authorization = req.headers.get("Authorization");
    if (!authorization)
      return json(
        {
          error: { code: "AUTHENTICATION_EXPIRED", message: "Sign in again." },
        },
        401,
      );
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user)
      return json(
        {
          error: { code: "AUTHENTICATION_EXPIRED", message: "Sign in again." },
        },
        401,
      );
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(
        { error: { code: "INVALID_REQUEST", message: "Invalid JSON." } },
        400,
      );
    }
    if (!validRequest(body))
      return json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Request contract rejected.",
          },
        },
        400,
      );
    const workspace = await client
      .from("workspaces")
      .select("id,lifecycle_state")
      .eq("id", body.workspaceId)
      .eq("owner_id", auth.data.user.id)
      .maybeSingle();
    if (
      workspace.error ||
      !workspace.data ||
      workspace.data.lifecycle_state !== "active"
    )
      return json(
        {
          error: {
            code: "UNAUTHORIZED_WORKSPACE",
            message: "Workspace is unavailable.",
          },
        },
        403,
      );
    const s = body.contextSelection;
    const [products, versions, ingredients] = await Promise.all([
      s.productId
        ? client
            .from("products")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .eq("id", s.productId)
        : Promise.resolve({ data: [], error: null }),
      s.formulaVersionId
        ? client
            .from("formula_versions")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .eq("id", s.formulaVersionId)
        : Promise.resolve({ data: [], error: null }),
      s.selectedIngredientIds.length
        ? client
            .from("ingredients")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .in("id", s.selectedIngredientIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (products.error || versions.error || ingredients.error)
      return json(
        {
          error: {
            code: "PROVIDER_FAILURE",
            message: "Context could not be loaded.",
          },
        },
        502,
      );
    const lines = s.formulaVersionId
      ? await client
          .from("formula_lines")
          .select("*")
          .eq("workspace_id", body.workspaceId)
          .eq("formula_version_id", s.formulaVersionId)
      : { data: [] };
    const productId = s.productId || (products.data?.[0] as any)?.id;
    let batches: any[] = [];
    if (productId) {
      const q = await client
        .from("lab_batches")
        .select("*")
        .eq("workspace_id", body.workspaceId)
        .eq("product_id", productId)
        .order("id")
        .limit(10);
      batches = q.data ?? [];
    }
    const batchIds = batches.map((b) => b.id);
    const observations = batchIds.length
      ? ((
          await client
            .from("lab_observations")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .in("lab_batch_id", batchIds)
            .not("observed_at", "is", null)
            .order("id")
            .limit(20)
        ).data ?? [])
      : [];
    const sessions = batchIds.length
      ? ((
          await client
            .from("test_sessions")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .in("lab_batch_id", batchIds)
            .order("id")
            .limit(10)
        ).data ?? [])
      : [];
    const sessionIds = sessions.map((x) => x.id);
    const responses = sessionIds.length
      ? ((
          await client
            .from("test_responses")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .in("test_session_id", sessionIds)
            .order("id")
            .limit(20)
        ).data ?? [])
      : [];
    const scentSessionResult = await client
      .from("scent_memory_sessions")
      .select(
        "id,title,product_id,formula_version_id,lab_batch_id,ingredient_id,test_session_id",
      )
      .eq("workspace_id", body.workspaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (scentSessionResult.error)
      return json(
        {
          error: {
            code: "PROVIDER_FAILURE",
            message: "Context could not be loaded.",
          },
        },
        502,
      );
    const relevantScentSessions = relevantScentMemorySessions(
      scentSessionResult.data ?? [],
      s,
      batchIds,
    );
    const scentCheckpointResult = relevantScentSessions.length
      ? await client
            .from("scent_memory_checkpoints")
            .select("*")
            .eq("workspace_id", body.workspaceId)
            .in(
              "session_id",
              relevantScentSessions.map((memory: any) => memory.id),
            )
            .eq("is_current", true)
            .is("archived_at", null)
            .order("observed_at", { ascending: false })
            .limit(30)
      : { data: [], error: null };
    if (scentCheckpointResult.error)
      return json(
        { error: { code: "PROVIDER_FAILURE", message: "Context could not be loaded." } },
        502,
      );
    const scentMemoryCheckpoints = scentCheckpointResult.data ?? [];
    const manifest = {
      contextVersion: 2,
      productIds: (products.data ?? []).map((x: any) => x.id),
      formulaVersionIds: (versions.data ?? []).map((x: any) => x.id),
      ingredientIds: (ingredients.data ?? []).map((x: any) => x.id),
      labBatchIds: batchIds,
      labObservationIds: observations.map((x) => x.id),
      testSessionIds: sessionIds,
      testResponseIds: responses.map((x) => x.id),
      scentMemoryCheckpointIds: scentMemoryCheckpoints.map((x) => x.id),
    };
    const universe = new Set(
      Object.entries(manifest).flatMap(([k, ids]) =>
        Array.isArray(ids)
          ? ids.map(
              (id) =>
                `${({ productIds: "product", formulaVersionIds: "formulaVersion", ingredientIds: "ingredient", labBatchIds: "labBatch", labObservationIds: "labObservation", testSessionIds: "testSession", testResponseIds: "testResponse", scentMemoryCheckpointIds: "scentMemoryCheckpoint" } as any)[k]}:${id}`,
            )
          : [],
      ),
    );
    let threadId = body.threadId;
    if (threadId) {
      const thread = await client
        .from("intelligence_threads")
        .select("id")
        .eq("id", threadId)
        .eq("workspace_id", body.workspaceId)
        .maybeSingle();
      if (thread.error || !thread.data)
        return json(
          {
            error: {
              code: "UNAUTHORIZED_WORKSPACE",
              message: "Thread is unavailable.",
            },
          },
          403,
        );
    } else {
      threadId = crypto.randomUUID();
      const inserted = await client.from("intelligence_threads").insert({
        id: threadId,
        workspace_id: body.workspaceId,
        owner_user_id: auth.data.user.id,
        mode: body.mode,
        title: body.userPrompt.slice(0, 80),
      });
      if (inserted.error)
        return json(
          {
            error: {
              code: "PROVIDER_FAILURE",
              message: "Thread could not be recorded.",
            },
          },
          500,
        );
    }
    const previous = await client
      .from("intelligence_runs")
      .select("user_prompt,response_payload")
      .eq("thread_id", threadId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(4);
    const runId = crypto.randomUUID();
    await client.from("intelligence_runs").insert({
      id: runId,
      workspace_id: body.workspaceId,
      owner_user_id: auth.data.user.id,
      thread_id: threadId,
      request_schema_version: 1,
      prompt_version: "scent-studio-v1",
      context_version: 2,
      user_prompt: body.userPrompt,
      context_selection: s,
      context_manifest: manifest,
      status: "analyzing",
    });
    const key = Deno.env.get("OPENAI_API_KEY"),
      model = Deno.env.get("OPENAI_MODEL");
    if (!key || !model) {
      await client
        .from("intelligence_runs")
        .update({
          status: "failed",
          error_code: "INTELLIGENCE_NOT_CONFIGURED",
          error_message: "Provider configuration is missing.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return json(
        {
          error: {
            code: "INTELLIGENCE_NOT_CONFIGURED",
            message: "Scent Studio Intelligence has not been configured yet.",
          },
          threadId,
        },
        503,
      );
    }
    const context = {
      manifest,
      records: {
        products: products.data,
        formulaVersions: versions.data,
        formulaLines: lines.data,
        ingredients: ingredients.data,
        labBatches: batches,
        labObservations: observations,
        testSessions: sessions,
        testResponses: responses,
        scentMemorySessions: relevantScentSessions,
        scentMemoryCheckpoints,
      },
      conceptMaterials: [...s.conceptMaterials].sort(),
      boundedPreviousTurns: (previous.data ?? []).reverse(),
    };
    try {
      const provider: IntelligenceModelProvider = new OpenAIResponsesProvider(
        key,
        model,
        { threadId, runId },
      );
      const analysis = await provider.analyze({
        prompt: body.userPrompt,
        context,
      });
      const parsed = analysis.response;
      const validation = validateIntelligenceProviderResponse(parsed, universe);
      if (!validation.valid) {
        console.error(
          JSON.stringify(
            createValidationDiagnostic({
              result: validation,
              responseSchemaVersion:
                typeof (parsed as any)?.schemaVersion === "number"
                  ? (parsed as any).schemaVersion
                  : undefined,
              contextVersion: manifest.contextVersion,
              threadId,
              runId,
            }),
          ),
        );
        await client
          .from("intelligence_runs")
          .update({
            status: "failed",
            error_code: "INVALID_PROVIDER_RESPONSE",
            error_message: "Structured response validation failed.",
            provider_name: "openai",
            model_name: model,
            input_tokens: analysis.usage?.inputTokens,
            output_tokens: analysis.usage?.outputTokens,
            total_tokens: analysis.usage?.totalTokens,
            cached_input_tokens: analysis.usage?.cachedInputTokens,
            reasoning_tokens: analysis.usage?.reasoningTokens,
            provider_usage_version: analysis.usage?.providerUsageVersion,
            estimated_cost_usd: analysis.usage?.estimatedCostUsd,
            pricing_snapshot_version: analysis.usage?.pricingSnapshotVersion,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
        return json(
          {
            error: {
              code: "INVALID_PROVIDER_RESPONSE",
              message: "The analysis response could not be validated.",
            },
            threadId,
          },
          502,
        );
      }
      await client
        .from("intelligence_runs")
        .update({
          status: "completed",
          response_schema_version: 1,
          response_payload: parsed,
          provider_name: "openai",
          model_name: model,
          input_tokens: analysis.usage?.inputTokens,
          output_tokens: analysis.usage?.outputTokens,
          total_tokens: analysis.usage?.totalTokens,
          cached_input_tokens: analysis.usage?.cachedInputTokens,
          reasoning_tokens: analysis.usage?.reasoningTokens,
          provider_usage_version: analysis.usage?.providerUsageVersion,
          estimated_cost_usd: analysis.usage?.estimatedCostUsd,
          pricing_snapshot_version: analysis.usage?.pricingSnapshotVersion,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      await client
        .from("intelligence_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);
      return json({
        threadId,
        runId,
        response: parsed,
        contextManifest: manifest,
      });
    } catch (error) {
      if (!(error instanceof ProviderCallError))
        console.error(
          JSON.stringify(
            sanitizeProviderDiagnostic({
              providerName: "openai",
              modelName: model,
              category: "provider_failure",
              safeMessage: "Unexpected provider boundary failure.",
              threadId,
              runId,
            }),
          ),
        );
      await client
        .from("intelligence_runs")
        .update({
          status: "failed",
          error_code: "PROVIDER_FAILURE",
          error_message: `Provider failure: ${error instanceof ProviderCallError ? error.category : "provider_failure"}`,
          provider_name: "openai",
          model_name: model,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return json(
        {
          error: {
            code: "PROVIDER_FAILURE",
            message: "Scent Studio could not complete the analysis.",
          },
          threadId,
        },
        502,
      );
    }
  } catch {
    return json(
      {
        error: {
          code: "NETWORK_FAILURE",
          message: "Scent Studio encountered an unexpected server error.",
        },
      },
      500,
    );
  }
});
