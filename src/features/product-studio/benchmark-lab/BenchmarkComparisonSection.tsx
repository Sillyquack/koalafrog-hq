import type { ReturnTypeOfBenchmarkComparison } from "./benchmarkLabUi";
import { displayBenchmarkLabel } from "./benchmarkLabUi";
import { AttributeMeter } from "./AttributeMeter";

interface BenchmarkComparisonSectionProps {
  comparison: ReturnTypeOfBenchmarkComparison;
}

export function BenchmarkComparisonSection({
  comparison,
}: BenchmarkComparisonSectionProps) {
  return (
    <section className="panel benchmark-section" id="target-comparison">
      <span className="eyebrow">
        7 / Benchmark observation versus Koalafrog target
      </span>
      <div className="comparison-table">
        <div className="comparison-head" aria-hidden="true">
          <strong>Attribute</strong>
          <strong>Benchmark observation</strong>
          <strong>Koalafrog target</strong>
          <strong>Priority</strong>
        </div>
        {comparison.map((row) => (
          <div key={row.label}>
            <strong data-label="Attribute">{row.label}</strong>
            <span data-label="Benchmark observation">
              <AttributeMeter
                attribute={row.label}
                observation={row.observation}
              />
            </span>
            <span data-label="Koalafrog target">
              {row.target.targetState === "known"
                ? row.target.targetValue || "Defined without value"
                : displayBenchmarkLabel(row.target.targetState)}
            </span>
            <span data-label="Priority">{displayBenchmarkLabel(row.priority)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
