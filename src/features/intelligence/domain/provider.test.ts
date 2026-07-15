import { describe, expect, it } from "vitest";
import { DeterministicTestIntelligenceProvider } from "./provider";
import { validIntelligenceFixture } from "./intelligenceContract.test";
describe("test Intelligence provider", () => {
  it("returns deterministic structured output only when explicitly constructed", async () => {
    const provider = new DeterministicTestIntelligenceProvider(
      validIntelligenceFixture,
    );
    expect(await provider.analyze()).toEqual(validIntelligenceFixture);
  });
});
