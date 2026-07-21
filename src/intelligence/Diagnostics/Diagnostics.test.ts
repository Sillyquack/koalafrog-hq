import { describe, expect, it, vi } from "vitest";
import {
  executeValidation,
  intelligenceRuleCodes,
  intelligenceStages,
  IntelligenceTraceBuilder,
  type IntelligenceTraceEvent,
  providerDurationStats,
  ruleFrequencies,
  safeTraceEvent,
  topFailures,
  traceSummary,
  validateStructuredValue,
  verifyCleanup,
} from ".";

const event = (
  overrides: Partial<IntelligenceTraceEvent> = {},
): IntelligenceTraceEvent => ({
  stage: "SchemaValidation",
  result: "failed",
  elapsedMs: 4,
  supportId: "support-id",
  analysisId: "analysis-id",
  timestamp: "2026-07-21T12:00:00.000Z",
  ...overrides,
});

describe("shared intelligence diagnostics", () => {
  it("keeps the stable rule catalog unique and complete", () => {
    const codes = Object.values(intelligenceRuleCodes);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        "VAL-0001",
        "VAL-0002",
        "VAL-0003",
        "VAL-0004",
        "VAL-0010",
        "VAL-0011",
        "VAL-0012",
        "VAL-0013",
        "VAL-0014",
        "VAL-0020",
        "VAL-0030",
        "CLN-0003",
        "PRV-0001",
        "PRV-0002",
        "PRV-0003",
      ]),
    );
  });
  it.each(Object.values(intelligenceRuleCodes))(
    "serializes rule %s through the safety boundary",
    (ruleCode) => {
      expect(safeTraceEvent(event({ ruleCode })).ruleCode).toBe(ruleCode);
    },
  );
  it.each(intelligenceStages)(
    "records ordered start and finish events for %s",
    (stage) => {
      let now = 100;
      const trace = new IntelligenceTraceBuilder(
        "support",
        "analysis",
        () => now,
      );
      trace.start(stage);
      now = 125;
      trace.finish(stage, "succeeded");
      expect(
        trace.snapshot().events.map((x) => [x.stage, x.result, x.elapsedMs]),
      ).toEqual([[stage, "started", 0], [stage, "succeeded", 25]]);
    },
  );
  it("removes non-whitelisted metadata rather than logging content", () => {
    const unsafe = safeTraceEvent(
      Object.assign(event(), {
        jsonPath: "$.safe;prompt=secret",
        provider: "openai key=secret",
        model: "gpt-5",
        validator: "validator",
      }, {
        prompt: "secret",
        output: "private",
        imageUrl: "https://private",
      }) as IntelligenceTraceEvent,
    );
    const serialized = JSON.stringify(unsafe);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("https://");
    expect(unsafe.jsonPath).toBeUndefined();
    expect(unsafe.provider).toBe("redacted");
  });
  it("returns safe structural validation failures without rejected values", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["confidence"],
      properties: { confidence: { type: "number" } },
    };
    expect(validateStructuredValue({}, schema)).toMatchObject({
      success: false,
      ruleCode: "VAL-0010",
      jsonPath: "$.confidence",
      received: "missing",
    });
    expect(validateStructuredValue({ confidence: "private" }, schema)).toEqual(
      expect.objectContaining({
        success: false,
        ruleCode: "VAL-0011",
        jsonPath: "$.confidence",
        expected: "number",
        received: "string",
      }),
    );
    expect(
      JSON.stringify(
        validateStructuredValue({ confidence: "private" }, schema),
      ),
    ).not.toContain("private");
  });
  it("classifies cleanup acknowledgement and verification independently", () => {
    expect(
      verifyCleanup({
        requestedCount: 3,
        acknowledgedCount: 3,
        deleteError: false,
        verificationError: false,
        remainingCount: 0,
      }),
    ).toEqual({ success: true });
    expect(
      verifyCleanup({
        requestedCount: 3,
        acknowledgedCount: 2,
        deleteError: false,
        verificationError: false,
        remainingCount: 0,
      }).ruleCode,
    ).toBe("CLN-0002");
    expect(
      verifyCleanup({
        requestedCount: 3,
        acknowledgedCount: 3,
        deleteError: false,
        verificationError: false,
        remainingCount: 1,
      }).ruleCode,
    ).toBe("CLN-0003");
  });
  it("summarizes failures, frequencies, and provider timing", () => {
    const events = [
      event({
        stage: "ProviderInvocation",
        result: "succeeded",
        elapsedMs: 10,
      }),
      event({
        stage: "ProviderInvocation",
        result: "succeeded",
        elapsedMs: 30,
      }),
      event({ ruleCode: intelligenceRuleCodes.invalidJson }),
    ];
    expect(providerDurationStats(events)).toEqual({
      count: 2,
      averageMs: 20,
      medianMs: 20,
    });
    expect(ruleFrequencies(events)).toEqual({ "VAL-0004": 1 });
    expect(topFailures(events)).toEqual([{ ruleCode: "VAL-0004", count: 1 }]);
    expect(
      traceSummary({ supportId: "s", analysisId: "a", events }).lastFailure
        ?.ruleCode,
    ).toBe("VAL-0004");
  });
  it("classifies unknown validator exceptions without exception content", () => {
    const result = executeValidation(
      "ContractValidation",
      "test-validator",
      () => {
        throw new Error("private provider output");
      },
    );
    expect(result).toMatchObject({
      success: false,
      ruleCode: "VAL-0030",
      jsonPath: "$",
      validator: "test-validator",
    });
    expect(JSON.stringify(result)).not.toContain("private provider output");
  });
  it("does not depend on wall clock behavior", () => {
    const now = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(6);
    const trace = new IntelligenceTraceBuilder("s", "a", now);
    trace.start("ProviderInvocation");
    expect(trace.finish("ProviderInvocation", "succeeded").elapsedMs).toBe(5);
  });
});
