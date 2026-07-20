import type { benchmarkTargetComparison } from "../domain/benchmarkLab";

export type ReturnTypeOfBenchmarkComparison = ReturnType<
  typeof benchmarkTargetComparison
>;

export function updateArrayItem<T>(
  items: T[],
  index: number,
  update: (item: T) => T,
) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? update(item) : item,
  );
}

export function splitNonEmptyLines(value: string) {
  return value.split("\n").filter(Boolean);
}

export function displayBenchmarkLabel(value: string) {
  return value.replaceAll("_", " ");
}
