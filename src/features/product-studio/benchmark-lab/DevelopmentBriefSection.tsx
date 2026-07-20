import type { BenchmarkLabDocument } from "../domain/benchmarkLab";
import {
  displayBenchmarkLabel,
  splitNonEmptyLines,
  updateArrayItem,
} from "./benchmarkLabUi";

const intentFields = [
  "userNeed",
  "intendedUse",
  "intendedUser",
  "usageContext",
  "desiredPositioning",
  "differentiation",
] as const;
const intentCopy: Record<(typeof intentFields)[number], { label: string; help: string }> = {
  userNeed: { label: "What user need should this product solve?", help: "Describe the practical problem or experience to improve." },
  intendedUse: { label: "How will the product be used?", help: "Capture the intended application and routine." },
  intendedUser: { label: "Who are we developing it for?", help: "Describe the intended user without turning it into a validated claim." },
  usageContext: { label: "In what situations will it be used?", help: "For example, daily use, travel, or warm conditions." },
  desiredPositioning: { label: "How should it be positioned?", help: "Record the intended product character and market context." },
  differentiation: { label: "How should the Koalafrog product differ from the benchmark?", help: "Keep the development intent distinct from copying the reference." },
};
const priorities = ["unreviewed", "low", "medium", "high", "critical"] as const;
const constraintStates = [
  ["unknown", "Unknown / unselected"],
  ["known", "Selected"],
  ["not_applicable", "Not applicable"],
  ["review_required", "Review required"],
] as const;

interface DevelopmentBriefSectionProps {
  brief: BenchmarkLabDocument["brief"];
  onChange: (value: BenchmarkLabDocument["brief"]) => void;
}

export function DevelopmentBriefSection({
  brief,
  onChange,
}: DevelopmentBriefSectionProps) {
  return (
    <section className="panel benchmark-section" id="development-brief">
      <span className="eyebrow">4 / Development brief</span>
      <div className="benchmark-grid">
        {intentFields.map((key) => (
          <label key={key}>
            {intentCopy[key].label}
            <small>{intentCopy[key].help}</small>
            <textarea
              value={brief[key]}
              onChange={(event) =>
                onChange({ ...brief, [key]: event.target.value })
              }
            />
          </label>
        ))}
      </div>
      <h3>Constraints</h3>
      <div className="benchmark-grid">
        {brief.constraints.map((constraint, index) => (
          <fieldset className="constraint-card" key={constraint.id}>
            <legend>{constraint.label}</legend>
            <div className="state-segments">
              {constraintStates.map(([state, label]) => (
                <button
                  type="button"
                  key={state}
                  aria-pressed={constraint.state === state}
                  onClick={() =>
                    onChange({
                      ...brief,
                      constraints: updateArrayItem(
                        brief.constraints,
                        index,
                        (item) => ({
                          ...item,
                          state,
                        }),
                      ),
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <h3>Desired characteristics</h3>
      <div className="target-grid">
        {brief.targets.map((target, index) => (
          <article key={target.id}>
            <strong>{target.label}</strong>
            <label>
            Target status
            <select
              aria-label={`${target.label} target state`}
              value={target.targetState}
              onChange={(event) =>
                onChange({
                  ...brief,
                  targets: updateArrayItem(brief.targets, index, (item) => ({
                    ...item,
                    targetState: event.target.value as typeof item.targetState,
                  })),
                })
              }
            >
              <option value="unknown">Unknown</option>
              <option value="known">Defined target</option>
              <option value="not_applicable">Not applicable</option>
              <option value="review_required">Review required</option>
            </select>
            </label>
            {target.targetState === "known" && (
              <label>
              Target
              <input
                aria-label={`${target.label} target value`}
                value={target.targetValue ?? ""}
                onChange={(event) =>
                  onChange({
                    ...brief,
                    targets: updateArrayItem(brief.targets, index, (item) => ({
                      ...item,
                      targetValue: event.target.value,
                    })),
                  })
                }
              />
              </label>
            )}
            <label>
            Priority
            <select
              aria-label={`${target.label} priority`}
              value={target.priority}
              onChange={(event) =>
                onChange({
                  ...brief,
                  targets: updateArrayItem(brief.targets, index, (item) => ({
                    ...item,
                    priority: event.target.value as typeof item.priority,
                  })),
                })
              }
            >
              {priorities.map((option) => (
                <option key={option}>{displayBenchmarkLabel(option)}</option>
              ))}
            </select>
            </label>
            <label>
              Notes <span className="optional">(optional)</span>
              <textarea
                value={target.notes}
                onChange={(event) =>
                  onChange({
                    ...brief,
                    targets: updateArrayItem(brief.targets, index, (item) => ({
                      ...item,
                      notes: event.target.value,
                    })),
                  })
                }
              />
            </label>
          </article>
        ))}
      </div>
      <label>
        Success criteria — editable, user-defined
        <textarea
          value={brief.successCriteria.map((item) => item.text).join("\n")}
          placeholder="Add one measurable or testable criterion per line"
          onChange={(event) =>
            onChange({
              ...brief,
              successCriteria: splitNonEmptyLines(event.target.value).map(
                (text, index) => ({
                  id: `criterion-${index + 1}`,
                  text,
                  status: "selected",
                  notes: "",
                }),
              ),
            })
          }
        />
      </label>
    </section>
  );
}
