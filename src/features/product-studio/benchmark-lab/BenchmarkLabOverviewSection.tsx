import type { BenchmarkLabDocument } from "../domain/benchmarkLab";

interface BenchmarkLabOverviewSectionProps {
  document: BenchmarkLabDocument;
  onChange: <K extends keyof BenchmarkLabDocument>(
    key: K,
    value: BenchmarkLabDocument[K],
  ) => void;
}

export function BenchmarkLabOverviewSection({
  document,
  onChange,
}: BenchmarkLabOverviewSectionProps) {
  return (
    <section className="panel benchmark-section" id="overview">
      <span className="eyebrow">1 / Product concept</span>
      <div className="benchmark-grid">
        <label>
          Working title
          <input
            value={document.workingTitle}
            onChange={(event) => onChange("workingTitle", event.target.value)}
          />
        </label>
        <label>
          Category
          <input
            value={document.productCategory}
            onChange={(event) => onChange("productCategory", event.target.value)}
          />
        </label>
        <label>
          Format
          <input
            value={document.productFormat}
            onChange={(event) => onChange("productFormat", event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={document.projectStatus}
            onChange={(event) =>
              onChange(
                "projectStatus",
                event.target.value as BenchmarkLabDocument["projectStatus"],
              )
            }
          >
            <option>Idea</option>
            <option>Play</option>
          </select>
        </label>
      </div>
      <label>
        User objective
        <textarea
          value={document.objective}
          onChange={(event) => onChange("objective", event.target.value)}
        />
      </label>
    </section>
  );
}
