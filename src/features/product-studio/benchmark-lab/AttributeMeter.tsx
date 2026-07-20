import type { BenchmarkScore } from "../domain/benchmarkLab";
import { attributeDescriptor } from "./attributeDescriptors";

export function AttributeMeter({
  attribute,
  observation,
}: {
  attribute: string;
  observation: BenchmarkScore;
}) {
  if (observation.state !== "scored") {
    const semantic = {
      not_tested: "Not tested — no observation recorded",
      unknown: "Unknown — state cannot currently be determined",
      not_applicable: "Not applicable — attribute does not apply",
    }[observation.state];
    return <span className="attribute-semantic">{semantic}</span>;
  }

  const score = observation.score!;
  const descriptor = attributeDescriptor(attribute, score);
  return (
    <span
      className="attribute-meter"
      aria-label={`${attribute}: ${descriptor}, ${score} out of 10`}
    >
      <span className="attribute-track" aria-hidden="true">
        <span style={{ width: `${score * 10}%` }} />
      </span>
      <span className="attribute-meter-copy">
        <span>{descriptor}</span>
        <strong>{score}/10</strong>
      </span>
    </span>
  );
}
