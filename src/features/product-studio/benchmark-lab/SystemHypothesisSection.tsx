import type { BenchmarkLabDocument } from "../domain/benchmarkLab";
import { splitNonEmptyLines } from "./benchmarkLabUi";

const confidenceOptions = [
  "verified",
  "supported",
  "observed",
  "assumed",
  "unknown",
  "conflicting",
] as const;
const observationFields = [
  "supportingObservations",
  "contradictingObservations",
  "openQuestions",
] as const;
const observationLabels = {
  supportingObservations: "Supporting observations",
  contradictingObservations: "Contradicting observations",
  openQuestions: "Open questions",
} as const;

interface SystemHypothesisSectionProps {
  hypothesis: BenchmarkLabDocument["systemHypothesis"];
  onChange: (value: BenchmarkLabDocument["systemHypothesis"]) => void;
}

export function SystemHypothesisSection({
  hypothesis,
  onChange,
}: SystemHypothesisSectionProps) {
  return (
    <section
      className="panel benchmark-section"
      id="system-hypothesis"
      tabIndex={-1}
    >
      <span className="eyebrow">
        5 / System hypothesis — not verified knowledge
      </span>
      <label>
        Working hypothesis
        <small>
          A development interpretation only; it is not verified knowledge.
        </small>
        <textarea
          value={hypothesis.hypothesisText}
          onChange={(event) =>
            onChange({ ...hypothesis, hypothesisText: event.target.value })
          }
        />
      </label>
      <div className="benchmark-grid">
        <label>
          Physical system status
          <select
            value={hypothesis.physicalSystem.state}
            onChange={(event) =>
              onChange({
                ...hypothesis,
                physicalSystem:
                  event.target.value === "known"
                    ? {
                        state: "known",
                        value: hypothesis.physicalSystem.value ?? "",
                      }
                    : {
                        state: event.target.value as
                          | "unknown"
                          | "review_required"
                          | "not_applicable",
                      },
              })
            }
          >
            <option value="known">Working hypothesis</option>
            <option value="unknown">Unknown</option>
            <option value="review_required">Review required</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </label>
        {hypothesis.physicalSystem.state === "known" && (
          <label>
            Physical system
            <input
              value={hypothesis.physicalSystem.value ?? ""}
              onChange={(event) =>
                onChange({
                  ...hypothesis,
                  physicalSystem: {
                    state: "known",
                    value: event.target.value,
                  },
                })
              }
            />
          </label>
        )}
        <label>
          Confidence
          <select
            value={hypothesis.confidence}
            onChange={(event) =>
              onChange({
                ...hypothesis,
                confidence: event.target.value as typeof hypothesis.confidence,
              })
            }
          >
            {confidenceOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Evidence source
          <select
            value={hypothesis.evidenceSource}
            onChange={(event) =>
              onChange({
                ...hypothesis,
                evidenceSource: event.target
                  .value as typeof hypothesis.evidenceSource,
              })
            }
          >
            <option value="user_supplied_label">User-supplied label</option>
            <option value="internal_hypothesis">Internal hypothesis</option>
          </select>
        </label>
        <label>
          Review status
          <select
            value={hypothesis.reviewStatus}
            onChange={(event) =>
              onChange({
                ...hypothesis,
                reviewStatus: event.target
                  .value as typeof hypothesis.reviewStatus,
              })
            }
          >
            <option>unreviewed</option>
            <option>reviewed</option>
            <option>needs_review</option>
          </select>
        </label>
        <label>
          Last reviewed date
          <input
            type="date"
            value={hypothesis.lastReviewedDate ?? ""}
            onChange={(event) =>
              onChange({
                ...hypothesis,
                lastReviewedDate: event.target.value || undefined,
              })
            }
          />
        </label>
      </div>
      {observationFields.map((key) => (
        <label key={key}>
          {observationLabels[key]}
          <textarea
            value={hypothesis[key].join("\n")}
            onChange={(event) =>
              onChange({
                ...hypothesis,
                [key]: splitNonEmptyLines(event.target.value),
              })
            }
          />
        </label>
      ))}
    </section>
  );
}
