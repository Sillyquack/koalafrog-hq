import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  sanitizeProviderDiagnostic,
} from "../supabase/functions/_shared/providerDiagnostics";
describe("provider diagnostics", () => {
  it("classifies actionable provider failures", () => {
    expect(classifyProviderFailure(401)).toBe("provider_authentication");
    expect(classifyProviderFailure(429)).toBe("quota_billing_rate_limit");
    expect(classifyProviderFailure(404, "", "model_not_found")).toBe(
      "model_unavailable",
    );
    expect(classifyProviderFailure(400)).toBe("invalid_provider_request");
    expect(classifyProviderFailure(503)).toBe("provider_server_failure");
  });
  it("keeps only whitelisted diagnostic fields", () => {
    const diagnostic = sanitizeProviderDiagnostic({
      providerName: "openai",
      modelName: "model",
      category: "provider_authentication",
      httpStatus: 401,
      errorType: "invalid_request_error",
      errorCode: "invalid_api_key",
      requestId: "req_123",
      safeMessage: "Invalid key",
      threadId: "thread",
      runId: "run",
      apiKey: "forbidden",
      userPrompt: "forbidden",
      context: "forbidden",
    } as never);
    expect(diagnostic).toMatchObject({
      providerName: "openai",
      modelName: "model",
      httpStatus: 401,
      threadId: "thread",
      runId: "run",
    });
    expect(diagnostic).not.toHaveProperty("apiKey");
    expect(diagnostic).not.toHaveProperty("userPrompt");
    expect(diagnostic).not.toHaveProperty("context");
  });
  it("redacts credentials from provider messages", () => {
    const jwt = ["ey" + "Jaaa", "bbb", "ccc"].join(".");
    const diagnostic = sanitizeProviderDiagnostic({
      providerName: "openai",
      modelName: "model",
      category: "provider_authentication",
      safeMessage: `Bearer abc sk-secret ${jwt} authorization: hidden`,
    });
    const output = JSON.stringify(diagnostic);
    expect(output).not.toContain("abc");
    expect(output).not.toContain("sk-secret");
    expect(output).not.toContain("eyJaaa");
    expect(output).not.toContain("hidden");
    expect(output).toContain("[REDACTED]");
  });
});
