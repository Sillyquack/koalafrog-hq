/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";
import {
  BEARD_PHOTO_PROMPT_VERSION,
  type BeardPhotoAnalysisResult,
  type BeardPhotoView,
  beardPhotoViews,
  requiredBeardPhotoViews,
  validateBeardPhotoAnalysisResult,
} from "../_shared/beardPhotoAnalysisContract.ts";
import { beardPhotoSystemPrompt } from "../_shared/beardPhotoPrompt.ts";
import {
  beardStageLog,
  InvalidProviderTimeoutError,
  parseBeardProviderTimeout,
  ProviderDeadlineError,
  withProviderDeadline,
} from "../_shared/beardPhotoRuntime.ts";

const BUCKET = "beard-analysis-images",
  MAX_BYTES = 8 * 1024 * 1024,
  MAX_PER_HOUR = 5;
const ALLOWED_MODELS = new Set(["gpt-5", "gpt-5-2025-08-07"]);
const allowedOrigin = (origin: string | null) =>
  !origin || origin === "https://koalafrog-hq.pages.dev" ||
  /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
type Input = {
  view: BeardPhotoView;
  objectPath: string;
  mimeType: string;
  byteSize: number;
};
type Body = {
  schemaVersion: 1;
  workspaceId: string;
  analysisId: string;
  idempotencyKey: string;
  profileId: string;
  inputs: Input[];
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validBody(value: unknown): value is Body {
  const v = value as Body;
  if (
    !v || v.schemaVersion !== 1 ||
    ![v.workspaceId, v.analysisId, v.idempotencyKey, v.profileId].every((x) =>
      typeof x === "string" && uuid.test(x)
    ) || !Array.isArray(v.inputs) || v.inputs.length < 3 || v.inputs.length > 4
  ) return false;
  const seen = new Set<string>();
  for (const input of v.inputs) {
    if (
      !input || !beardPhotoViews.includes(input.view) || seen.has(input.view) ||
      typeof input.objectPath !== "string" ||
      !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType) ||
      !Number.isInteger(input.byteSize) || input.byteSize <= 0 ||
      input.byteSize > MAX_BYTES
    ) return false;
    seen.add(input.view);
  }
  return requiredBeardPhotoViews.every((view) => seen.has(view));
}
const safeError = (code: string, message: string, correlationId: string) => ({
  error: { code, message, correlationId },
});
const outputItem = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "category",
    "statement",
    "confidence",
    "supportingViews",
    "evidenceDescription",
    "limitations",
    "relatedBeardZones",
    "provenance",
  ],
  properties: {
    id: { type: "string" },
    category: { type: "string" },
    statement: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    supportingViews: {
      type: "array",
      items: { type: "string", enum: beardPhotoViews },
    },
    evidenceDescription: { type: "string" },
    limitations: { type: "array", items: { type: "string" } },
    relatedBeardZones: { type: "array", items: { type: "string" } },
    provenance: { type: "string", const: "ai" },
  },
};
const resultSchema = (
  meta: {
    analysisId: string;
    provider: string;
    model: string;
    correlationId: string;
  },
) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "analysisId",
    "schemaVersion",
    "promptVersion",
    "provider",
    "model",
    "createdAt",
    "provenance",
    "status",
    "photoQuality",
    "observations",
    "symmetry",
    "densityDistribution",
    "lineAssessment",
    "recommendations",
    "limitations",
    "unknowns",
    "safetyFlags",
    "correlationId",
  ],
  properties: {
    analysisId: { type: "string", const: meta.analysisId },
    schemaVersion: { type: "integer", const: 1 },
    promptVersion: { type: "string", const: BEARD_PHOTO_PROMPT_VERSION },
    provider: { type: "string", const: meta.provider },
    model: { type: "string", const: meta.model },
    createdAt: { type: "string" },
    provenance: { type: "string", const: "ai" },
    status: { type: "string", const: "completed" },
    photoQuality: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "perView", "issues", "retakeRecommended"],
      properties: {
        overall: {
          type: "string",
          enum: ["suitable", "limited", "unsuitable"],
        },
        perView: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["view", "quality", "issues"],
            properties: {
              view: { type: "string", enum: beardPhotoViews },
              quality: {
                type: "string",
                enum: ["suitable", "limited", "unsuitable"],
              },
              issues: { type: "array", items: { type: "string" } },
            },
          },
        },
        issues: { type: "array", items: { type: "string" } },
        retakeRecommended: { type: "boolean" },
      },
    },
    observations: { type: "array", items: outputItem },
    symmetry: { type: "array", items: outputItem },
    densityDistribution: { type: "array", items: outputItem },
    lineAssessment: { type: "array", items: outputItem },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "reason",
          "confidence",
          "priority",
          "expectedBenefit",
          "supportingObservationIds",
          "affectedZones",
          "toolConstraints",
          "proposedGuardStrategy",
          "status",
          "provenance",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          expectedBenefit: { type: "string" },
          supportingObservationIds: {
            type: "array",
            items: { type: "string" },
          },
          affectedZones: { type: "array", items: { type: "string" } },
          toolConstraints: { type: "array", items: { type: "string" } },
          proposedGuardStrategy: { type: ["string", "null"] },
          status: { type: "string", const: "undecided" },
          provenance: { type: "string", const: "ai" },
        },
      },
    },
    limitations: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    safetyFlags: { type: "array", items: { type: "string" } },
    correlationId: { type: "string", const: meta.correlationId },
  },
});

interface VisionAnalysisProvider {
  id: string;
  model: string;
  capabilities: { imageInput: true; structuredOutput: true };
  healthCheck(): { configured: boolean };
  analyzeBeardPhotos(
    request: {
      context: unknown;
      images: Array<{ view: BeardPhotoView; dataUrl: string }>;
      analysisId: string;
      correlationId: string;
    },
  ): Promise<{ result: BeardPhotoAnalysisResult; usage?: unknown }>;
}
class ProviderError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
class OpenAIBeardVisionProvider implements VisionAnalysisProvider {
  id = "openai";
  capabilities = { imageInput: true as const, structuredOutput: true as const };
  constructor(
    private key: string,
    public model: string,
    private timeoutMs: number,
  ) {}
  healthCheck() {
    return { configured: Boolean(this.key && this.model) };
  }
  async analyzeBeardPhotos(
    request: {
      context: unknown;
      images: Array<{ view: BeardPhotoView; dataUrl: string }>;
      analysisId: string;
      correlationId: string;
    },
  ) {
    let response: Response;
    try {
      response = await withProviderDeadline(
        (signal) =>
          fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal,
            headers: {
              Authorization: `Bearer ${this.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              store: false,
              input: [{ role: "system", content: beardPhotoSystemPrompt }, {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: JSON.stringify({
                      task:
                        "Analyze the supplied labeled beard views using only this minimal Beard Studio context.",
                      context: request.context,
                    }),
                  },
                  ...request.images.flatMap(
                    (image) => [{
                      type: "input_text",
                      text: `Image view: ${image.view}`,
                    }, {
                      type: "input_image",
                      image_url: image.dataUrl,
                      detail: "high",
                    }],
                  ),
                ],
              }],
              text: {
                format: {
                  type: "json_schema",
                  name: "beard_photo_analysis",
                  strict: true,
                  schema: resultSchema({
                    analysisId: request.analysisId,
                    provider: this.id,
                    model: this.model,
                    correlationId: request.correlationId,
                  }),
                },
              },
            }),
          }),
        this.timeoutMs,
      );
    } catch (error) {
      throw new ProviderError(
        error instanceof ProviderDeadlineError
          ? "PROVIDER_TIMEOUT"
          : "NETWORK_FAILURE",
      );
    }
    if (!response.ok) {
      if (response.status === 429) {
        throw new ProviderError("PROVIDER_RATE_LIMIT");
      }
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("PROVIDER_NOT_CONFIGURED");
      }
      if (response.status >= 500) throw new ProviderError("PROVIDER_FAILURE");
      throw new ProviderError("PROVIDER_REFUSAL");
    }
    let raw: any;
    try {
      raw = await response.json();
    } catch {
      throw new ProviderError("INVALID_STRUCTURED_OUTPUT");
    }
    const refusal = raw.output?.flatMap((x: any) => x.content ?? []).find((
      x: any,
    ) => x.type === "refusal");
    if (refusal) throw new ProviderError("PROVIDER_REFUSAL");
    const text = raw.output?.flatMap((x: any) => x.content ?? []).find((
      x: any,
    ) => x.type === "output_text")?.text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError("INVALID_STRUCTURED_OUTPUT");
    }
    if (!validateBeardPhotoAnalysisResult(parsed)) {
      throw new ProviderError("INVALID_STRUCTURED_OUTPUT");
    }
    return {
      result: parsed,
      usage: raw.usage
        ? {
          inputTokens: raw.usage.input_tokens,
          outputTokens: raw.usage.output_tokens,
          totalTokens: raw.usage.total_tokens,
        }
        : undefined,
    };
  }
}
const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

Deno.serve(async (req) => {
  const requestStartedAt = Date.now();
  const origin = req.headers.get("Origin");
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  const responseOrigin = origin ?? "https://koalafrog-hq.pages.dev";
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": responseOrigin,
        "Content-Type": "application/json",
        "Vary": "Origin",
      },
    });
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": responseOrigin,
        "Vary": "Origin",
      },
    });
  }
  const correlationId = crypto.randomUUID();
  if (req.method !== "POST") {
    return json(
      safeError("INVALID_REQUEST", "POST required.", correlationId),
      405,
    );
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return json(
      safeError("NOT_SIGNED_IN", "Sign in again.", correlationId),
      401,
    );
  }
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) {
    return json(
      safeError("NOT_SIGNED_IN", "Sign in again.", correlationId),
      401,
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      safeError("INVALID_REQUEST", "Invalid JSON.", correlationId),
      400,
    );
  }
  if (!validBody(body)) {
    return json(
      safeError("INVALID_REQUEST", "Request contract rejected.", correlationId),
      400,
    );
  }
  const stage = (
    name: Parameters<typeof beardStageLog>[0]["stage"],
    details: Partial<
      Pick<
        Parameters<typeof beardStageLog>[0],
        "outcomeCode" | "provider" | "model"
      >
    > = {},
  ) =>
    console.info(beardStageLog({
      correlationId,
      analysisId: body.analysisId,
      stage: name,
      elapsedMs: Date.now() - requestStartedAt,
      ...details,
    }));
  stage("authentication_completed");
  const userId = auth.data.user.id;
  const existing = await client.from("intelligence_analyses").select(
    "result_payload,status",
  ).eq("workspace_id", body.workspaceId).eq("owner_user_id", userId).eq(
    "idempotency_key",
    body.idempotencyKey,
  ).maybeSingle();
  const workspace = await client.from("workspaces").select("id").eq(
    "id",
    body.workspaceId,
  ).eq("owner_id", userId).eq("lifecycle_state", "active").maybeSingle();
  if (workspace.error || !workspace.data) {
    return json(
      safeError(
        "MISSING_WORKSPACE",
        "Workspace is unavailable.",
        correlationId,
      ),
      403,
    );
  }
  const prefix = `${body.workspaceId}/${userId}/${body.analysisId}/`;
  if (
    body.inputs.some((input) =>
      !input.objectPath.startsWith(prefix) ||
      input.objectPath.split("/").length !== 4
    )
  ) {
    return json(
      safeError(
        "STORAGE_AUTHORIZATION_FAILED",
        "Image ownership could not be verified.",
        correlationId,
      ),
      403,
    );
  }
  const cleanupRequestedInputs = () =>
    client.storage.from(BUCKET).remove(
      body.inputs.map((input) => input.objectPath),
    );
  const model = Deno.env.get("OPENAI_BEARD_VISION_MODEL")?.trim() ?? "",
    key = Deno.env.get("OPENAI_API_KEY") || "";
  let timeoutMs: number;
  try {
    timeoutMs = parseBeardProviderTimeout(
      Deno.env.get("OPENAI_BEARD_VISION_TIMEOUT_MS"),
    );
  } catch (error) {
    if (!(error instanceof InvalidProviderTimeoutError)) throw error;
    await cleanupRequestedInputs();
    return json(
      safeError(
        "PROVIDER_NOT_CONFIGURED",
        "Beard photo analysis is not configured.",
        correlationId,
      ),
      503,
    );
  }
  const provider = new OpenAIBeardVisionProvider(key, model, timeoutMs);
  if (!provider.healthCheck().configured || !ALLOWED_MODELS.has(model)) {
    await cleanupRequestedInputs();
    return json(
      safeError(
        "PROVIDER_NOT_CONFIGURED",
        "Beard photo analysis is not configured.",
        correlationId,
      ),
      503,
    );
  }
  if (
    existing.data?.result_payload &&
    ["completed", "completed_cleanup_required"].includes(existing.data.status)
  ) {
    await cleanupRequestedInputs();
    return json({ result: existing.data.result_payload });
  }
  const active = await client.from("intelligence_analyses").select("id", {
    count: "exact",
    head: true,
  }).eq("workspace_id", body.workspaceId).eq("owner_user_id", userId).in(
    "status",
    ["staging", "analyzing"],
  );
  if ((active.count ?? 0) > 0) {
    await cleanupRequestedInputs();
    return json(
      safeError(
        "ANALYSIS_IN_PROGRESS",
        "Another analysis is already active.",
        correlationId,
      ),
      409,
    );
  }
  const recent = await client.from("intelligence_analyses").select("id", {
    count: "exact",
    head: true,
  }).eq("workspace_id", body.workspaceId).eq("owner_user_id", userId).gte(
    "created_at",
    new Date(Date.now() - 3600000).toISOString(),
  );
  if ((recent.count ?? 0) >= MAX_PER_HOUR) {
    await cleanupRequestedInputs();
    return json(
      safeError(
        "RATE_LIMITED",
        "Analysis limit reached. Try again later.",
        correlationId,
      ),
      429,
    );
  }
  const [profile, tools, map, lastLog] = await Promise.all([
    client.from("beard_profiles").select(
      "id,name,target_look,density,texture,profile_details",
    ).eq("workspace_id", body.workspaceId).eq("id", body.profileId).eq(
      "status",
      "Active",
    ).maybeSingle(),
    client.from("grooming_tools").select(
      "id,name,brand,model,minimum_length_mm,maximum_length_mm,adjustment_increment_mm,grooming_tool_attachments(id,name)",
    ).eq("workspace_id", body.workspaceId).eq("status", "active"),
    client.from("beard_length_maps").select(
      "id,beard_length_map_zones(zone_name,target_length_mm,trim_direction,enabled)",
    ).eq("workspace_id", body.workspaceId).eq("profile_id", body.profileId)
      .maybeSingle(),
    client.from("beard_log_entries").select(
      "occurred_at,overall_rating,symmetry_rating,fade_rating,line_sharpness_rating,what_worked,change_next_time",
    ).eq("workspace_id", body.workspaceId).eq("profile_id", body.profileId)
      .order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (profile.error || !profile.data) {
    await cleanupRequestedInputs();
    return json(
      safeError(
        "NO_BEARD_PROFILE",
        "An active Beard Studio profile is required.",
        correlationId,
      ),
      400,
    );
  }
  if (tools.error || map.error || lastLog.error) {
    await cleanupRequestedInputs();
    return json(
      safeError(
        "CONTEXT_UNAVAILABLE",
        "Beard Studio context could not be loaded.",
        correlationId,
      ),
      502,
    );
  }
  stage("context_loaded");
  const inserted = await client.from("intelligence_analyses").insert({
    id: body.analysisId,
    workspace_id: body.workspaceId,
    owner_user_id: userId,
    source_module: "beard-studio",
    analysis_type: "beard_photo_analysis",
    schema_version: 1,
    prompt_version: BEARD_PHOTO_PROMPT_VERSION,
    status: "staging",
    idempotency_key: body.idempotencyKey,
    profile_id: body.profileId,
    context_manifest: {
      profileId: body.profileId,
      toolIds: (tools.data ?? []).map((x: any) => x.id),
      lengthMapId: map.data?.id ?? null,
      lastLogAt: lastLog.data?.occurred_at ?? null,
      views: body.inputs.map((x) => x.view),
    },
    correlation_id: correlationId,
  }).select("id").single();
  if (inserted.error) {
    await cleanupRequestedInputs();
    const code = inserted.error.message.includes("RATE_LIMITED")
      ? "RATE_LIMITED"
      : inserted.error.message.includes("ANALYSIS_IN_PROGRESS")
      ? "ANALYSIS_IN_PROGRESS"
      : "ANALYSIS_CREATE_FAILED";
    return json(
      safeError(
        code,
        code === "RATE_LIMITED"
          ? "Analysis limit reached. Try again later."
          : code === "ANALYSIS_IN_PROGRESS"
          ? "Another analysis is already active."
          : "Analysis could not be started.",
        correlationId,
      ),
      code === "RATE_LIMITED" ? 429 : 409,
    );
  }
  const inputRows = body.inputs.map((input) => ({
    id: crypto.randomUUID(),
    workspace_id: body.workspaceId,
    owner_user_id: userId,
    analysis_id: body.analysisId,
    view: input.view,
    bucket: BUCKET,
    object_path: input.objectPath,
    mime_type: input.mimeType,
    byte_size: input.byteSize,
  }));
  const inputInsert = await client.from("intelligence_analysis_inputs").insert(
    inputRows,
  );
  if (inputInsert.error) {
    await client.from("intelligence_analyses").update({
      status: "failed",
      error_code: "INPUT_METADATA_FAILED",
      completed_at: new Date().toISOString(),
    }).eq("id", body.analysisId).eq("workspace_id", body.workspaceId);
    await client.storage.from(BUCKET).remove(
      body.inputs.map((input) => input.objectPath),
    );
    return json(
      safeError(
        "INPUT_METADATA_FAILED",
        "Image metadata could not be recorded.",
        correlationId,
      ),
      502,
    );
  }
  const attempted = await client.rpc("begin_beard_provider_attempt", {
    candidate_workspace_id: body.workspaceId,
    candidate_analysis_id: body.analysisId,
    candidate_provider: provider.id,
    candidate_model: provider.model,
    candidate_prompt_version: BEARD_PHOTO_PROMPT_VERSION,
  });
  if (attempted.error || attempted.data !== true) {
    await client.from("intelligence_analyses").update({
      status: "failed",
      error_code: "ATTEMPT_PROVENANCE_FAILED",
      completed_at: new Date().toISOString(),
    }).eq("id", body.analysisId).eq("workspace_id", body.workspaceId);
    const removed = await cleanupRequestedInputs();
    await client.from("intelligence_analysis_inputs").update({
      cleanup_state: removed.error ? "cleanup_required" : "deleted",
      cleaned_at: removed.error ? null : new Date().toISOString(),
    }).eq("analysis_id", body.analysisId).eq("workspace_id", body.workspaceId);
    return json(
      safeError(
        "ATTEMPT_PROVENANCE_FAILED",
        "Analysis attempt could not be recorded.",
        correlationId,
      ),
      502,
    );
  }
  let result: BeardPhotoAnalysisResult | undefined,
    errorCode: string | undefined;
  try {
    const images = [] as Array<{ view: BeardPhotoView; dataUrl: string }>;
    for (const input of body.inputs) {
      const downloaded = await client.storage.from(BUCKET).download(
        input.objectPath,
      );
      if (downloaded.error || !downloaded.data) {
        throw new ProviderError("STORAGE_AUTHORIZATION_FAILED");
      }
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.byteLength !== input.byteSize) {
        throw new ProviderError("INVALID_IMAGE");
      }
      images.push({
        view: input.view,
        dataUrl: `${input.mimeType};base64,${toBase64(bytes)}`.replace(
          /^image/,
          "data:image",
        ),
      });
    }
    stage("images_loaded", { provider: provider.id, model: provider.model });
    stage("provider_request_started", {
      provider: provider.id,
      model: provider.model,
    });
    const analyzed = await provider.analyzeBeardPhotos({
      analysisId: body.analysisId,
      correlationId,
      context: {
        profile: profile.data,
        tools: tools.data ?? [],
        lengthMap: map.data ?? null,
        lastTrim: lastLog.data ?? null,
      },
      images,
    });
    stage("provider_response_received", {
      provider: provider.id,
      model: provider.model,
    });
    result = analyzed.result;
    stage("validation_completed", {
      provider: provider.id,
      model: provider.model,
    });
    const observationInsert = await client.from("intelligence_observations")
      .insert(
        [
          ...result.observations,
          ...result.symmetry,
          ...result.densityDistribution,
          ...result.lineAssessment,
        ].map((item) => ({
          id: item.id,
          workspace_id: body.workspaceId,
          owner_user_id: userId,
          analysis_id: body.analysisId,
          category: item.category,
          statement: item.statement,
          confidence: item.confidence,
          supporting_views: item.supportingViews,
          evidence_description: item.evidenceDescription,
          limitations: item.limitations,
          related_beard_zones: item.relatedBeardZones,
          provenance: "ai",
        })),
      );
    if (observationInsert.error) {
      throw new ProviderError("RESULT_PERSISTENCE_FAILED");
    }
    const recommendationInsert = await client.from(
      "intelligence_recommendations",
    ).insert(
      result.recommendations.map((item) => ({
        id: item.id,
        workspace_id: body.workspaceId,
        owner_user_id: userId,
        analysis_id: body.analysisId,
        title: item.title,
        reason: item.reason,
        confidence: item.confidence,
        priority: item.priority,
        expected_benefit: item.expectedBenefit,
        supporting_observation_ids: item.supportingObservationIds,
        affected_zones: item.affectedZones,
        tool_constraints: item.toolConstraints,
        proposed_guard_strategy: item.proposedGuardStrategy,
        review_status: item.status,
        provenance: "ai",
      })),
    );
    if (recommendationInsert.error) {
      throw new ProviderError("RESULT_PERSISTENCE_FAILED");
    }
    const resultUpdate = await client.from("intelligence_analyses").update({
      status: "completed",
      provider_name: provider.id,
      model_name: provider.model,
      result_payload: result,
      provider_usage: analyzed.usage ?? null,
      completed_at: new Date().toISOString(),
    }).eq("id", body.analysisId).eq("workspace_id", body.workspaceId);
    if (resultUpdate.error) {
      throw new ProviderError("RESULT_PERSISTENCE_FAILED");
    }
  } catch (error) {
    errorCode = error instanceof ProviderError
      ? error.code
      : "UNEXPECTED_ERROR";
    result = undefined;
    await client.from("intelligence_analyses").update({
      status: "failed",
      error_code: errorCode,
      completed_at: new Date().toISOString(),
    }).eq("id", body.analysisId).eq("workspace_id", body.workspaceId);
  }
  const removed = await client.storage.from(BUCKET).remove(
    body.inputs.map((input) => input.objectPath),
  );
  const cleanupFailed = Boolean(removed.error);
  await client.from("intelligence_analysis_inputs").update({
    cleanup_state: cleanupFailed ? "cleanup_required" : "deleted",
    cleaned_at: cleanupFailed ? null : new Date().toISOString(),
  }).eq("analysis_id", body.analysisId).eq("workspace_id", body.workspaceId);
  stage("cleanup_completed", {
    outcomeCode: cleanupFailed
      ? "CLEANUP_FAILURE"
      : result
      ? "COMPLETED"
      : errorCode ?? "UNEXPECTED_ERROR",
    provider: provider.id,
    model: provider.model,
  });
  if (result) {
    if (cleanupFailed) {
      result = { ...result, status: "completed_cleanup_required" };
      await client.from("intelligence_analyses").update({
        status: "completed_cleanup_required",
        result_payload: result,
      }).eq("id", body.analysisId);
    }
    return json({
      result,
      cleanupWarning: cleanupFailed
        ? "Temporary image cleanup requires attention."
        : undefined,
    });
  }
  return json(
    safeError(
      errorCode ?? "UNEXPECTED_ERROR",
      "Beard photo analysis could not be completed.",
      correlationId,
    ),
    errorCode === "PROVIDER_RATE_LIMIT"
      ? 429
      : errorCode === "PROVIDER_NOT_CONFIGURED"
      ? 503
      : 502,
  );
});
