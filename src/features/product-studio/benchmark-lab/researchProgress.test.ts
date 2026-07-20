import { describe, expect, it } from "vitest";
import {
  benchmarkLabReadiness,
  createBenchmarkLabDocument,
} from "../domain/benchmarkLab";
import {
  countOpenResearchQuestions,
  deriveResearchProgress,
} from "./researchProgress";

describe("Benchmark Lab research progress", () => {
  it("does not reward untouched seeded defaults", () => {
    const progress = deriveResearchProgress(createBenchmarkLabDocument());
    expect(progress.completed).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.maturity).toBe("Idea");
  });

  it("scores meaningful workflow completion deterministically", () => {
    const document = createBenchmarkLabDocument();
    document.workingTitle = "Reviewed deodorant concept";
    document.scorecard.scores.glide = {
      state: "scored",
      score: 9,
      notes: "Observed",
    };
    document.brief.userNeed = "Comfortable daily application";
    document.brief.constraints[0].state = "known";
    document.brief.targets[1] = {
      ...document.brief.targets[1],
      targetState: "known",
      targetValue: "9/10",
      priority: "critical",
    };
    document.systemHypothesis.reviewStatus = "reviewed";
    document.functionalRequirements[0].status = "required";
    document.functionalRequirements[0].reviewStatus = "reviewed";
    expect(deriveResearchProgress(document)).toMatchObject({
      completed: 10,
      percent: 91,
      maturity: "Draft ready",
    });
  });

  it("counts an explicitly reviewed Unknown hypothesis without treating defaults as reviewed", () => {
    const document = createBenchmarkLabDocument();
    document.systemHypothesis.physicalSystem = { state: "unknown" };
    expect(deriveResearchProgress(document).items.find((item) => item.id === "hypothesis")?.complete).toBe(false);
    document.systemHypothesis.reviewStatus = "reviewed";
    expect(deriveResearchProgress(document).items.find((item) => item.id === "hypothesis")?.complete).toBe(true);
  });

  it("derives restrained maturity labels", () => {
    const document = createBenchmarkLabDocument();
    document.workingTitle = "Changed concept";
    expect(deriveResearchProgress(document).maturity).toBe("Guided research");
    expect(deriveResearchProgress(document, true).maturity).toBe("Draft created");
  });

  it("counts only non-empty recorded questions", () => {
    const document = createBenchmarkLabDocument();
    document.systemHypothesis.openQuestions = ["First?", "  ", ""];
    document.functionalRequirements[0].openQuestions = "Second?";
    document.functionalRequirements[1].rationale = "Third?";
    document.functionalRequirements[2].reviewStatus = "research_needed";
    expect(countOpenResearchQuestions(document)).toBe(2);
  });

  it("follows explicit requirement review state rather than importance", () => {
    const document = createBenchmarkLabDocument();
    const progressItem = () =>
      deriveResearchProgress(document).items.find(
        (item) => item.id === "requirement",
      )?.complete;
    document.functionalRequirements[0].status = "required";
    expect(progressItem()).toBe(false);
    document.functionalRequirements[0].reviewStatus = "research_needed";
    expect(progressItem()).toBe(false);
    document.functionalRequirements[0].reviewStatus = "reviewed";
    expect(progressItem()).toBe(true);
    document.functionalRequirements[0].reviewStatus = "not_applicable";
    expect(progressItem()).toBe(true);
  });

  it("uses the Formula Gate items for the readiness completed count", () => {
    const document = createBenchmarkLabDocument();
    document.brief.constraints[0].state = "known";
    const readiness = benchmarkLabReadiness(document);
    expect(readiness.items.filter((item) => item.ready)).toHaveLength(4);
  });
});
