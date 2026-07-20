import { describe, expect, it } from "vitest";
import {
  displayBenchmarkLabel,
  splitNonEmptyLines,
  updateArrayItem,
} from "./benchmarkLabUi";

describe("Benchmark Lab UI helpers", () => {
  it("updates only the selected array item without mutation", () => {
    const source = [{ value: "a" }, { value: "b" }];
    const updated = updateArrayItem(source, 1, (item) => ({
      ...item,
      value: "changed",
    }));
    expect(updated).toEqual([{ value: "a" }, { value: "changed" }]);
    expect(source).toEqual([{ value: "a" }, { value: "b" }]);
  });

  it("preserves the existing non-empty line semantics", () => {
    expect(splitNonEmptyLines("first\n\nsecond\n")).toEqual([
      "first",
      "second",
    ]);
  });

  it("formats stored enum labels for display", () => {
    expect(displayBenchmarkLabel("not_tested")).toBe("not tested");
  });
});
