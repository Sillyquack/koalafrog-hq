import {
  createBenchmarkScore,
  scorecardDimensions,
  type BenchmarkLabDocument,
  type BenchmarkScoreState,
} from "../domain/benchmarkLab";
import { displayBenchmarkLabel } from "./benchmarkLabUi";
import { AttributeMeter } from "./AttributeMeter";

const scoreStateOptions = [
  "not_tested",
  "unknown",
  "not_applicable",
  "scored",
] as const;
const scorecardGroups = [
  ["Application", ["firmness", "glide", "drag", "payoff", "ease of application"]],
  ["After-feel", ["dry-down", "tack", "greasiness", "residue", "powderiness", "skin comfort"]],
  ["Appearance and physical behaviour", ["transparency", "colour", "surface appearance", "sweating or syneresis", "crumbling", "cracking", "shape retention", "packaging interaction"]],
  ["Performance", ["perceived deodorant performance", "perceived odour control", "white marks", "transfer to clothing", "longevity"]],
  ["Fragrance", ["initial fragrance intensity", "dry-down fragrance intensity", "projection", "fragrance longevity", "fragrance character", "user preference"]],
  ["Overall", ["overall score", "repurchase intention"]],
] as const;

interface BenchmarkScorecardSectionProps {
  scorecard: BenchmarkLabDocument["scorecard"];
  onChange: (value: BenchmarkLabDocument["scorecard"]) => void;
  onValidationMessage: (message: string) => void;
}

export function BenchmarkScorecardSection({
  scorecard,
  onChange,
  onValidationMessage,
}: BenchmarkScorecardSectionProps) {
  const updateScore = (
    dimension: (typeof scorecardDimensions)[number],
    state: BenchmarkScoreState,
  ) => {
    const current = scorecard.scores[dimension];
    onChange({
      ...scorecard,
      scores: {
        ...scorecard.scores,
        [dimension]: {
          ...createBenchmarkScore(state, state === "scored" ? 1 : undefined),
          notes: current.notes,
        },
      },
    });
  };

  const updateScoreValue = (
    dimension: (typeof scorecardDimensions)[number],
    score: number,
  ) => {
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      onValidationMessage(
        "Benchmark scores must be whole numbers from 1 to 10; zero is not Unknown.",
      );
      return;
    }
    onChange({
      ...scorecard,
      scores: {
        ...scorecard.scores,
        [dimension]: { ...scorecard.scores[dimension], score },
      },
    });
  };

  const updateNotes = (
    dimension: (typeof scorecardDimensions)[number],
    notes: string,
  ) =>
    onChange({
      ...scorecard,
      scores: {
        ...scorecard.scores,
        [dimension]: { ...scorecard.scores[dimension], notes },
      },
    });

  return (
    <section className="panel benchmark-section" id="observations">
      <span className="eyebrow">3 / User observations</span>
      <div className="benchmark-grid">
        <label>
          Evaluation date
          <input
            type="date"
            value={scorecard.evaluationDate ?? ""}
            onChange={(event) =>
              onChange({
                ...scorecard,
                evaluationDate: event.target.value || undefined,
              })
            }
          />
        </label>
        <label>
          Evaluator
          <input
            value={scorecard.evaluator}
            onChange={(event) =>
              onChange({ ...scorecard, evaluator: event.target.value })
            }
          />
        </label>
        <label>
          Test context
          <input
            value={scorecard.testContext}
            onChange={(event) =>
              onChange({ ...scorecard, testContext: event.target.value })
            }
          />
        </label>
        <label>
          Conditions entered by evaluator
          <input
            value={scorecard.conditions}
            onChange={(event) =>
              onChange({ ...scorecard, conditions: event.target.value })
            }
          />
        </label>
      </div>
      <div className="scorecard-groups">
        {scorecardGroups.map(([group, dimensions], groupIndex) => (
          <details key={group} open={groupIndex === 0}>
            <summary>
              <span>{group}</span>
              <small>{dimensions.length} observations</small>
            </summary>
            <div className="scorecard-grid">
        {dimensions.map((dimension) => {
          const value = scorecard.scores[dimension];
          return (
            <article key={dimension}>
              <strong>{dimension}</strong>
              <select
                aria-label={`${dimension} state`}
                value={value.state}
                onChange={(event) =>
                  updateScore(
                    dimension,
                    event.target.value as BenchmarkScoreState,
                  )
                }
              >
                {scoreStateOptions.map((option) => (
                  <option key={option} value={option}>
                    {displayBenchmarkLabel(option)}
                  </option>
                ))}
              </select>
              {value.state === "scored" && (
                <>
                  <input
                    aria-label={`${dimension} score`}
                    type="number"
                    min="1"
                    max="10"
                    value={value.score}
                    onChange={(event) =>
                      updateScoreValue(dimension, Number(event.target.value))
                    }
                  />
                  <AttributeMeter attribute={dimension} observation={value} />
                </>
              )}
              <small>
                {value.state === "not_tested"
                  ? "Not tested — no observation recorded."
                  : value.state === "unknown"
                    ? "Unknown — observation cannot be determined."
                    : value.state === "not_applicable"
                      ? "Not applicable in this context."
                      : "Observed user score, not a target."}
              </small>
              <label>
                Observation note <span className="optional">(optional)</span>
                <textarea
                  aria-label={`${dimension} observation note`}
                  value={value.notes}
                  placeholder="Record what you observed; this is not a target."
                  onChange={(event) => updateNotes(dimension, event.target.value)}
                />
              </label>
            </article>
          );
        })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
