import { supabase } from "../../../platform/supabase/client";
import type {
  IntelligenceRequest,
  IntelligenceResponse,
  ContextManifest,
  IntelligenceErrorCode,
} from "../domain/intelligenceContract";
export class IntelligenceClientError extends Error {
  constructor(
    public code: IntelligenceErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export async function runIntelligence(
  request: Omit<IntelligenceRequest, "workspaceId">,
) {
  if (!supabase)
    throw new IntelligenceClientError(
      "INTELLIGENCE_NOT_CONFIGURED",
      "Hosted Intelligence requires the Supabase runtime.",
    );
  const workspace = await supabase
    .from("workspaces")
    .select("id")
    .eq("lifecycle_state", "Active")
    .maybeSingle();
  if (workspace.error || !workspace.data)
    throw new IntelligenceClientError(
      "UNAUTHORIZED_WORKSPACE",
      "The active hosted workspace is unavailable.",
    );
  const result = await supabase.functions.invoke("koalafrog-intelligence", {
    body: { ...request, workspaceId: workspace.data.id },
  });
  if (result.error) {
    const context = await result.error.context?.json?.().catch(() => undefined);
    throw new IntelligenceClientError(
      context?.error?.code ?? "NETWORK_FAILURE",
      context?.error?.message ?? result.error.message,
    );
  }
  if (result.data?.error)
    throw new IntelligenceClientError(
      result.data.error.code,
      result.data.error.message,
    );
  return result.data as {
    threadId: string;
    runId: string;
    response: IntelligenceResponse;
    contextManifest: ContextManifest;
  };
}
